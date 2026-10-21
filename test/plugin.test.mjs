import test, { after } from "node:test"
import assert from "node:assert/strict"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import tracePlugin from "../plugins/overgeared-skills-trace.js"
import { registerTracePlugin } from "../src/trace/plugin-body.mjs"
import { pluginManifest, traceDirIsOutsideRepo, PLUGIN_NAME } from "../src/trace/plugin-support.mjs"
import { readTrace, assertTraceIntegrity } from "../src/trace/writer.mjs"

import { rmSync, writeFileSync, readdirSync, mkdirSync } from "node:fs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const traceDir = join(repoRoot, ".tmp-trace-test")

process.env.OVERGEARED_SKILLS_TRACE_DIR = traceDir

after(() => {
  rmSync(traceDir, { recursive: true, force: true })
})

function createEventQueue() {
  const items = []
  let wake = null
  return {
    push(item) {
      items.push(item)
      wake?.()
      wake = null
    },
    stream(signal) {
      return {
        async *[Symbol.asyncIterator]() {
          while (!signal?.aborted) {
            while (items.length > 0) yield items.shift()
            await new Promise((resolve) => {
              wake = resolve
              signal?.addEventListener("abort", resolve, { once: true })
            })
          }
        },
      }
    },
  }
}

async function mountTracePlugin(directory = repoRoot) {
  const registered = { tool: {}, session: {}, permission: {} }
  const queue = createEventQueue()
  const ctx = {
    location: { directory, project: { id: "gentjin" } },
    tool: {
      hook: async (name, callback) => {
        registered.tool[name] = callback
        return { dispose: async () => {} }
      },
    },
    session: {
      hook: async (name, callback) => {
        registered.session[name] = callback
        return { dispose: async () => {} }
      },
    },
    permission: {
      hook: async (name, callback) => {
        registered.permission[name] = callback
        return { dispose: async () => {} }
      },
    },
    event: {
      subscribe: (options) => queue.stream(options?.signal),
    },
  }
  const cleanup = await registerTracePlugin(ctx)
  return { registered, queue, cleanup }
}

test("the plugin default export is the definition object OpenCode 2 requires", () => {
  assert.equal(typeof tracePlugin, "object")
  assert.equal(tracePlugin.id, "overgeared-skills-trace")
  assert.equal(typeof tracePlugin.setup, "function")
})

test("the plugin module exports nothing else", async () => {
  const mod = await import("../plugins/overgeared-skills-trace.js")
  assert.deepEqual(Object.keys(mod), ["default"])
})

test("setup registers exactly the hooks the trace format depends on", async () => {
  const { registered, cleanup } = await mountTracePlugin()
  await cleanup()

  assert.deepEqual(Object.keys(registered.tool).sort(), ["execute.after", "execute.before"])
  assert.deepEqual(Object.keys(registered.session), ["context"])
  assert.deepEqual(Object.keys(registered.permission), ["evaluate"])
})

