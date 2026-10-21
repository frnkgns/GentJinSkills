import test from "node:test"
import assert from "node:assert/strict"
import taskRecordSchema from "../schemas/task-record.schema.json" with { type: "json" }
import taskEventSchema from "../schemas/task-event.schema.json" with { type: "json" }
import { validate, assertValid } from "../src/schema/validate.mjs"
import { evaluateCompletion, assertCompleted, isWithinScope } from "../src/task/completion-gate.mjs"
import { makeTaskRecord } from "../src/task/record.mjs"

test("validator accepts the shipped task-record schema document itself as a schema", () => {
  const result = validate({}, taskRecordSchema)
  assert.equal(result.valid, false)
  assert.ok(result.errors.length >= 15, "empty record must fail every required top-level field")
  assert.ok(result.errors.every((e) => typeof e.message === "string" && e.keyword))
})

test("validator reports type, required, enum, and pattern failures distinctly", () => {
  const schema = {
    type: "object",
    required: ["a"],
    properties: { a: { type: "string", enum: ["x"] }, b: { type: "integer", minimum: 1 } },
  }
  const bad = validate({ a: "y", b: 0 }, schema)
  assert.equal(bad.valid, false)
  assert.deepEqual(
    bad.errors.map((e) => `${e.keyword}@${e.path}`).sort(),
    ["enum@/a", "minimum@/b"],
  )

  const wrongTypes = validate({ a: 1, b: "no" }, schema)
  assert.deepEqual(
    wrongTypes.errors.filter((e) => e.keyword === "type").map((e) => e.path).sort(),
    ["/a", "/b"],
  )
})

test("validator supports if/then and dependentRequired", () => {
  const schema = {
    type: "object",
    properties: {
      status: { enum: ["pass", "n_a"] },
      evidence: { type: "array" },
      reason: { type: "string" },
    },
    required: ["status"],
    dependentRequired: { status: ["evidence"] },
    allOf: [
      {
        if: { properties: { status: { const: "pass" } }, required: ["status"] },
        then: { required: ["evidence"], properties: { evidence: { minItems: 1 } } },
      },
    ],
  }
  assert.equal(validate({ status: "pass", evidence: ["e"] }, schema).valid, true)
  assert.equal(validate({ status: "pass" }, schema).valid, false)
  assert.equal(validate({ status: "pass", evidence: [] }, schema).valid, false)
})

test("validator rejects additionalProperties when forbidden", () => {
  const schema = { type: "object", properties: { a: { type: "string" } }, additionalProperties: false }
  assert.equal(validate({ a: "x" }, schema).valid, true)
  assert.equal(validate({ a: "x", sneaky: 1 }, schema).valid, false)
})

test("validator resolves local $ref", () => {
  const schema = {
    type: "object",
    properties: { item: { $ref: "#/$defs/leaf" } },
    $defs: { leaf: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
  }
  assert.equal(validate({ item: { id: "a" } }, schema).valid, true)
  assert.equal(validate({ item: {} }, schema).valid, false)
})

test("assertValid throws with a readable path list", () => {
  assert.throws(() => assertValid({}, taskRecordSchema, "record"), /record failed schema validation/)
})

test("task-event schema requires source and forbids invented duration", () => {
  const base = {
    schema_version: 1,
    event_id: "evt-0123456789ab",
    task_id: "task-0123456789ab",
    project_id: "overgeared-skills",
    timestamp: new Date().toISOString(),
    phase: "act",
    event_type: "action.executed",
    source: "observed",
  }
  assert.equal(validate(base, taskEventSchema).valid, true)

  const invented = { ...base, duration_ms: -5 }
  assert.equal(validate(invented, taskEventSchema).valid, false)

  const noSource = { ...base }
  delete noSource.source
  assert.equal(validate(noSource, taskEventSchema).valid, false)
})

function recordWith(overrides = {}) {
  return makeTaskRecord({
    projectId: "overgeared-skills",
    request: "fix empty table",
    criteria: [{ id: "ui-rows", description: "rows render", status: "pass", evidence: ["ev-1"] }],
    ...overrides,
  })
}

test("a passing build with an unverified mandatory UI criterion cannot validate as completed", () => {
  const record = recordWith({
    criteria: [
      { id: "build", description: "build passes", status: "pass", evidence: ["ev-build"] },
      { id: "ui-rows", description: "table renders rows", status: "not_run", remaining_check: "run the fixture" },
    ],
    state: "completed",
  })
  record.verification = {
    evidence: [
      { kind: "command_exit_code", reference: "ev-build", source: "observed", captured_at: null },
    ],
    checks_run: 1,
    checks_required: 1,
    notes: "build is green",
  }

  const result = evaluateCompletion(record)
  assert.equal(result.eligible, false)
  assert.ok(result.blocking_criteria.includes("ui-rows"))
  assert.match(result.reasons.join(" "), /mandatory criterion "ui-rows" is not_run/)

  const downgraded = assertCompleted(record)
  assert.notEqual(downgraded.state, "completed")
  assert.equal(downgraded.outcome.result, "partial")
  assert.match(downgraded.outcome.summary, /Completion rejected/)
})

test("criterion marked pass without observed evidence is rejected", () => {
  const record = recordWith({
    criteria: [{ id: "ui-rows", description: "rows render", status: "pass", evidence: ["claimed"] }],
    state: "completed",
  })
  record.verification = {
    evidence: [{ kind: "manual_note", reference: "claimed", source: "asserted", captured_at: null }],
    checks_run: 1,
    checks_required: 1,
    notes: null,
  }

  const result = evaluateCompletion(record)
  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /evidence is not observed/)
})

