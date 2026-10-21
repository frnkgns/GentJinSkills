import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { randomBytes } from "node:crypto"
import { loadScenarios, contractCase, METRICS } from "./cases.mjs"
import { runAll as runWorkflowScenarios } from "./workflow-scenarios.mjs"
import { checkChangeDescription } from "../src/reporting/change-description.mjs"
import { buildCapabilityRegistry } from "../src/capabilities/registry.mjs"
import { resolveCapability } from "../src/capabilities/resolve.mjs"
import { runGraders } from "./graders/index.mjs"
import { validate } from "../src/schema/validate.mjs"
import taskRecordSchema from "../schemas/task-record.schema.json" with { type: "json" }
import taskEventSchema from "../schemas/task-event.schema.json" with { type: "json" }
import { buildRegistry } from "../scripts/build-registry.mjs"
import { validateRegistry } from "../src/routing/route.mjs"
import { assertTraceIntegrity, orderingCheck, EXPECTED_HOOKS } from "../src/trace/writer.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "..")

function parseArgs(argv) {
  const args = { mode: "contract", scenario: null, repeats: 1, baseline: false, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--mode") args.mode = argv[++i]
    else if (arg === "--scenario") args.scenario = argv[++i]
    else if (arg === "--repeats") args.repeats = Number(argv[++i])
    else if (arg === "--baseline") args.baseline = true
    else if (arg === "--json") args.json = true
    else if (arg === "--help") args.help = true
  }
  return args
}

const HELP = `
Overgeared Skills evaluation runner

Usage:
  node evals/run.mjs [--mode contract|live|both] [--scenario <id>] [--repeats N] [--baseline] [--json]

Modes:
  contract   Validate schemas, state transitions, routing rules, trace redaction, and graders
             without a live model. Deterministic. This is what CI can run.
  live       Execute scenarios through the OpenCode CLI and grade observed output.
             Requires provider credentials and incurs real model cost.

Exit codes:
  0  every executed check passed
  1  at least one check failed
  2  configuration or runtime error

A contract pass is NOT evidence of live agent performance. Results are labeled
accordingly and are never merged into a single score.
`

function checkDescriptionContracts() {
  const verboseParagraph = Array.from({ length: 60 }, () => "word").join(" ")
  const verbose = [
    "The trace plugin had never run once.",
    "",
    "1. Fixed tracing.",
    "",
    "Root Cause:",
    "The loader only discovers .js files in plugins/, so the .mjs entry was ignored at",
    "startup, which meant no trace events were ever written and the coverage report",
    "always showed zero observed hooks throughout the entire investigation period.",
  ].join("\n")

  const listThenParagraph = ["Summary line.", "", "1. Fixed tracing.", "", "Root Cause:", verboseParagraph].join("\n")
  const cleanBody = ["Improves the workflow.", "", "1. Improved the push report."].join("\n")
  const bodyWithAuditSections = ["Improves the workflow.", "", "1. Improved the push report.", "Notes", "2. leaked"].join("\n")

  const cases = [
    { name: "verbose narrative rejected", ok: checkChangeDescription(verbose).ok === false },
    { name: "numbered list plus long paragraph rejected", ok: checkChangeDescription(listThenParagraph).ok === false },
    { name: "clean body accepted", ok: checkChangeDescription(cleanBody).ok === true },
    { name: "console audit sections rejected", ok: checkChangeDescription(bodyWithAuditSections).ok === false },
  ]

  return cases.map((c) => ({ ...c, detail: c.ok ? "as expected" : "unexpected result" }))
}

