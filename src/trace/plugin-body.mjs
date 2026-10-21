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

async function logToOpenCode(ctx, level, message) {
  try {
    await ctx?.client?.app?.log({ body: { service: PLUGIN_NAME, level, message } })
  } catch {
    // Logging must never break the session.
  }
}

export async function createTracePlugin(ctx) {
  const traceDir = resolveTraceDir()
  mkdirSync(traceDir, { recursive: true })

  let trace = null
  let loadError = null

  const ensureTrace = async () => {
    if (trace) return trace
    if (loadError) return null
    try {
      const file = join(traceDir, `${Date.now()}-${randomBytes(4).toString("hex")}.jsonl`)
      trace = new TraceWriter({
        taskId: process.env.OVERGEARED_SKILLS_TASK_ID ?? hexId("task"),
        projectId: resolveProjectId(ctx),
        sessionId: ctx?.sessionID ?? null,
        file,
      })
      return trace
    } catch (error) {
      loadError = error
      await logToOpenCode(ctx, "error", `trace writer unavailable: ${error.message}`)
      return null
    }
  }

  const spans = new Map()

  return {
    "tool.execute.before": async (input) => {
      const writer = await ensureTrace()
      if (!writer) return
      const spanId = `span-${Date.now()}-${Math.abs(hashString(String(input?.tool ?? "")))}`
      spans.set(spanId, Date.now())
    },

    "tool.execute.after": async (input, output) => {
      const writer = await ensureTrace()
      if (!writer) return
      const spanId = [...spans.keys()].pop()
      const startedAt = spanId ? spans.get(spanId) : Date.now()
      if (spanId) spans.delete(spanId)
      writer.onToolExecuteAfter(input, output, spanId, startedAt)
    },

    event: async ({ event }) => {
      const writer = await ensureTrace()
      if (!writer || !event?.type) return
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
    },

    "chat.message": async (_input, output) => {
      const writer = await ensureTrace()
      if (!writer) return
      writer.append({
        event_id: hexId("evt"),
        timestamp: new Date().toISOString(),
        phase: "observe",
        event_type: "task.started",
        source: "observed",
        outcome: "ok",
        payload: { message_count: Array.isArray(output?.messages) ? output.messages.length : null },
        instrumentation: {
          hook: "chat.message",
          captured_fields: ["message_count"],
          missing_fields: ["message_text"],
        },
      })
    },

    "permission.ask": async (input) => {
      const writer = await ensureTrace()
      if (!writer) return
      writer.append({
        event_id: hexId("evt"),
        timestamp: new Date().toISOString(),
        phase: "act",
        event_type: "action.executed",
        source: "observed",
        outcome: "ok",
        payload: { permission: input?.permission ?? null, patterns: input?.patterns ?? null },
        instrumentation: {
          hook: "permission.ask",
          captured_fields: ["permission", "patterns"],
          missing_fields: [],
        },
      })
    },
  }
}

export function resolveTraceDir() {
  if (process.env.OVERGEARED_SKILLS_TRACE_DIR) return process.env.OVERGEARED_SKILLS_TRACE_DIR
  return join(homedir(), ".local", "state", "overgeared-skills", "traces")
}

export function resolveProjectId(ctx) {
  return ctx?.project?.id ?? ctx?.project?.name ?? process.env.OVERGEARED_SKILLS_PROJECT_ID ?? "unknown"
}