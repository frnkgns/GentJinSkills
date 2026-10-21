import test, { after } from "node:test"
import assert from "node:assert/strict"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import tracePlugin from "../plugins/overgeared-skills-trace.js"
import { createTracePlugin } from "../src/trace/plugin-body.mjs"
import { pluginManifest, traceDirIsOutsideRepo, PLUGIN_NAME } from "../src/trace/plugin-support.mjs"
import { readTrace, assertTraceIntegrity } from "../src/trace/writer.mjs"

import { rmSync } from "node:fs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const traceDir = join(repoRoot, ".tmp-trace-test")

process.env.OVERGEARED_SKILLS_TRACE_DIR = traceDir

after(() => {
  rmSync(traceDir, { recursive: true, force: true })
})

test("the plugin default export is an inline arrow, which is what OpenCode invokes", () => {
  assert.match(tracePlugin.toString(), /^async/, "default export must be an inline async arrow")
})

test("the plugin module exports nothing else, because extra exports suppress invocation", async () => {
  const mod = await import("../plugins/overgeared-skills-trace.js")
  assert.deepEqual(Object.keys(mod), ["default"])
})

test("plugin exposes exactly the hooks the trace format depends on", async () => {
  const hooks = Object.keys(await createTracePlugin({ project: { id: "overgeared-skills" } }))
  for (const required of ["tool.execute.before", "tool.execute.after", "event", "chat.message", "permission.ask"]) {
    assert.ok(hooks.includes(required), `missing hook: ${required}`)
  }
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
  const plugin = await createTracePlugin({
    project: { id: "overgeared-skills" },
    client: { app: { log: async () => {} } },
  })

  await plugin["tool.execute.before"]({ tool: "bash" }, { args: { command: "npm test" } })
  await plugin["tool.execute.after"]({ tool: "bash" }, { exitCode: 0, output: "72 passing" })
  await plugin["tool.execute.before"]({ tool: "read" }, { args: { filePath: "AGENTS.md" } })
  await plugin["tool.execute.after"]({ tool: "read" }, { title: "AGENTS.md", output: "instructions" })
  await plugin.event({ event: { type: "session.idle", properties: {} } })
  await plugin["chat.message"]({}, { messages: [{}] })

  await new Promise((resolve) => setTimeout(resolve, 200))

  const { readdirSync, rmSync, mkdirSync } = await import("node:fs")
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

  const bashEvent = entries.find((e) => e.ok && e.event.tool === "bash")?.event
  assert.equal(bashEvent.exit_code, 0)
  assert.ok(bashEvent.duration_ms >= 0)

  rmSync(dir, { recursive: true, force: true })
})

test("a failing tool call through the plugin is recorded as an error", async () => {
  const dir = traceDir
  const plugin = await createTracePlugin({ project: { id: "overgeared-skills" } })
  await plugin["tool.execute.before"]({ tool: "bash" }, { args: { command: "npm run missing" } })
  await plugin["tool.execute.after"]({ tool: "bash" }, { exitCode: 127, error: "command not found" })
  await new Promise((resolve) => setTimeout(resolve, 200))

  const { readdirSync, rmSync, mkdirSync } = await import("node:fs")
  mkdirSync(dir, { recursive: true })
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"))
  const entries = readTrace(join(dir, files[files.length - 1]))
  const failed = entries.filter((e) => e.ok && e.event.event_type === "action.failed")
  assert.ok(failed.length > 0)
  assert.equal(failed[0].event.exit_code, 127)
  rmSync(dir, { recursive: true, force: true })
})

test("plugin degrades safely when the trace writer cannot load", async () => {
  const plugin = await createTracePlugin({ project: { id: "overgeared-skills" } })
  const result = await plugin["tool.execute.after"]({ tool: "bash" }, { exitCode: 0 })
  assert.equal(result, undefined, "a trace failure must not throw into the session")
})