test("not_applicable without a reason fails schema validation", () => {
  const noReason = recordWith({
    criteria: [{ id: "c1", description: "irrelevant", status: "not_applicable" }],
    state: "completed",
  })
  noReason.verification = { evidence: [], checks_run: 0, checks_required: 0, notes: null }
  const result = evaluateCompletion(noReason)
  assert.equal(result.schema_valid, false)
  assert.match(result.reasons.join(" "), /not_applicable_reason/)
})

test("a required check that never ran blocks completion", () => {
  const record = recordWith({
    state: "completed",
  })
  record.verification = { evidence: [], checks_run: 0, checks_required: 3, notes: null }
  record.acceptance_criteria = []
  const result = evaluateCompletion(record)
  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /required checks executed/)
})

test("routing basis cannot claim observed without a first-class event", () => {
  const record = recordWith({
    state: "completed",
    routing: { basis: "observed", evidence: ["guess"], overrides: [], unavailable_capabilities: [] },
  })
  record.verification = {
    evidence: [
      { kind: "command_exit_code", reference: "ev-1", source: "observed", captured_at: null },
    ],
    checks_run: 1,
    checks_required: 1,
    notes: null,
  }
  const result = evaluateCompletion(record)
  assert.equal(result.eligible, false)
  assert.ok(result.blocking_criteria.includes("__routing_basis__"))
})

test("unresolved blocking issues prevent completion", () => {
  const record = recordWith({
    state: "completed",
    blockers: [{ description: "credentials missing", blocking: true, needs_from_user: true, unblock_check: null }],
  })
  record.verification = {
    evidence: [{ kind: "command_exit_code", reference: "ev-1", source: "observed", captured_at: null }],
    checks_run: 1,
    checks_required: 1,
    notes: null,
  }
  assert.equal(evaluateCompletion(record).eligible, false)
})

test("review-only task changing a file outside scope is a violation", () => {
  const record = recordWith({
    state: "in_progress",
    scope: { allowed_paths: ["docs/"], allowed_skills: [], allow_code_changes: false, description: null },
    file_changes: [
      { path: "src/app.js", reason: "unauthorized", change_type: "modified" },
    ],
  })
  const result = evaluateCompletion(record)
  assert.equal(result.eligible, false)
  assert.ok(result.blocking_criteria.includes("__scope__"))
})

test("not_applicable is allowed for a non-mandatory criterion when justified", () => {
  const record = recordWith({
    state: "completed",
    criteria: [
      {
        id: "c1",
        description: "irrelevant to this task",
        status: "not_applicable",
        mandatory: false,
        not_applicable_reason: "no such surface exists in this project",
      },
    ],
  })
  record.verification = { evidence: [], checks_run: 0, checks_required: 0, notes: null }
  const result = evaluateCompletion(record)
  assert.equal(result.eligible, true)
  assert.deepEqual(result.reasons, [])
  assert.match(result.notes.join(" "), /no such surface exists/)
})

test("a mandatory criterion cannot be waived by marking it not_applicable", () => {
  const record = recordWith({
    state: "completed",
    criteria: [
      {
        id: "c1",
        description: "must still be checked",
        status: "not_applicable",
        not_applicable_reason: "claiming it does not matter",
      },
    ],
  })
  record.verification = { evidence: [], checks_run: 0, checks_required: 0, notes: null }
  const result = evaluateCompletion(record)
  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /cannot be waived/)
})

test("in_progress record is not judged by completed-only checks", () => {
  const record = recordWith({
    state: "in_progress",
    criteria: [{ id: "c", description: "d", status: "not_run" }],
  })
  record.verification = { evidence: [], checks_run: 0, checks_required: 5, notes: null }
  const result = evaluateCompletion(record)
  assert.equal(result.eligible, true)
  assert.deepEqual(result.reasons, [])
})

test("isWithinScope matches prefixes, not partial segments", () => {
  assert.equal(isWithinScope("docs/a.md", ["docs"]), true)
  assert.equal(isWithinScope("docs/nested/a.md", ["docs/"]), true)
  assert.equal(isWithinScope("docsx/a.md", ["docs"]), false)
  assert.equal(isWithinScope("src/a.js", ["docs"]), false)
  assert.equal(isWithinScope("anything", []), true)
})

test("schema-valid but semantically wrong record still fails on schema grounds", () => {
  const broken = { ...recordWith({ state: "completed" }), state: "not_a_real_state" }
  const result = evaluateCompletion(broken)
  assert.equal(result.schema_valid, false)
  assert.equal(result.eligible, false)
})