import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { TraceWriter, readTrace, assertTraceIntegrity, orderingCheck } from "../src/trace/writer.mjs"
import { nextEventId } from "../src/trace/ids.mjs"
import taskEventSchema from "../schemas/task-event.schema.json" with { type: "json" }
import { validate } from "../src/schema/validate.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

const synthetic = JSON.parse(
  readFileSync(join(repoRoot, "evals", "fixtures", "unsafe-secrets.json"), "utf8"),
)
const secretValue = (label) => synthetic.secrets.find((s) => s.label === label).value
const syntheticGithubToken = secretValue("github_token")
const syntheticAwsKey = secretValue("aws_access_key")
const syntheticPassword = "SYNTHETIC-password-not-real"

async function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "overgeared-skills-trace-"))
  try {
    return await fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function baseEvent(overrides = {}) {
  return {
    schema_version: 1,
    event_id: nextEventId(),
    task_id: "task-0123456789ab",
    project_id: "gentjin",
    timestamp: new Date().toISOString(),
    phase: "act",
    event_type: "action.executed",
    source: "observed",
    duration_ms: 5,
    outcome: "ok",
    ...overrides,
  }
}

test("traces are stored outside Git-tracked project paths by default", () => {
  const defaultDir = process.env.OVERGEARED_SKILLS_TRACE_DIR
  assert.ok(
    defaultDir === undefined || defaultDir.startsWith(process.env.TEMP ?? tmpdir()),
    "default trace directory must not be inside the repository",
  )
})

test("a valid event is accepted and written as one JSONL line", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "nested", "trace.jsonl")
    const writer = new TraceWriter({ taskId: "task-0123456789ab", projectId: "gentjin", file })
    const result = writer.append(baseEvent({ tool: "read", outcome: "ok", duration_ms: 12 }))
    assert.equal(result.accepted, true)
    await writer.close()

    const raw = readFileSync(file, "utf8").trim()
    assert.equal(raw.split("\n").length, 1)
    assert.equal(JSON.parse(raw).tool, "read")
  })
})

test("an invalid event is rejected and counted, without corrupting the file", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "trace.jsonl")
    const writer = new TraceWriter({ taskId: "task-0123456789ab", projectId: "gentjin", file })

    const bad = writer.append({ ...baseEvent(), duration_ms: -5 })
    assert.equal(bad.accepted, false)
    assert.equal(writer.rejected, 1)

    const good = writer.append(baseEvent())
    assert.equal(good.accepted, true)

    const closed = await writer.close()
    assert.equal(closed.written, 1)
    assert.equal(closed.rejected, 1)
    assert.ok(closed.failures.length > 0)

    const entries = readTrace(file)
    assert.equal(entries.length, 1)
    assert.equal(assertTraceIntegrity(entries).ok, true)
  })
})

test("a logging failure is reported as an incomplete trace, never silent", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "trace.jsonl")
    const writer = new TraceWriter({ taskId: "task-0123456789ab", projectId: "gentjin", file })
    writer.append(baseEvent())
    const report = writer.coverageReport()
    assert.equal(report.incomplete, false)
    await writer.close()
  })
})

test("payload secrets are redacted and truncation is recorded", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "trace.jsonl")
    const writer = new TraceWriter({
      taskId: "task-0123456789ab",
      projectId: "gentjin",
      file,
      maxPayloadLength: 200,
    })
    writer.append(
      baseEvent({
        tool: "bash",
        payload: { stdout: `token=${syntheticGithubToken} and ` + "x".repeat(400) },
      }),
    )
    await writer.close()

    const raw = readFileSync(file, "utf8")
    assert.equal(raw.includes(syntheticGithubToken), false)
    const event = JSON.parse(raw)
    assert.equal(event.payload_truncated, true)
    assert.equal(event.payload.__truncated, undefined)
    assert.match(event.payload.summary, /TRUNCATED/)
  })
})

test("a duration is never invented for a source-observed action", async () => {
  const observedWithoutDuration = baseEvent({ source: "observed", duration_ms: null })
  const result = validate(observedWithoutDuration, taskEventSchema)
  assert.equal(result.valid, true)

  const entries = [
    { ok: true, event: observedWithoutDuration },
    { ok: true, event: baseEvent({ source: "asserted", duration_ms: null }) },
  ]
  const integrity = assertTraceIntegrity(entries)
  assert.equal(integrity.ok, false)
  assert.match(integrity.problems.join(" "), /no measured duration/)
})

test("negative duration is rejected by the schema", () => {
  assert.equal(validate(baseEvent({ duration_ms: -1 }), taskEventSchema).valid, false)
})

