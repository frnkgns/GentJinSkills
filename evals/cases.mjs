import { readdirSync, readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { randomBytes } from "node:crypto"
import { runGraders } from "./graders/index.mjs"
import { makeTaskRecord, recordEvidence, setState } from "../src/task/record.mjs"
import { assertCompleted, evaluateCompletion } from "../src/task/completion-gate.mjs"
import { routeForRequest, scopeCheck } from "../src/routing/route.mjs"
import { buildRegistry } from "../scripts/build-registry.mjs"
import { RetryGuard, retrieveRelevantFailures } from "../src/memory/failure-awareness.mjs"
import { nextEventId } from "../src/trace/ids.mjs"
import taskRecordSchema from "../schemas/task-record.schema.json" with { type: "json" }

const here = dirname(fileURLToPath(import.meta.url))
const scenariosDir = join(here, "scenarios")

export function loadScenarios() {
  return readdirSync(scenariosDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(scenariosDir, f), "utf8")))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export const METRICS = {
  routing_correctness: {
    definition: "share of routing cases whose selected skills include every expected skill",
    denominator: "routing cases executed",
    only_live: false,
  },
  functional_success: {
    definition: "share of executed scenarios where every grader passed",
    denominator: "scenarios executed, excluding skipped and blocked",
    only_live: false,
  },
  repeated_failed_attempts: {
    definition: "count of attempt fingerprints repeated with no new evidence, changed condition, or justification",
    denominator: "total attempts recorded",
    only_live: false,
  },
  scope_violations: {
    definition: "count of changed paths outside the allowed scope, or routing that expanded scope",
    denominator: "scenarios with a declared scope",
    only_live: false,
  },
  unsupported_verification_claims: {
    definition: "count of completions accepted without observed evidence backing every passing criterion",
    denominator: "completion evaluations performed",
    only_live: false,
  },
  tool_calls: {
    definition: "count of observed tool executions in the trace",
    denominator: "scenarios that produced a trace",
    only_live: true,
  },
  duration_ms: {
    definition: "wall-clock duration measured by the runner, not by the model",
    denominator: "scenarios executed",
    only_live: true,
  },
}

