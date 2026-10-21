import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { makeTaskRecord, recordEvidence } from "../src/task/record.mjs"
import { evaluateCompletion } from "../src/task/completion-gate.mjs"
import { resolveEvidence, loadTraceEvents, RESOLUTION } from "../src/task/evidence-resolution.mjs"
import { TraceWriter } from "../src/trace/writer.mjs"
import { nextEventId } from "../src/trace/ids.mjs"

function baseRecord(evidenceRef = "pending-ref") {
  return makeTaskRecord({
    projectId: "overgeared-skills-test",
    request: "verify evidence",
    state: "completed",
    criteria: [{ id: "c1", description: "step ran", status: "pass", evidence: [evidenceRef] }],
    file_changes: [],
  })
}

async function recordEvent(record, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "overgeared-skills-ev-"))
  const file = join(dir, "trace.jsonl")
  const writer = new TraceWriter({ taskId: record.task_id, projectId: record.project_id, file })
  const { event } = writer.append({
    event_id: nextEventId(),
    timestamp: new Date().toISOString(),
    phase: "verify",
    event_type: "action.executed",
    source: "observed",
    outcome: "ok",
    tool: "bash",
    exit_code: 0,
    session_id: overrides.session_id ?? null,
    task_id: overrides.task_id ?? record.task_id,
    ...(overrides.event ?? {}),
  })
  await writer.close()
  return { event, traces: loadTraceEvents([file]) }
}

async function withEvidence(overrides = {}, support = undefined) {
  const record = baseRecord()
  const { event, traces } = await recordEvent(record, overrides)
  const evidence = {
    kind: "command_exit_code",
    reference: event.event_id,
    source: "observed",
    captured_at: event.timestamp,
  }
  if (support !== null) {
    evidence.supports =
      support === undefined
        ? { event_type: event.event_type, tool: event.tool, exit_code: event.exit_code }
        : support
  }

  const claimed = recordEvidence(record, evidence)
  claimed.acceptance_criteria[0].evidence = [event.event_id]
  return { record: claimed, traces, event }
}

test("a genuine runtime event resolves and permits completion", async () => {
  const { record, traces, event } = await withEvidence()
  const result = evaluateCompletion(record, { traces })

  assert.equal(result.eligible, true, result.reasons.join(" | "))
  assert.ok(result.notes.some((n) => n.includes(event.event_id)))
})

test("a fabricated reference with no recorded event is rejected", () => {
  const record = recordEvidence(baseRecord("evt-000000000000"), {
    kind: "command_exit_code",
    reference: "evt-000000000000",
    source: "observed",
    supports: { event_type: "action.executed" },
  })
  record.acceptance_criteria[0].evidence = ["evt-000000000000"]

  const result = evaluateCompletion(record, { traces: [{ event_id: "evt-ffffffffffff", task_id: record.task_id }] })
  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /no recorded event has this id/)
  assert.ok(result.blocking_criteria.includes("__evidence__"))
})

test("an event belonging to a different task is rejected", async () => {
  const { record, traces } = await withEvidence({ event: { task_id: "task-somebody-else" } })
  const result = evaluateCompletion(record, { traces })

  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /belongs to task task-somebody-else/)
})

test("an event belonging to a different session is rejected", async () => {
  const { record, traces } = await withEvidence({ event: { session_id: "session-other" } })
  const result = evaluateCompletion(record, { traces, sessionId: "session-mine" })

  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /belongs to session session-other/)
})

test("an event that failed cannot support a claim of success", async () => {
  const { record, traces } = await withEvidence({ event: { outcome: "error", exit_code: 1 } })
  const result = evaluateCompletion(record, { traces })

  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /event outcome is error/)
})

test("a blocked or skipped event cannot support a claim of success", async () => {
  for (const outcome of ["blocked", "skipped"]) {
    const { record, traces } = await withEvidence({ event: { outcome } })
    const result = evaluateCompletion(record, { traces })
    assert.equal(result.eligible, false, outcome)
    assert.match(result.reasons.join(" "), new RegExp(`event outcome is ${outcome}`))
  }
})

test("an event that exists but does not support the claimed step is rejected", async () => {
  const { record, traces } = await withEvidence({}, { event_type: "verification.evidence", tool: "read" })
  const result = evaluateCompletion(record, { traces })

  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /does not support the claim/)
})

test("a mismatched exit code claim is rejected even though the event is real", async () => {
  const { record, traces } = await withEvidence({}, { event_type: "action.executed", exit_code: 0 })
  const tampered = { ...record, verification: { ...record.verification } }
  tampered.verification.evidence = tampered.verification.evidence.map((e) => ({
    ...e,
    supports: { ...e.supports, exit_code: 7 },
  }))

  const result = evaluateCompletion(tampered, { traces })
  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /exit_code is 0, not 7/)
})

test("evidence with no support claim is rejected because support cannot be verified", async () => {
  const { record, traces } = await withEvidence({}, null)
  const result = evaluateCompletion(record, { traces })

  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /states no claim about what it supports/)
})

test("a recorded event that is itself an assertion is rejected", async () => {
  const { record, traces } = await withEvidence({ event: { source: "asserted" } })
  const result = evaluateCompletion(record, { traces })

  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /the recorded event is itself an assertion/)
})

test("when traces are unavailable the outcome is verification pending, not a pass", () => {
  const record = recordEvidence(baseRecord("evt-000000000000"), {
    kind: "command_exit_code",
    reference: "evt-000000000000",
    source: "observed",
    supports: { event_type: "action.executed" },
  })
  record.acceptance_criteria[0].evidence = ["evt-000000000000"]

  const result = evaluateCompletion(record, {})
  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /verification pending/)
  assert.ok(result.blocking_criteria.includes("__evidence_pending__"))
})

test("resolution reports pending distinctly from rejected", async () => {
  const { record, traces } = await withEvidence({ event: { outcome: "error" } })

  const pending = resolveEvidence({ record, events: [] })
  assert.equal(pending.status, RESOLUTION.PENDING)
  assert.match(pending.findings[0].reason, /verification pending/)

  const rejected = resolveEvidence({ record, events: traces })
  assert.equal(rejected.status, RESOLUTION.REJECTED)

  const good = await withEvidence()
  assert.equal(resolveEvidence({ record: good.record, events: good.traces }).status, RESOLUTION.VERIFIED)
})

test("an asserted claim is never resolved, only observed evidence is", async () => {
  const record = recordEvidence(baseRecord(), {
    kind: "manual_note",
    reference: "evt-000000000000",
    source: "asserted",
  })
  const resolution = resolveEvidence({ record, events: [{ event_id: "evt-000000000000", task_id: record.task_id }] })
  assert.equal(resolution.checked, 0)
  assert.equal(resolution.status, RESOLUTION.VERIFIED)
})