test("plugin manifest names its install location and required hooks", () => {
  assert.equal(pluginManifest.name, PLUGIN_NAME)
  assert.match(pluginManifest.location, /~\/\.config\/opencode\/plugins\//)
  assert.ok(pluginManifest.required_hooks.includes("tool.execute.after"))
  assert.match(pluginManifest.coverage_note, /not observable/)
})

test("the default trace directory lives outside the repository", () => {
  const saved = process.env.OVERGEARED_SKILLS_TRACE_DIR
  delete process.env.OVERGEARED_SKILLS_TRACE_DIR
  try {
    assert.equal(traceDirIsOutsideRepo(repoRoot), true)
  } finally {
    if (saved !== undefined) process.env.OVERGEARED_SKILLS_TRACE_DIR = saved
  }
})

test("an overridden trace directory inside the repo is detected as unsafe", () => {
  const saved = process.env.OVERGEARED_SKILLS_TRACE_DIR
  process.env.OVERGEARED_SKILLS_TRACE_DIR = join(repoRoot, "traces")
  try {
    assert.equal(traceDirIsOutsideRepo(repoRoot), false)
  } finally {
    if (saved === undefined) delete process.env.OVERGEARED_SKILLS_TRACE_DIR
    else process.env.OVERGEARED_SKILLS_TRACE_DIR = saved
  }
})

test("a live plugin run produces a schema-valid, correlated trace", async () => {
  const dir = traceDir
  const { registered, queue, cleanup } = await mountTracePlugin()

  await registered.tool["execute.before"]({ tool: "shell", sessionID: "s1", input: { command: "npm test" } })
  await registered.tool["execute.after"]({
    tool: "shell",
    sessionID: "s1",
    input: { command: "npm test" },
    status: "completed",
    result: { metadata: { exitCode: 0 }, title: "npm test" },
  })
  await registered.tool["execute.before"]({ tool: "read", sessionID: "s1", input: { filePath: "AGENTS.md" } })
  await registered.tool["execute.after"]({
    tool: "read",
    sessionID: "s1",
    input: { filePath: "AGENTS.md" },
    status: "completed",
    result: { title: "AGENTS.md" },
  })
  queue.push({ type: "session.idle", properties: {} })
  await registered.session.context({ sessionID: "s1", messages: [{}] })

  await new Promise((resolve) => setTimeout(resolve, 200))
  await cleanup()

  mkdirSync(dir, { recursive: true })
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"))
  assert.ok(files.length > 0, "plugin should have written a trace")

  const entries = readTrace(join(dir, files[files.length - 1]))
  const integrity = assertTraceIntegrity(entries)
  assert.equal(integrity.ok, true, integrity.problems.join("; "))

  const types = entries.filter((e) => e.ok).map((e) => e.event.event_type)
  assert.ok(types.includes("action.executed"))
  assert.ok(types.includes("runtime.event"))
  assert.ok(types.includes("task.started"))

  const shellEvent = entries.find((e) => e.ok && e.event.tool === "shell")?.event
  assert.equal(shellEvent.exit_code, 0)
  assert.ok(shellEvent.duration_ms >= 0)
  assert.ok(entries.every((e) => !e.ok || e.event.session_id === "s1"))

  rmSync(dir, { recursive: true, force: true })
})

test("a failing tool call through the plugin is recorded as an error", async () => {
  const dir = traceDir
  const { registered, cleanup } = await mountTracePlugin()

  await registered.tool["execute.before"]({ tool: "shell", sessionID: "s1", input: { command: "npm run missing" } })
  await registered.tool["execute.after"]({
    tool: "shell",
    sessionID: "s1",
    input: { command: "npm run missing" },
    status: "error",
    error: { message: "command not found" },
  })
  await new Promise((resolve) => setTimeout(resolve, 200))
  await cleanup()

  mkdirSync(dir, { recursive: true })
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"))
  const entries = readTrace(join(dir, files[files.length - 1]))
  const failed = entries.filter((e) => e.ok && e.event.event_type === "action.failed")
  assert.ok(failed.length > 0)
  rmSync(dir, { recursive: true, force: true })
})

test("plugin degrades safely when the trace writer cannot load", async () => {
  const saved = process.env.OVERGEARED_SKILLS_TRACE_DIR
  const blocked = join(repoRoot, ".tmp-trace-blocked")
  rmSync(blocked, { recursive: true, force: true })
  writeFileSync(blocked, "not a directory")
  process.env.OVERGEARED_SKILLS_TRACE_DIR = join(blocked, "traces")

  try {
    const { registered, cleanup } = await mountTracePlugin()
    const result = await registered.tool["execute.after"]({ tool: "shell", sessionID: "s1", status: "completed" })
    await cleanup()
    assert.equal(result, undefined, "a trace failure must not throw into the session")
  } finally {
    if (saved === undefined) delete process.env.OVERGEARED_SKILLS_TRACE_DIR
    else process.env.OVERGEARED_SKILLS_TRACE_DIR = saved
    rmSync(blocked, { recursive: true, force: true })
  }
})