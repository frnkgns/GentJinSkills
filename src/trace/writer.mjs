import { createInterface } from "node:readline"
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname } from "node:path"
import taskEventSchema from "../../schemas/task-event.schema.json" with { type: "json" }
import { validate } from "../schema/validate.mjs"
import { redact } from "../memory/failure-awareness.mjs"
import { nextEventId } from "./ids.mjs"

export const EXPECTED_HOOKS = [
  "tool.execute.before",
  "tool.execute.after",
  "event",
  "chat.message",
  "permission.ask",
]

export class TraceWriter {
  constructor(options = {}) {
    this.taskId = options.taskId
    this.projectId = options.projectId
    this.sessionId = options.sessionId ?? null
    this.file = options.file ?? options.dir
    this.maxPayloadLength = options.maxPayloadLength ?? 2000
    this.retentionDays = options.retentionDays ?? 14
    this.failures = []
    this.written = 0
    this.rejected = 0
    this.openSpans = new Map()
    this.coverage = new Map()
    this.#ensureDir()
    this.stream = createWriteStream(this.file, { flags: "a" })
    this.stream.on("error", (error) => {
      this.failures.push({ at: new Date().toISOString(), error: error.message, fatal: false })
    })
  }

  #ensureDir() {
    const dir = dirname(this.file)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  bindSession(sessionId) {
    if (!this.sessionId && typeof sessionId === "string") this.sessionId = sessionId
  }

  #markCoverage(hook, captured, missing) {
    const current = this.coverage.get(hook) ?? { captured: new Set(), missing: new Set(), calls: 0 }
    for (const f of captured) current.captured.add(f)
    for (const f of missing) current.missing.add(f)
    current.calls += 1
    this.coverage.set(hook, current)
  }

  append(event) {
    const record = {
      schema_version: 1,
      session_id: this.sessionId,
      parent_event_id: null,
      span_id: null,
      skill: null,
      tool: null,
      outcome: "unknown",
      duration_ms: null,
      evidence_reference: null,
      error_category: null,
      payload: null,
      payload_truncated: false,
      usage: null,
      instrumentation: null,
      ...event,
      task_id: event.task_id ?? this.taskId,
      project_id: event.project_id ?? this.projectId,
    }

    const result = validate(record, taskEventSchema)
    if (!result.valid) {
      this.rejected += 1
      this.failures.push({
        at: new Date().toISOString(),
        error: "schema validation failed",
        detail: result.errors.map((e) => `${e.path}: ${e.message}`),
        fatal: false,
      })
      return { accepted: false, errors: result.errors }
    }

    if (record.payload) {
      record.payload = redactPayload(record.payload, this.maxPayloadLength)
      record.payload_truncated = record.payload.__truncated === true
      delete record.payload.__truncated
    }

    try {
      this.stream.write(`${JSON.stringify(record)}\n`)
      this.written += 1
    } catch (error) {
      this.failures.push({ at: new Date().toISOString(), error: error.message, fatal: false })
      return { accepted: false, errors: [{ message: error.message }] }
    }

    return { accepted: true, event: record }
  }

  onToolExecuteBefore(input, output) {
    const spanId = `span-${this.written + 1}`
    this.openSpans.set(spanId, { startedAt: Date.now(), tool: input?.tool ?? null })
    this.#markCoverage("tool.execute.before", ["tool", "args"], ["model_reasoning"])
    return spanId
  }

  onToolExecuteAfter(input, output, spanId, startedAt) {
    const started = startedAt ?? this.openSpans.get(spanId)?.startedAt ?? Date.now()
    const duration = Date.now() - started
    if (spanId) this.openSpans.delete(spanId)
    const isError = Boolean(output?.error ?? (typeof output?.exitCode === "number" && output.exitCode !== 0))
    const exitCode = typeof output?.exitCode === "number" ? output.exitCode : null

    this.#markCoverage(
      "tool.execute.after",
      ["tool", "output", "duration_ms", "outcome"],
      exitCode === null ? ["exit_code"] : [],
    )

    return this.append({
      event_id: nextEventId(),
      timestamp: new Date().toISOString(),
      phase: "act",
      event_type: isError ? "action.failed" : "action.executed",
      source: "observed",
      tool: input?.tool ?? null,
      outcome: isError ? "error" : "ok",
      duration_ms: duration,
      exit_code: exitCode,
      error_category: isError ? classifyError(output) : null,
      payload: summarizeOutput(output),
      instrumentation: {
        hook: "tool.execute.after",
        captured_fields: ["tool", "output", "duration_ms"],
        missing_fields: exitCode === null ? ["exit_code"] : [],
      },
    })
  }

  coverageReport() {
    const hooks = []
    for (const hook of EXPECTED_HOOKS) {
      const seen = this.coverage.get(hook)
      hooks.push({
        hook,
        observed: Boolean(seen),
        calls: seen?.calls ?? 0,
        captured_fields: seen ? [...seen.captured].sort() : [],
        missing_fields: seen ? [...seen.missing].sort() : ["not observed in this run"],
      })
    }
    return {
      hooks,
      unobserved_hooks: hooks.filter((h) => !h.observed).map((h) => h.hook),
      events_written: this.written,
      events_rejected: this.rejected,
      incomplete: this.rejected > 0 || this.failures.length > 0,
      failure_count: this.failures.length,
      note:
        "Coverage describes this run only. An unobserved hook means the trace has a gap, not that the action did not occur.",
    }
  }

  async close() {
    await new Promise((resolve) => this.stream.end(resolve))
    return { written: this.written, rejected: this.rejected, failures: this.failures }
  }
}