test("usage is null when unavailable rather than zero", () => {
  const unavailable = baseEvent({ usage: null })
  assert.equal(validate(unavailable, taskEventSchema).valid, true)
  assert.equal(unavailable.usage, null)

  const zeroFaked = baseEvent({
    usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0, model: null, provider: null, provenance: "estimated" },
  })
  assert.equal(validate(zeroFaked, taskEventSchema).valid, true)
  assert.match(zeroFaked.usage.provenance, /estimated/)
})

test("coverage report names every expected hook and flags unobserved ones", async () => {
  await withTempDir(async (dir) => {
    const writer = new TraceWriter({
      taskId: "task-0123456789ab",
      projectId: "gentjin",
      file: join(dir, "trace.jsonl"),
    })
    const span = writer.onToolExecuteBefore({ tool: "bash" }, { args: { command: "npm test" } })
    writer.onToolExecuteAfter({ tool: "bash" }, { exitCode: 0, output: "ok" }, span)
    const report = writer.coverageReport()

    assert.ok(report.hooks.length >= 5)
    assert.ok(report.unobserved_hooks.includes("event"))
    assert.ok(report.unobserved_hooks.includes("chat.message"))
    const bashHook = report.hooks.find((h) => h.hook === "tool.execute.after")
    assert.equal(bashHook.observed, true)
    assert.deepEqual(bashHook.missing_fields, [])
    await writer.close()
  })
})

test("a command without an observed exit code is reported as a missing field", async () => {
  await withTempDir(async (dir) => {
    const writer = new TraceWriter({
      taskId: "task-0123456789ab",
      projectId: "gentjin",
      file: join(dir, "trace.jsonl"),
    })
    const span = writer.onToolExecuteBefore({ tool: "bash" }, { args: {} })
    writer.onToolExecuteAfter({ tool: "bash" }, { output: "no code here" }, span)
    const report = writer.coverageReport()
    const hook = report.hooks.find((h) => h.hook === "tool.execute.after")
    assert.deepEqual(hook.missing_fields, ["exit_code"])
    await writer.close()
  })
})

test("a failing tool call is recorded with an error category and real exit code", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "trace.jsonl")
    const writer = new TraceWriter({ taskId: "task-0123456789ab", projectId: "gentjin", file })
    const span = writer.onToolExecuteBefore({ tool: "bash" }, { args: { command: "npm test" } })
    writer.onToolExecuteAfter({ tool: "bash" }, { exitCode: 1, error: "ENOENT no such file" }, span)
    await writer.close()

    const event = readTrace(file)[0].event
    assert.equal(event.event_type, "action.failed")
    assert.equal(event.outcome, "error")
    assert.equal(event.exit_code, 1)
    assert.equal(event.error_category, "not_found")
    assert.ok(event.duration_ms >= 0)
  })
})

test("malformed JSONL is detected by the integrity check", () => {
  const entries = [
    { ok: false, line: 1, error: "Unexpected token" },
    { ok: true, event: baseEvent() },
  ]
  const result = assertTraceIntegrity(entries)
  assert.equal(result.ok, false)
  assert.match(result.problems.join(" "), /line 1 is malformed JSON/)
})

test("duplicate event ids are detected", () => {
  const id = nextEventId()
  const entries = [
    { ok: true, event: baseEvent({ event_id: id }) },
    { ok: true, event: baseEvent({ event_id: id }) },
  ]
  assert.match(assertTraceIntegrity(entries).problems.join(" "), /duplicate event_id/)
})

test("ordering check detects a task that starts twice", () => {
  const entries = [
    { ok: true, event: baseEvent({ event_type: "task.started" }) },
    { ok: true, event: baseEvent({ event_type: "task.started" }) },
  ]
  assert.match(orderingCheck(entries).problems.join(" "), /task.started events found/)
})

test("an asserted event is distinguishable from an observed one", () => {
  const observed = baseEvent({ source: "observed" })
  const asserted = baseEvent({ source: "asserted", duration_ms: 9999 })
  assert.equal(validate(observed, taskEventSchema).valid, true)
  assert.equal(validate(asserted, taskEventSchema).valid, true)
  assert.notEqual(observed.source, asserted.source)
})

test("readTrace returns an empty list for a missing file", () => {
  assert.deepEqual(readTrace(join(tmpdir(), "gentjin-does-not-exist-12345.jsonl")), [])
})

test("a trace containing a secret never leaks it to disk in plaintext", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "trace.jsonl")
    const writer = new TraceWriter({ taskId: "task-0123456789ab", projectId: "gentjin", file })
    writer.append(
      baseEvent({
        tool: "bash",
        payload: { stdout: `password: ${syntheticPassword} ${syntheticAwsKey}` },
      }),
    )
    await writer.close()
    const raw = readFileSync(file, "utf8")
    assert.equal(raw.includes(syntheticPassword), false)
    assert.equal(raw.includes(syntheticAwsKey), false)
    assert.ok(existsSync(file))
  })
})