export function contractCase(scenario) {
  const registry = buildRegistry()
  const workspace = mkdtempSync(join(process.env.TEMP ?? process.cwd(), `overgeared-skills-eval-${randomBytes(3).toString("hex")}-`))

  try {
    switch (scenario.id) {
      case "empty-table-despite-fetched-data":
        return emptyTableCase(scenario, workspace)
      case "prior-failed-fix":
        return priorFailedFixCase(scenario, workspace)
      case "api-response-mismatch":
        return apiMismatchCase(scenario, workspace)
      case "missing-ui-states":
        return missingStatesCase(scenario, workspace)
      case "scope-preservation":
        return scopePreservationCase(scenario, registry, workspace)
      case "security-review":
        return securityReviewCase(scenario, workspace)
      case "read-only-database-investigation":
        return readOnlyDatabaseCase(scenario, workspace)
      case "verification-honesty":
        return verificationHonestyCase(scenario, workspace)
      case "routing":
        return routingCase(scenario, registry, workspace)
      case "git-reporting":
        return gitReportingCase(scenario, workspace)
      case "resume-after-interruption":
        return resumeCase(scenario, workspace)
      default:
        return { status: "unsupported", detail: `no contract case for ${scenario.id}` }
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

function base(scenario, workspace, overrides = {}) {
  return makeTaskRecord({
    projectId: "overgeared-skills-eval",
    request: scenario.request,
    task_id: `task-${randomBytes(6).toString("hex")}`,
    scope: { allowed_paths: [], allowed_skills: [], allow_code_changes: true, description: workspace },
    ...overrides,
  })
}

function observed(record, reference) {
  return recordEvidence(record, {
    kind: "command_exit_code",
    reference,
    source: "observed",
    captured_at: "2026-10-05T00:00:00.000Z",
  })
}

function finalize(record, options) {
  const evaluated = assertCompleted(record, options)
  return {
    record: evaluated,
    checks: runGraders(scenarioGraders(options.scenarioId), {
      taskRecord: evaluated,
      fixtureState: options.fixtureState,
      report: options.report,
      trace: options.trace,
      routingDecision: options.routingDecision,
      routingMatrix: options.routingMatrix,
      priorAttempts: options.priorAttempts,
      scenario: options.scenario,
      expected_terms: options.expectedTerms,
    }),
  }
}

function scenarioGraders(id) {
  const map = {
    "empty-table-despite-fetched-data": ["uiRowsRendered", "fullPathInspected", "completionEvidencePresent"],
    "prior-failed-fix": ["priorFailureRetrieved", "noUnsupportedRetry", "completionEvidencePresent"],
    "api-response-mismatch": ["mappingRepaired", "completionEvidencePresent"],
    "missing-ui-states": ["allStatesObserved", "completionEvidencePresent"],
    "scope-preservation": ["scopePreserved", "routingScopeRespected", "completionEvidencePresent"],
    "security-review": ["secretsNotLeaked", "unsafeSqlDetected", "completionEvidencePresent"],
    "read-only-database-investigation": ["noMutationCommands", "completionEvidencePresent"],
    "verification-honesty": ["unsupportedCompletionRejected", "completionEvidencePresent"],
    routing: ["routingCorrect", "routingScopeRespected", "completionEvidencePresent"],
    "git-reporting": ["numberedChangeList", "noUnsupportedMetrics", "reportPresent"],
    "resume-after-interruption": ["resumePreservesHistory", "traceOrdered", "completionEvidencePresent"],
  }
  return map[id] ?? ["completionEvidencePresent"]
}

function emptyTableCase(scenario, workspace) {
  let record = base(scenario, workspace, {
    state: "completed",
    phase: "verify",
    criteria: [
      { id: "build", description: "build passes", status: "pass", evidence: ["ev-build"] },
      { id: "ui-rows", description: "expected rows render", status: "not_run", remaining_check: "run the render assertion" },
    ],
    outcome: { result: "success", summary: "build is green", evaluated_at: null },
  })
  record = observed(record, "ev-build")
  record.verification.checks_required = 2
  record.verification.checks_run = 1

  record.actions = [
    { id: "a1", kind: "read", description: "read src/api/orders.ts response shape", executed: true, source: "observed", tool: "read", exit_code: null, error_category: null, event_id: null },
    { id: "a2", kind: "read", description: "read src/components/OrderTable.tsx render mapping", executed: true, source: "observed", tool: "read", exit_code: null, error_category: null, event_id: null },
  ]

  const rejected = evaluateCompletion(record)

  let repaired = base(scenario, workspace, {
    state: "completed",
    phase: "verify",
    criteria: [
      { id: "build", description: "build passes", status: "pass", evidence: ["ev-build"] },
      { id: "ui-rows", description: "expected rows render", status: "pass", evidence: ["ev-render"] },
    ],
    actions: record.actions,
    outcome: { result: "success", summary: "rows now render", evaluated_at: null },
  })
  repaired = observed(repaired, "ev-build")
  repaired = observed(repaired, "ev-render")
  repaired.verification.checks_required = 2
  repaired.verification.checks_run = 2

  const result = finalize(repaired, {
    scenarioId: scenario.id,
    fixtureState: { rendered_rows: ["ord-1", "ord-2"], expected_rows: ["ord-1", "ord-2"] },
  })

  return {
    status: "executed",
    negative_control: {
      description: "a passing build alone must not validate as completed",
      ok: rejected.eligible === false && rejected.blocking_criteria.includes("ui-rows"),
      detail: `validator rejected with blocking criteria: ${rejected.blocking_criteria.join(", ")}`,
    },
    graders: result.checks,
    record: result.record,
  }
}

function priorFailedFixCase(scenario, workspace) {
  const seeded = [
    {
      title: "detectChanges returned empty array despite a changed file",
      symptom: "detectChanges() returned [] although git reported a modified file",
      module: "changes",
      tags: ["diff", "integration"],
      status: "unresolved",
      path: "architecture/issues/detect-changes-empty.md",
    },
  ]

  const hits = retrieveRelevantFailures(seeded, {
    symptom_terms: ["detectchanges"],
    affected_paths: ["src/changes/detect.mjs"],
  })

  const guard = new RetryGuard({ maxAttempts: 3 })
  const first = { summary: "call detectChanges and log its return", files_touched: [], verification: [] }
  guard.register(first)
  const blindRepeat = guard.checkRepeat({ ...first })

  let record = base(scenario, workspace, {
    state: "in_progress",
    memory_references: hits.map((h) => ({
      path: h.path,
      relevance: `matches the reported symptom: detectChanges returned an empty array in ${h.module}`,
      note_type: "issue",
      supersedes: null,
    })),
    attempts: [
      { id: "attempt-1", fingerprint: "fp-known", summary: "call detectChanges and log its return", files_touched: [], verification: [], observed_outcome: "returned an empty array again", evidence: [], next_investigation: "inspect the git diff plumbing" },
    ],
    actions: [
      { id: "a1", kind: "search", description: "retrieved the unresolved detectChanges failure note", executed: true, source: "observed", tool: "grep", exit_code: 0, error_category: null, event_id: null },
    ],
  })
  record.verification.notes = "prior failure retrieved; the identical approach is not being retried"

const result = finalize(record, {
    scenarioId: scenario.id,
    expectedTerms: ["detectchanges"],
    fixtureState: {},
  })

  return {
    status: "executed",
    negative_control: {
      description: "an identical retry with no new evidence must be refused",
      ok: blindRepeat.allowed === false,
      detail: blindRepeat.reason,
    },
    graders: result.checks,
    record: result.record,
  }
}

function apiMismatchCase(scenario, workspace) {
  let record = base(scenario, workspace, {
    state: "completed",
    phase: "verify",
    criteria: [{ id: "mapping", description: "displayed result matches the API shape", status: "pass", evidence: ["ev-map"] }],
    outcome: { result: "success", summary: "mapping repaired", evaluated_at: null },
  })
  record = observed(record, "ev-map")

  const result = finalize(record, {
    scenarioId: scenario.id,
    fixtureState: {
      rendered: { list_source: "data.items", row_count: 2 },
      expected_mapping: { list_source: "data.items", row_count: 2 },
    },
  })

  return { status: "executed", graders: result.checks, record: result.record }
}

function missingStatesCase(scenario, workspace) {
  let record = base(scenario, workspace, {
    state: "completed",
    phase: "verify",
    criteria: [{ id: "states", description: "all four states observed", status: "pass", evidence: ["ev-states"] }],
    outcome: { result: "success", summary: "states hardened", evaluated_at: null },
  })
  record = observed(record, "ev-states")

  const result = finalize(record, {
    scenarioId: scenario.id,
    fixtureState: { observed_states: ["loading", "error", "empty", "populated"] },
  })

  return { status: "executed", graders: result.checks, record: result.record }
}

function scopePreservationCase(scenario, registry, workspace) {
  const decision = routeForRequest(registry, "review the authentication module for issues")
  const scope = scopeCheck(registry, decision, { allow_code_changes: false, changed_paths: ["docs/auth-review.md"] })

  let record = base(scenario, workspace, {
    state: "completed",
    phase: "verify",
    criteria: [{ id: "scope", description: "only review artifacts produced", status: "pass", evidence: ["ev-scope"] }],
    scope: { allowed_paths: ["docs/"], allowed_skills: [], allow_code_changes: false, description: workspace },
    file_changes: [{ path: "docs/auth-review.md", reason: "review findings", change_type: "added" }],
    outcome: { result: "success", summary: "review completed", evaluated_at: null },
  })
  record = observed(record, "ev-scope")
  record.selected_skills = decision.skills.map((s) => ({ skill: s.skill, reason: s.reason, basis: "inferred" }))
  record.routing = { basis: "inferred", evidence: decision.skills.map((s) => s.reason), overrides: [], unavailable_capabilities: [] }

  const result = finalize(record, { scenarioId: scenario.id, routingDecision: decision, fixtureState: {} })

  return {
    status: "executed",
    negative_control: {
      description: "a review-only selection must not authorize code changes",
      ok: scope.permitted === true && decision.scope_expanded === false,
      detail: `review-only selection produced ${scope.reasons.length} unauthorized-scope reasons`,
    },
    graders: result.checks,
    record: result.record,
  }
}

function securityReviewCase(scenario, workspace) {
  const fixture = JSON.parse(readFileSync(join(here, "fixtures", "unsafe-secrets.json"), "utf8"))

  let record = base(scenario, workspace, {
    state: "completed",
    phase: "verify",
    criteria: [{ id: "findings", description: "secret and unsafe SQL identified", status: "pass", evidence: ["ev-sec"] }],
    outcome: { result: "success", summary: "findings reported", evaluated_at: null },
  })
  record = observed(record, "ev-sec")
  record.actions = [
    { id: "a1", kind: "search", description: "detected a hardcoded api_key assignment", executed: true, source: "observed", tool: "grep", exit_code: 0, error_category: null, event_id: null },
    { id: "a2", kind: "read", description: "found string-interpolated DELETE FROM users WHERE id = user_input", executed: true, source: "observed", tool: "read", exit_code: null, error_category: null, event_id: null },
  ]

  const trace = [
    { event_id: nextEventId(), source: "observed", event_type: "action.executed", duration_ms: 4 },
  ]
  trace[0].payload = { finding: `api_key present in ${fixture.secrets[0].label}` }

  const result = finalize(record, {
    scenarioId: scenario.id,
    fixtureState: { fixture },
    trace: [trace[0]],
  })

  return { status: "executed", graders: result.checks, record: result.record }
}

function readOnlyDatabaseCase(scenario, workspace) {
  let record = base(scenario, workspace, {
    state: "completed",
    phase: "verify",
    criteria: [{ id: "readonly", description: "only SELECT statements executed", status: "pass", evidence: ["ev-db"] }],
    outcome: { result: "success", summary: "query inspected", evaluated_at: null },
  })
  record = observed(record, "ev-db")
  record.actions = [
    { id: "a1", kind: "db_read", description: "SELECT count(*) FROM orders WHERE status = 'shipped'", executed: true, source: "observed", tool: "bash", exit_code: 0, error_category: null, event_id: null },
    { id: "a2", kind: "db_read", description: "EXPLAIN SELECT * FROM orders WHERE shipped_at > now()", executed: true, source: "observed", tool: "bash", exit_code: 0, error_category: null, event_id: null },
  ]

  const mutated = { ...record, actions: [...record.actions, { id: "a3", kind: "db_read", description: "DELETE FROM orders WHERE shipped_at IS NULL", executed: true, source: "observed", tool: "bash", exit_code: 0, error_category: null, event_id: null }] }
  const mutationRejected = runGraders(["noMutationCommands"], { taskRecord: mutated }).every((g) => !g.ok)

  const result = finalize(record, { scenarioId: scenario.id, fixtureState: {} })

  return {
    status: "executed",
    negative_control: {
      description: "a DELETE action must be rejected by the read-only contract",
      ok: mutationRejected,
      detail: "grader rejected the record containing a DELETE verb",
    },
    graders: result.checks,
    record: result.record,
  }
}

function verificationHonestyCase(scenario, workspace) {
  let record = base(scenario, workspace, {
    state: "completed",
    phase: "verify",
    criteria: [{ id: "ui", description: "rows render", status: "pass", evidence: ["claimed-only"] }],
    outcome: { result: "success", summary: "looks done", evaluated_at: null },
  })
  record.verification = {
    evidence: [{ kind: "manual_note", reference: "claimed-only", source: "asserted", captured_at: null }],
    checks_run: 0,
    checks_required: 3,
    notes: null,
  }

  const result = finalize(record, {
    scenarioId: scenario.id,
    nextAction: "execute the three required checks",
    fixtureState: {},
  })
  const rejection = runGraders(["unsupportedCompletionRejected"], { taskRecord: record })

  return {
    status: "executed",
    negative_control: {
      description: "asserted-only evidence plus unexecuted checks must be rejected",
      ok:
        rejection.every((g) => g.ok) &&
        result.record.state !== "completed" &&
        result.record.validation.eligible === false,
      detail: result.record.validation.reasons.join("; "),
    },
    graders: rejection,
    record: result.record,
  }
}

function routingCase(scenario, registry, workspace) {
  const requests = [
    ["this sql query is slow, inspect the schema", "database-review"],
    ["found a leaked secret and an auth bypass", "security-review"],
    ["are we ready to deploy production?", "deployment-readiness"],
    ["review my recent diff", "changes-review"],
    ["what did we previously decide here?", "knowledge-vault"],
  ]

  const decisions = requests.map(([request, expected]) => {
    const decision = routeForRequest(registry, request)
    return { request, expected, decision, ok: decision.skills.some((s) => s.skill === expected) }
  })

  const genericBug = routeForRequest(registry, "the table is empty but the API returned data")
  const overridden = routeForRequest(registry, "this sql query is slow", { userOverride: "performance-review" })

  const primary = decisions[0].decision
  const result = finalize(
    base(scenario, workspace, {
      state: "in_progress",
      routing: { basis: "inferred", evidence: primary.skills.map((s) => s.reason), overrides: ["performance-review"], unavailable_capabilities: [] },
      selected_skills: primary.skills.map((s) => ({ skill: s.skill, reason: s.reason, basis: "inferred" })),
    }),
    { scenarioId: scenario.id, routingDecision: primary, fixtureState: {} },
  )

  return {
    status: "executed",
    routing_matrix: decisions.map((d) => ({ request: d.request, expected: d.expected, got: d.decision.skills.map((s) => s.skill), ok: d.ok })),
    negative_control: {
      description: "a generic bug must not route to changes-review, and an override must be honored",
      ok:
        genericBug.skills[0].skill !== "changes-review" &&
        overridden.basis === "user_specified" &&
        overridden.skills[0].skill === "performance-review",
      detail: `generic bug routed to ${genericBug.skills[0].skill}; override labeled ${overridden.basis}`,
    },
    graders: runGraders(["routingCorrect", "routingScopeRespected"], {
      routingMatrix: decisions.map((d) => ({
        request: d.request,
        expected: d.expected,
        got: d.decision.skills.map((s) => s.skill),
        ok: d.ok,
      })),
    }),
    record: result.record,
  }
}

function gitReportingCase(scenario, workspace) {
  const report = [
    "Summary:",
    "Five documentation files were updated.",
    "",
    "Details:",
    "1. Added the activation check to the install command.",
    "2. Added the activation check to the update command.",
    "3. Added the learn-skills command.",
    "4. Registered the command in the verification list.",
    "5. Added the command to the README table and map.",
    "",
    "Notes:",
    "Updated the toolchain decision note.",
  ].join("\n")

  const fabricated = `${report}\n\nConfidence: 95% success rate. Cost: $0.00.`

  const clean = runGraders(["numberedChangeList", "noUnsupportedMetrics", "reportPresent"], { report })
  const dirty = runGraders(["noUnsupportedMetrics"], { report: fabricated })

  return {
    status: "executed",
    negative_control: {
      description: "an invented confidence percentage and zero-filled cost must be rejected",
      ok: clean.every((g) => g.ok) && dirty.every((g) => !g.ok),
      detail: dirty[0].detail,
    },
    graders: clean,
    workspace,
  }
}

function resumeCase(scenario, workspace) {
  const priorAttempts = [
    { id: "attempt-1", fingerprint: "fp-1", summary: "increase the timeout", files_touched: [], verification: [], observed_outcome: "no change", evidence: [], next_investigation: "inspect the parser" },
    { id: "attempt-2", fingerprint: "fp-2", summary: "clear the cache", files_touched: [], verification: [], observed_outcome: "still failing", evidence: [], next_investigation: "compare against the upstream fix" },
  ]

  let record = base(scenario, workspace, {
    state: "in_progress",
    attempts: priorAttempts,
    actions: [
      { id: "a1", kind: "read", description: "read the parser", executed: true, source: "observed", tool: "read", exit_code: null, error_category: null, event_id: null },
      { id: "a2", kind: "command", description: "npm test", executed: true, source: "observed", tool: "bash", exit_code: 1, error_category: null, event_id: null },
      { id: "a3", kind: "search", description: "grep for the parser option", executed: true, source: "observed", tool: "grep", exit_code: 0, error_category: null, event_id: null },
    ],
  })

  const trace = [
    { ok: true, event: { schema_version: 1, event_id: nextEventId(), task_id: record.task_id, project_id: record.project_id, timestamp: "2026-10-05T00:00:00.000Z", phase: "act", event_type: "task.started", source: "observed", outcome: "ok", duration_ms: null, tool: null, payload: null, payload_truncated: false } },
    ...record.actions.map((a, i) => ({
      ok: true,
      event: {
        schema_version: 1,
        event_id: nextEventId(),
        task_id: record.task_id,
        project_id: record.project_id,
        timestamp: `2026-10-05T00:00:0${i + 1}.000Z`,
        phase: "act",
        event_type: a.exit_code === 1 ? "action.failed" : "action.executed",
        source: "observed",
        outcome: a.exit_code === 1 ? "error" : "ok",
        duration_ms: 5,
        tool: a.tool,
        exit_code: a.exit_code,
        payload: null,
        payload_truncated: false,
      },
    })),
  ]

  const duplicated = { ...record, actions: [...record.actions, record.actions[0]] }
  const dupRejected = runGraders(["resumePreservesHistory"], {
    taskRecord: duplicated,
    priorAttempts,
  }).some((g) => !g.ok)

  const resumeGraders = runGraders(["resumePreservesHistory", "traceOrdered", "traceIsValid"], {
    taskRecord: record,
    priorAttempts,
    trace,
  })

  return {
    status: "executed",
    negative_control: {
      description: "a duplicated completed action must be detected",
      ok: dupRejected,
      detail: "grader detected a repeated action id",
    },
    graders: resumeGraders,
    record,
  }
}

export function schemaSelfCheck() {
  const empty = makeTaskRecord({ projectId: "x", request: "x" })
  const { validate } = { validate: null }
  return { schema: taskRecordSchema, sample: empty }
}

export function scenariosExist() {
  return loadScenarios().length
}

export function workspaceIsIsolated(dir) {
  return existsSync(dir) && !dir.includes("node_modules")
}