function redactPayload(payload, maxLength) {
  const walk = (value, depth = 0) => {
    if (depth > 6) return "[REDACTED_DEPTH_LIMIT]"
    if (typeof value === "string") return redact(value, { maxLength }).text
    if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1))
    if (value !== null && typeof value === "object") {
      const out = {}
      for (const [key, v] of Object.entries(value)) {
        out[key] = /pass|secret|token|key|auth|password|credential/i.test(key)
          ? "[REDACTED]"
          : walk(v, depth + 1)
      }
      return out
    }
    return value
  }

  const cleaned = walk(payload)
  const serialized = JSON.stringify(cleaned)
  if (serialized.length <= maxLength) return cleaned

  return {
    summary: `[TRUNCATED ${serialized.length} chars]`,
    head: serialized.slice(0, Math.floor(maxLength / 2)),
    __truncated: true,
  }
}

function summarizeOutput(output) {
  if (output === undefined || output === null) return null
  if (typeof output === "string") return { text: output.slice(0, 500) }
  if (typeof output === "object") {
    const summary = {}
    for (const key of ["title", "output", "stdout", "stderr", "metadata"]) {
      if (output[key] !== undefined) summary[key] = output[key]
    }
    return Object.keys(summary).length > 0 ? summary : null
  }
  return { value: String(output) }
}

function classifyError(output) {
  const text = JSON.stringify(output ?? "").toLowerCase()
  if (text.includes("enoent")) return "not_found"
  if (text.includes("eacces") || text.includes("permission")) return "permission_denied"
  if (text.includes("etimedout") || text.includes("timeout")) return "timeout"
  if (text.includes("econnrefused")) return "connection_refused"
  if (text.includes("syntaxerror") || text.includes("parse")) return "invalid_input"
  return "unknown"
}

export function readTrace(file) {
  if (!existsSync(file)) return []
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return { ok: true, event: JSON.parse(line) }
      } catch (error) {
        return { ok: false, line: index + 1, error: error.message }
      }
    })
}

export function assertTraceIntegrity(entries) {
  const problems = []
  const seen = new Set()
  for (const entry of entries) {
    if (!entry.ok) {
      problems.push(`line ${entry.line} is malformed JSON: ${entry.error}`)
      continue
    }
    const result = validate(entry.event, taskEventSchema)
    if (!result.valid) {
      problems.push(
        `event ${entry.event?.event_id ?? "unknown"} is schema-invalid: ` +
          result.errors.map((e) => `${e.path} ${e.message}`).join("; "),
      )
    }
    if (seen.has(entry.event.event_id)) problems.push(`duplicate event_id ${entry.event.event_id}`)
    seen.add(entry.event.event_id)
    if (entry.event.source === "observed" && entry.event.duration_ms === null && entry.event.event_type === "action.executed") {
      problems.push(`event ${entry.event.event_id} claims an executed action with no measured duration`)
    }
  }
  return { ok: problems.length === 0, problems, count: entries.length }
}

export function orderingCheck(entries) {
  const events = entries.filter((e) => e.ok).map((e) => e.event)
  const problems = []
  const finished = new Set()
  for (const event of events) {
    if (event.parent_event_id && !finished.has(event.parent_event_id)) {
      problems.push(`event ${event.event_id} references parent ${event.parent_event_id} that has not completed`)
    }
    if (event.event_type === "task.finished") finished.add(event.event_id)
    else if (event.parent_event_id) finished.add(event.parent_event_id)
  }
  const started = events.filter((e) => e.event_type === "task.started")
  if (started.length > 1) problems.push(`${started.length} task.started events found; a task should start once`)
  return { ok: problems.length === 0, problems }
}

export async function traceFromStdin(stream = process.stdin) {
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  const events = []
  for await (const line of rl) {
    if (!line.trim()) continue
    events.push(JSON.parse(line))
  }
  return events
}

export { nextEventId }