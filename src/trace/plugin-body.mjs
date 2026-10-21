import { mkdirSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { homedir } from "node:os"
import { join } from "node:path"
import { TraceWriter } from "./writer.mjs"
import { PLUGIN_NAME } from "./plugin-support.mjs"

function hexId(prefix, bytes = 6) {
  return `${prefix}-${randomBytes(bytes).toString("hex")}`
}

function hashString(value) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return hash
}

function numericExitCode(result) {
  for (const candidate of [result?.exitCode, result?.metadata?.exitCode]) {
    if (typeof candidate === "number") return candidate
  }
  return null
}

/**
 * OpenCode 2 reports a tool call as a single event carrying either a result or an error. The
 * trace writer reasons about the older { error, exitCode } pair, so the event is normalized here
 * instead of teaching the writer and its tests about the transport.
 */
function toToolOutput(event) {
  if (event?.status === "error") return { error: event.error }
  const result = event?.result
  const exitCode = numericExitCode(result)
  return { output: result, ...(exitCode === null ? {} : { exitCode }) }
}

export async function registerTracePlugin(ctx) {
  const traceDir = resolveTraceDir()
  try {
    mkdirSync(traceDir, { recursive: true })
  } catch {
    // A trace directory that cannot be created must not stop the plugin from loading.
  }

  let trace = null
  let loadError = null

  const ensureTrace = (sessionId) => {
    if (loadError) return null
    try {
      if (!trace) {
        const file = join(traceDir, `${Date.now()}-${randomBytes(4).toString("hex")}.jsonl`)
        trace = new TraceWriter({
          taskId: process.env.OVERGEARED_SKILLS_TASK_ID ?? process.env.GENTJIN_TASK_ID ?? hexId("task"),
          projectId: resolveProjectId(ctx),
          sessionId: sessionId ?? null,
          file,
        })
      }
      trace.bindSession(sessionId)
      return trace
    } catch (error) {
      loadError = error
      return null
    }
  }

  const spans = new Map()

  await ctx.tool.hook("execute.before", async (event) => {
    const writer = ensureTrace(event?.sessionID)
    if (!writer) return
    const spanId = `span-${Date.now()}-${Math.abs(hashString(String(event?.tool ?? "")))}`
    spans.set(spanId, Date.now())
  })

  await ctx.tool.hook("execute.after", async (event) => {
    const writer = ensureTrace(event?.sessionID)
    if (!writer) return
    const spanId = [...spans.keys()].pop()
    const startedAt = spanId ? spans.get(spanId) : Date.now()
    if (spanId) spans.delete(spanId)
    writer.onToolExecuteAfter({ tool: event?.tool }, toToolOutput(event), spanId, startedAt)
  })

  await ctx.session.hook("context", async (event) => {
    const writer = ensureTrace(event?.sessionID)
    if (!writer) return
    writer.append({
      event_id: hexId("evt"),
      timestamp: new Date().toISOString(),
      phase: "observe",
      event_type: "task.started",
      source: "observed",
      outcome: "ok",
      payload: { message_count: Array.isArray(event?.messages) ? event.messages.length : null },
      instrumentation: {
        hook: "chat.message",
        captured_fields: ["message_count"],
        missing_fields: ["message_text"],
      },
    })
  })

  await ctx.permission.hook("evaluate", async (event) => {
    const writer = ensureTrace(event?.sessionID)
    if (!writer) return
    writer.append({
      event_id: hexId("evt"),
      timestamp: new Date().toISOString(),
      phase: "act",
      event_type: "action.executed",
      source: "observed",
      outcome: "ok",
      payload: { action: event?.action ?? null, resources: event?.resources ?? null },
      instrumentation: {
        hook: "permission.ask",
        captured_fields: ["action", "resources"],
        missing_fields: [],
      },
    })
  })

  const controller = new AbortController()
  void (async () => {
    for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
      const writer = ensureTrace()
      if (!writer || !event?.type) continue
      writer.append({
        event_id: hexId("evt"),
        timestamp: new Date().toISOString(),
        phase: "act",
        event_type: "runtime.event",
        source: "observed",
        outcome: "unknown",
        payload: { runtime_event_type: event.type, properties: event.properties ?? null },
        instrumentation: {
          hook: "event",
          captured_fields: ["type", "properties"],
          missing_fields: ["model_reasoning"],
        },
      })
    }
  })()

  return () => controller.abort()
}

export function resolveTraceDir() {
  if (process.env.OVERGEARED_SKILLS_TRACE_DIR) return process.env.OVERGEARED_SKILLS_TRACE_DIR
  if (process.env.GENTJIN_TRACE_DIR) return process.env.GENTJIN_TRACE_DIR
  return join(homedir(), ".local", "state", "overgeared-skills", "traces")
}

export function resolveProjectId(ctx) {
  return (
    ctx?.location?.project?.id ??
    process.env.OVERGEARED_SKILLS_PROJECT_ID ??
    process.env.GENTJIN_PROJECT_ID ??
    PLUGIN_NAME
  )
}