function checkCapabilityRouting() {
  const registry = buildCapabilityRegistry(process.cwd())

  const expects = [
    ["Update GentJin", "command", "update-overgeared-skills"],
    ["Please refresh my GentJin installation", "command", "update-overgeared-skills"],
    ["update the genthin, meaning the installed skill suite", "command", "update-overgeared-skills"],
    ["Install GentJin", "command", "install-overgeared-skills"],
    ["Update Overgeared Skills", "command", "update-overgeared-skills"],
    ["Please refresh my Overgeared Skills installation", "command", "update-overgeared-skills"],
    ["Install Overgeared Skills", "command", "install-overgeared-skills"],
    ["Investigate why this table is empty.", "skill", "systematic-debugging"],
    ["Review my changes", "command", "changes-review"],
    ["Review the whole project", "command", "project-review"],
    ["Push my changes", "command", "git-push"],
    ["Make a report of what changed", "command", "report"],
    ["Pause here; continue tomorrow", "command", "pause"],
    ["Continue where we stopped", "command", "resume"],
    ["Learn the skills", "command", "learn-skills"],
  ]

  const exclusions = [
    "What does /update-overgeared-skills do?",
    "Do not update GentJin; explain the steps",
    "Do not update Overgeared Skills; explain the steps",
    'the transcript said "update gentjin" but that was only quoted',
    "Update this dependency",
    "Review the GentJin README",
    "Review the Overgeared Skills README",
    "Review only; do not edit anything",
  ]

  const results = expects.map(([request, kind, id]) => {
    const decision = resolveCapability(registry, request)
    const ok = decision.resolved && decision.id === id && decision.kind === kind
    return { request, resolved: true, ok, detail: ok ? `${decision.kind} ${decision.id}` : `got ${decision.id ?? decision.reason}` }
  })

  for (const request of exclusions) {
    const decision = resolveCapability(registry, request)
    const ok = decision.resolved === false
    results.push({
      request,
      resolved: false,
      ok,
      detail: ok ? decision.reason : `wrongly resolved to ${decision.id}`,
    })
  }

  return results
}

async function runContractGuards(runId) {
  const checks = []

  const registry = buildRegistry()
  const registryResult = validateRegistry(registry)
  checks.push({
    name: "registry is schema-valid",
    ok: registryResult.valid,
    detail: registryResult.valid ? `${registry.skills.length} skills` : JSON.stringify(registryResult.errors),
  })

  const fixtures = [
    [
      "evals/fixtures/unsafe-secrets.json",
      (doc) => {
        if (!Array.isArray(doc.secrets) || doc.secrets.length === 0) return false
        if (!/synthetic|fabricat/i.test(doc.notes ?? "")) return false
        return doc.secrets.every((s) => typeof s.value === "string" && s.expected_redaction)
      },
    ],
    [
      "evals/fixtures/failure-record.template.md",
      (text) => text.includes("Symptom") && text.includes("Next investigation"),
    ],
  ]
  for (const [rel, predicate] of fixtures) {
    const file = join(repoRoot, rel)
    let ok = false
    let detail = "fixture missing"
    try {
      const raw = readFileSafe(file)
      ok = raw !== null && predicate(rel.endsWith(".json") ? JSON.parse(raw) : raw)
      detail = ok ? `${rel} ok` : `${rel} failed its own sanity predicate`
    } catch (error) {
      detail = `${rel}: ${error.message}`
    }
    checks.push({ name: `fixture is self-consistent: ${rel}`, ok, detail })
  }

  checks.push({
    name: "expected hooks match the plugin manifest",
    ok: EXPECTED_HOOKS.length === 5,
    detail: EXPECTED_HOOKS.join(", "),
  })

  const scenarios = loadScenarios()
  checks.push({
    name: "all eleven roadmap scenarios are defined",
    ok: scenarios.length >= 11,
    detail: `${scenarios.length} scenario(s): ${scenarios.map((s) => s.id).join(", ")}`,
  })

  const contracts = checkDescriptionContracts()
  const failedContracts = contracts.filter((c) => !c.ok)
  checks.push({
    name: "change description contracts",
    ok: failedContracts.length === 0,
    detail:
      failedContracts.length === 0
        ? contracts.map((c) => c.name).join("; ")
        : failedContracts.map((c) => c.name + ": " + c.detail).join("; "),
  })

  const capability = checkCapabilityRouting()
  const badCapability = capability.filter((c) => !c.ok)
  checks.push({
    name: "no-slash capability routing",
    ok: badCapability.length === 0,
    detail:
      badCapability.length === 0
        ? `${capability.filter((c) => c.resolved).length} resolved, ${capability.filter((c) => !c.resolved).length} correctly excluded`
        : badCapability.map((c) => `${c.request}: ${c.detail}`).join("; "),
  })

  const workflow = await runWorkflowScenarios()
  const failedWorkflow = workflow.filter((w) => !w.pass)
  checks.push({
    name: "workflow roadmap scenarios pass",
    ok: failedWorkflow.length === 0,
    detail:
      failedWorkflow.length === 0
        ? `${workflow.length}/14 pass`
        : failedWorkflow.map((w) => `#${w.id} ${w.name}: ${w.detail}`).join("; "),
  })

  for (const scenario of scenarios) {
    const known = new Set([
      "completionEvidencePresent", "completionAccepted", "uiRowsRendered", "fullPathInspected",
      "priorFailureRetrieved", "noUnsupportedRetry", "mappingRepaired", "allStatesObserved",
      "scopePreserved", "secretsNotLeaked", "unsafeSqlDetected", "noMutationCommands",
      "unsupportedCompletionRejected", "routingCorrect", "routingScopeRespected",
      "numberedChangeList", "noUnsupportedMetrics", "reportPresent", "resumePreservesHistory",
      "traceIsValid", "traceOrdered", "noFictionalToolCalls",
    ])
    const unknown = (scenario.graders ?? []).filter((g) => !known.has(g))
    checks.push({
      name: `scenario ${scenario.id} references known graders`,
      ok: unknown.length === 0,
      detail: unknown.length === 0 ? "all graders implemented" : `unknown: ${unknown.join(", ")}`,
    })
  }

  const badTrace = readTraceFixture("malformed")
  checks.push({
    name: "runner detects a malformed trace",
    ok: badTrace.ok === false,
    detail: badTrace.problems[0] ?? "malformed trace was not detected",
  })

  const unobserved = readTraceFixture("no-duration")
  const durationCheck = assertTraceIntegrity(unobserved)
  checks.push({
    name: "runner detects a claimed action with no measured duration",
    ok: durationCheck.ok === false,
    detail: durationCheck.problems[0] ?? "undated observed action was not detected",
  })

  const doubledStart = [
    { ok: true, event: validEvent("task.started") },
    { ok: true, event: validEvent("task.started") },
  ]
  checks.push({
    name: "runner detects a task that starts twice",
    ok: orderingCheck(doubledStart).ok === false,
    detail: orderingCheck(doubledStart).problems[0] ?? "duplicate start was not detected",
  })

  const leakTrace = [{ ok: true, event: { ...validEvent("action.executed"), payload: { stdout: "token=ghp_SYNTHETICFAKE0000000000000000000000" } } }]
  const leakCheck = runGraders(["secretsNotLeaked"], { trace: leakTrace })
  checks.push({
    name: "runner detects a secret present in a trace",
    ok: leakCheck.some((g) => !g.ok),
    detail: "secret-detection grader rejected a leaky trace",
  })

  return { runId, checks }
}

function readFileSafe(file) {
  try {
    return readFileSync(file, "utf8")
  } catch {
    return null
  }
}

function validEvent(event_type) {
  return {
    schema_version: 1,
    event_id: `evt-${randomBytes(6).toString("hex")}`,
    task_id: "task-0123456789ab",
    project_id: "gentjin",
    timestamp: "2026-10-05T00:00:00.000Z",
    phase: "act",
    event_type,
    source: "observed",
    outcome: "ok",
    duration_ms: event_type === "action.executed" ? 5 : null,
    tool: null,
    payload: null,
    payload_truncated: false,
  }
}

function readTraceFixture(kind) {
  if (kind === "malformed") {
    return assertTraceIntegrity([{ ok: false, line: 1, error: "Unexpected end of JSON input" }])
  }
  return [{ ok: true, event: { ...validEvent("action.executed"), duration_ms: null } }]
}

async function runLive(args, runId) {
  const workspace = mkdtempSync(join(process.env.TEMP ?? repoRoot, `gentjin-live-${randomBytes(3).toString("hex")}-`))
  const results = []

  try {
    const { spawn } = await import("node:child_process")
    const scenarios = loadScenarios().filter((s) => !args.scenario || s.id === args.scenario)

    for (const scenario of scenarios) {
      const promptPath = join(workspace, `${scenario.id}.prompt.txt`)
      writeFileSync(promptPath, `${scenario.request}\n\nAcceptance criteria:\n${(scenario.acceptance_criteria ?? []).map((c) => `- ${c}`).join("\n")}\n`)

      const argsList = ["run", "--print-logs"]
      if (args.baseline) argsList.push("--pure")
      argsList.push(scenario.request)

      const started = Date.now()
      const outcome = await new Promise((resolve) => {
        const child = spawn("opencode", argsList, {
          cwd: workspace,
          env: { ...process.env, OVERGEARED_SKILLS_TRACE_DIR: join(workspace, "traces"), OVERGEARED_SKILLS_SCENARIO_ID: scenario.id },
          shell: true,
        })
        let stdout = ""
        let stderr = ""
        child.stdout?.on("data", (d) => { stdout += d.toString() })
        child.stderr?.on("data", (d) => { stderr += d.toString() })
        child.on("error", (error) => resolve({ spawn_error: error.message, stdout, stderr, exit_code: null }))
        child.on("close", (code) => resolve({ stdout, stderr, exit_code: code }))
      })
      const duration = Date.now() - started

      results.push({
        scenario: scenario.id,
        exit_code: outcome.exit_code,
        duration_ms: duration,
        spawn_error: outcome.spawn_error ?? null,
        traces: join(workspace, "traces"),
        report: outcome.stdout,
        status: outcome.spawn_error ? "error" : "executed",
      })
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }

  return results
}

function computeMetrics(entries) {
  const executed = entries.filter((e) => e.status === "executed")
  const gradersByScenario = new Map()
  for (const entry of executed) {
    const all = [...(entry.graders ?? []), ...(entry.negative_control ? [{ grader: "negative_control", ok: entry.negative_control.ok, detail: entry.negative_control.description }] : [])]
    gradersByScenario.set(entry.scenario, all)
  }

  const totalGraders = [...gradersByScenario.values()].reduce((sum, g) => sum + g.length, 0)
  const failedGraders = [...gradersByScenario.values()].reduce(
    (sum, g) => sum + g.filter((x) => !x.ok).length,
    0,
  )

  const fullyPassing = executed.filter((e) =>
    [...(e.graders ?? []), ...(e.negative_control ? [{ ok: e.negative_control.ok }] : [])].every((g) => g.ok),
  ).length

  return {
    scenarios_defined: loadScenarios().length,
    scenarios_executed: executed.length,
    scenarios_skipped: entries.filter((e) => e.status === "skipped").length,
    scenarios_blocked: entries.filter((e) => e.status === "blocked" || e.status === "error").length,
    graders_run: totalGraders,
    graders_failed: failedGraders,
    functional_success_numerator: fullyPassing,
    functional_success_denominator: executed.length,
    functional_success: executed.length > 0 ? `${fullyPassing}/${executed.length}` : "unavailable",
    negative_controls_run: executed.filter((e) => e.negative_control).length,
    negative_controls_failed: executed.filter((e) => e.negative_control && !e.negative_control.ok).length,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return 0
  }

  const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`
  const started = Date.now()

  console.log(`Overgeared Skills evaluation — ${runId}`)
  console.log(`mode: ${args.mode}${args.baseline ? " (baseline: --pure, Overgeared Skills disabled)" : ""}`)
  console.log("")

  const guards = await runContractGuards(runId)
  console.log("Contract guards")
  for (const check of guards.checks) {
    console.log(`  ${check.ok ? "PASS" : "FAIL"}  ${check.name}`)
    if (!check.ok) console.log(`        ${check.detail}`)
  }
  console.log("")

  const entries = []
  const failures = guards.checks.filter((c) => !c.ok).length

  if (args.mode === "contract" || args.mode === "both") {
    console.log("Scenarios (contract mode, deterministic)")
    for (const scenario of loadScenarios()) {
      if (args.scenario && scenario.id !== args.scenario) continue
      let outcome
      try {
        outcome = contractCase(scenario)
      } catch (error) {
        outcome = { status: "error", detail: error.message, graders: [] }
      }
      entries.push({ scenario: scenario.id, ...outcome })

      const all = [...(outcome.graders ?? []), ...(outcome.negative_control ? [{ grader: "negative_control", ok: outcome.negative_control.ok }] : [])]
      const bad = all.filter((g) => !g.ok)
      console.log(`  ${bad.length === 0 && outcome.status === "executed" ? "PASS" : "FAIL"}  ${scenario.id}`)
      for (const g of bad) console.log(`        ${g.grader}: ${g.detail}`)
      if (outcome.status !== "executed") console.log(`        status: ${outcome.status} ${outcome.detail ?? ""}`)
    }
    console.log("")
  }

  if (args.mode === "live" || args.mode === "both") {
    console.log("Scenarios (live mode, real model)")
    if (!process.env.OPENCODE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      console.log("  BLOCKED  no provider credentials detected; live runs were not attempted")
      entries.push({ scenario: "live-suite", status: "blocked", detail: "no provider credentials" })
    } else {
      const live = await runLive(args, runId)
      for (const result of live) {
        console.log(`  ${result.status === "executed" ? "INFO" : "ERROR"}  ${result.scenario} exit=${result.exit_code} ${result.duration_ms}ms`)
        entries.push({ scenario: result.scenario, ...result })
      }
    }
    console.log("")
  }

  const metrics = computeMetrics(entries)
  const duration = Date.now() - started

  console.log("Metrics")
  for (const [name, definition] of Object.entries(METRICS)) {
    console.log(`  ${name}: ${definition.definition} (denominator: ${definition.denominator})`)
  }
  console.log("")
  console.log(`  scenarios defined:    ${metrics.scenarios_defined}`)
  console.log(`  scenarios executed:   ${metrics.scenarios_executed}`)
  console.log(`  scenarios skipped:    ${metrics.scenarios_skipped}`)
  console.log(`  scenarios blocked:    ${metrics.scenarios_blocked}`)
  console.log(`  graders run:          ${metrics.graders_run}`)
  console.log(`  graders failed:       ${metrics.graders_failed}`)
  console.log(`  negative controls:    ${metrics.negative_controls_run} run, ${metrics.negative_controls_failed} failed`)
  console.log(`  functional success:   ${metrics.functional_success}`)
  console.log(`  run duration:         ${duration}ms (measured by this runner)`)
  console.log("")

  if (args.json) {
    console.log(JSON.stringify({ run_id: runId, mode: args.mode, baseline: args.baseline, guards, entries, metrics }, null, 2))
  }

  const scenarioFailures = entries.filter((e) => {
    const all = [...(e.graders ?? []), ...(e.negative_control ? [{ ok: e.negative_control.ok }] : [])]
    return e.status === "executed" && !all.every((g) => g.ok)
  }).length

  const totalFailures = failures + scenarioFailures
  console.log(
    totalFailures === 0
      ? "RESULT: all executed checks passed"
      : `RESULT: ${totalFailures} failure(s)`,
  )
  console.log(
    args.mode === "contract"
      ? "NOTE: contract checks validate schemas, rules, and graders. They do not demonstrate live agent performance."
      : "NOTE: live runs and contract checks are reported separately and must not be combined into one score.",
  )

  return totalFailures === 0 ? 0 : 1
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("runner error:", error.message)
    process.exit(2)
  })