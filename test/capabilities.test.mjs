import test from "node:test"
import assert from "node:assert/strict"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { buildCapabilityRegistry, validateCapabilityRegistry } from "../src/capabilities/registry.mjs"
import { resolveCapability, findCapability, findCapabilityOfKind } from "../src/capabilities/resolve.mjs"
import {
  createSessionState,
  markSelected,
  markLoaded,
  markPerformed,
  markVerified,
  adherenceOf,
  assertFollowed,
  completionFindings,
  recordStep,
  isGuardedAction,
} from "../src/capabilities/adherence.mjs"
import { createLoader } from "../src/capabilities/loader.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const registry = buildCapabilityRegistry(repoRoot)

test("the registry is valid and covers both kinds", () => {
  assert.equal(validateCapabilityRegistry(registry).valid, true)
  assert.ok(registry.capabilities.filter((c) => c.kind === "skill").length >= 24)
  assert.ok(registry.capabilities.filter((c) => c.kind === "command").length >= 14)
})

test("entries are derived from real files, not a hardcoded catalog", () => {
  for (const capability of registry.capabilities) {
    assert.ok(capability.path.endsWith(".md"), capability.id)
    assert.ok(capability.description.length > 10, `${capability.id} missing a real description`)
  }
})

test("a command is never mislabeled as a skill", () => {
  const wrong = findCapabilityOfKind(registry, "update-overgeared-skills", "skill")
  assert.equal(wrong.found, false)
  assert.match(wrong.reason, /is a command, not a skill/)

  const right = findCapabilityOfKind(registry, "update-overgeared-skills", "command")
  assert.equal(right.found, true)
})

test("an unknown capability id cannot pass a scope check", () => {
  const result = findCapabilityOfKind(registry, "totally-made-up", "command")
  assert.equal(result.found, false)
  assert.match(result.reason, /unknown capability id/)
})

const NO_SLASH = [
  ["Update Overgeared Skills", "command", "update-overgeared-skills"],
  ["Please refresh my Overgeared Skills installation", "command", "update-overgeared-skills"],
  ["update the genthin, meaning the installed skill suite", "command", "update-overgeared-skills"],
  ["Install Overgeared Skills", "command", "install-overgeared-skills"],
  ["Investigate why this table is empty.", "skill", "systematic-debugging"],
  ["Investigate why data is returned but no table rows appear", "skill", "systematic-debugging"],
  ["Review my changes", "command", "changes-review"],
  ["Review the whole project", "command", "project-review"],
  ["Push my changes", "command", "git-push"],
  ["Make a report of what changed", "command", "report"],
  ["Pause here; continue tomorrow", "command", "pause"],
  ["Continue where we stopped", "command", "resume"],
  ["Learn the skills", "command", "learn-skills"],
  ["Add git guardrails", "command", "setup-git-guardrails"],
]

for (const [request, kind, id] of NO_SLASH) {
  test(`"${request}" resolves to ${id} as a ${kind}`, () => {
    const decision = resolveCapability(registry, request)
    assert.equal(decision.resolved, true, decision.reason)
    assert.equal(decision.id, id)
    assert.equal(decision.kind, kind)
  })
}

const EXCLUSIONS = [
  ["What does /update-overgeared-skills do?", "asks about the capability"],
  ["Do not update Overgeared Skills; explain the steps", "explicitly declines"],
  ["Update this dependency", "different update target"],
  ["Review the Overgeared Skills README", "not a workflow invocation"],
]

for (const [request, why] of EXCLUSIONS) {
  test(`"${request}" performs no action (${why})`, () => {
    const decision = resolveCapability(registry, request)
    assert.equal(decision.resolved, false, `unexpectedly resolved to ${decision.id}`)
    assert.ok(decision.reason.length > 5)
  })
}

test("a quoted transcript containing a command does not execute it", () => {
  const decision = resolveCapability(registry, 'the transcript said "update overgeared-skills" but that was just quoted')
  assert.equal(decision.resolved, false)
})

test("the four adherence states advance in order and cannot be skipped", () => {
  const capability = registry.capabilities.find((c) => c.id === "update-overgeared-skills")
  const state = createSessionState()

  assert.throws(() => markLoaded(state, capability, "x"), /cannot be marked loaded before it is selected/)

  markSelected(state, capability)
  assert.equal(adherenceOf(state, "update-overgeared-skills").instructions_loaded, false)

  markLoaded(state, capability, "loaded command/update-overgeared-skills.md")
  assert.throws(() => markVerified(state, capability, "done"), /cannot be verified before its required steps/)

  markPerformed(state, capability, [{ step: "reconcile", status: "performed", evidence: { source: "observed", kind: "command_exit_code", reference: "exit 0" } }])
  markVerified(state, capability, "exit 0")
  assert.equal(adherenceOf(state, "update-overgeared-skills").outcome_verified, true)
})

test("selection without loading is never reported as workflow execution", () => {
  const capability = registry.capabilities.find((c) => c.id === "update-overgeared-skills")
  const state = createSessionState()
  markSelected(state, capability)

  assert.throws(() => assertFollowed(state, "update-overgeared-skills"), /instructions were never loaded/)

  const findings = completionFindings(state, "update-overgeared-skills")
  assert.equal(findings.ok, false)
  assert.match(findings.reasons.join(" "), /never loaded/)
})

test("a self-reported claim without loading evidence is not accepted", () => {
  const capability = registry.capabilities.find((c) => c.id === "git-push")
  const state = createSessionState()
  markSelected(state, capability)
  assert.throws(
    () => markPerformed(state, capability, [{ step: "pushed", status: "performed", evidence: { source: "asserted", reference: "I said so" } }]),
    /no observed evidence/,
    "a self-reported claim must be refused at the point it is recorded",
  )

  const findings = completionFindings(state, "git-push")
  assert.equal(findings.ok, false)
  assert.match(findings.reasons.join(" "), /never loaded/)
})

test("a skipped required step blocks completion", () => {
  const capability = registry.capabilities.find((c) => c.id === "update-overgeared-skills")
  const state = createSessionState()
  markSelected(state, capability)
  markLoaded(state, capability, "loaded")
  markPerformed(state, capability, [
    { step: "reconcile", status: "performed", evidence: { source: "observed", kind: "command_exit_code", reference: "exit 0" } },
    { step: "cleanup gate", status: "blocked" },
  ])

  const findings = completionFindings(state, "update-overgeared-skills")
  assert.equal(findings.ok, false)
  assert.match(findings.reasons.join(" "), /cleanup gate.*is blocked/)
})

test("a not_applicable step is refused unless the workflow declares that waiver", () => {
  const capability = registry.capabilities.find((c) => c.id === "update-overgeared-skills")
  const state = createSessionState()
  markSelected(state, capability)
  markLoaded(state, capability, "loaded")

  assert.throws(
    () => recordStep(state, "update-overgeared-skills", "stale cleanup", "not_applicable", null, { reason: "nothing to do" }),
    /declares no waiver for it/,
    "an undeclared waiver must be refused",
  )
})

test("a declared waiver with its own reason is accepted", () => {
  const capability = {
    ...registry.capabilities.find((c) => c.id === "update-overgeared-skills"),
    waivable_steps: [{ step: "legacy migration", reason: "only when a legacy directory exists" }],
  }
  const state = createSessionState()
  markSelected(state, capability)
  markLoaded(state, capability, "loaded")

  markPerformed(state, capability, [
    { step: "reconcile", status: "performed", evidence: { source: "observed", kind: "command_exit_code", reference: "exit 0" } },
    { step: "legacy migration", status: "not_applicable", waiver: { reason: "only when a legacy directory exists" } },
  ])

  assert.equal(completionFindings(state, capability.id).ok, true)
})

test("a declared waiver presented with a different reason is refused", () => {
  const capability = {
    ...registry.capabilities.find((c) => c.id === "update-overgeared-skills"),
    waivable_steps: [{ step: "legacy migration", reason: "only when a legacy directory exists" }],
  }
  const state = createSessionState()
  markSelected(state, capability)
  markLoaded(state, capability, "loaded")

  assert.throws(
    () => recordStep(state, capability.id, "legacy migration", "not_applicable", null, { reason: "because I said so" }),
    /does not match the canonical workflow/,
  )
})

test("a performed step is refused without observed evidence", () => {
  const capability = registry.capabilities.find((c) => c.id === "update-overgeared-skills")
  const state = createSessionState()
  markSelected(state, capability)
  markLoaded(state, capability, "loaded")

  assert.throws(() => recordStep(state, capability.id, "reconcile", "performed", null), /no observed evidence/)
  assert.throws(
    () => recordStep(state, capability.id, "reconcile", "performed", { source: "asserted", reference: "I did it" }),
    /no observed evidence/,
    "a caller-supplied claim is not observed evidence",
  )

  markPerformed(state, capability, [{ step: "reconcile", status: "performed", evidence: { source: "observed", kind: "command_exit_code", reference: "exit 0" } }])
  assert.equal(completionFindings(state, capability.id).ok, true)
})

test("guarded actions are detected without blocking unrelated or read-only commands", () => {
  const mutating = [
    "rm -rf ~/.config/opencode/skills",
    "mv ~/.config/opencode ~/.config/opencode.bak",
    "node sync.mjs ~/.config/opencode",
    "git push origin main",
    "git commit -m x",
  ]
  for (const command of mutating) {
    const verdict = isGuardedAction(command, registry)
    assert.equal(verdict.guarded, true, `should guard: ${command}`)
    assert.ok(verdict.capability.guarded === true)
  }

  const allowed = [
    "ls -la",
    "npm test",
    "git status",
    "echo hi",
    "cat ~/.config/opencode/.overgeared-skills/manifest.json",
    "grep -r pattern ~/.config/opencode/skills",
  ]
  for (const command of allowed) {
    assert.equal(isGuardedAction(command, registry).guarded, false, `should allow: ${command}`)
  }
})

test("a guarded path with several owners reports all of them", () => {
  const verdict = isGuardedAction("rm -rf ~/.config/opencode/.overgeared-skills", registry)
  assert.equal(verdict.guarded, true)
  const ids = verdict.owners.map((o) => o.capability.id).sort()
  assert.deepEqual(ids, ["install-overgeared-skills", "update-overgeared-skills"])
})

test("the loader returns the canonical body and caches repeat loads", () => {
  const loader = createLoader({ opencodeRoot: repoRoot, registry })
  const first = loader.load("update-overgeared-skills", "command")
  assert.equal(first.ok, true)
  assert.equal(first.kind, "command")
  assert.match(first.instructions, /Confirm Activation/)
  assert.ok(first.bytes > 500)

  const second = loader.load("update-overgeared-skills", "command")
  assert.equal(second.cached, true)
})

test("the loader refuses a wrong kind and an unknown id", () => {
  const loader = createLoader({ opencodeRoot: repoRoot, registry })
  const wrongKind = loader.load("update-overgeared-skills", "skill")
  assert.equal(wrongKind.ok, false)
  assert.match(wrongKind.reason, /not a skill/)

  const unknown = loader.load("made-up-capability")
  assert.equal(unknown.ok, false)
  assert.match(unknown.reason, /unknown capability id/)
})

test("a loaded capability satisfies its own guard", () => {
  const loader = createLoader({ opencodeRoot: repoRoot, registry })
  const verdict = loader.checkCommand("node sync.mjs ~/.config/opencode")
  assert.equal(verdict.guarded, true)
  assert.equal(loader.isLoaded(verdict.capability.id), false)

  loader.load(verdict.capability.id, "command")
  assert.equal(loader.isLoaded(verdict.capability.id), true)
})
test("a bypassed workflow leaves an open reconciliation that blocks completion", async () => {
  const { makeTaskRecord, markReconciliation, resolveReconciliation, openReconciliations } =
    await import("../src/task/record.mjs")
  const { evaluateCompletion } = await import("../src/task/completion-gate.mjs")

  const base = makeTaskRecord({ request: "update Overgeared Skills", criteria: [] })
  assert.deepEqual(openReconciliations(base), [])

  const bypassed = markReconciliation(base, {
    trigger: "guard_blocked",
    capability: "update-overgeared-skills",
    checks_needed: ["confirm which locally modified files to replace", "verify manifest hashes after write"],
  })

  assert.equal(openReconciliations(bypassed).length, 1)
  assert.equal(bypassed.reconciliation[0].resolved_at, null)

  const attempted = { ...bypassed, state: "completed", outcome: { result: "success", summary: "done", evaluated_at: null } }
  const result = evaluateCompletion(attempted)
  assert.equal(result.eligible, false)
  assert.match(result.reasons.join(" "), /still need reconciliation/)
  assert.match(result.reasons.join(" "), /confirm which locally modified files to replace/)
  assert.ok(result.blocking_criteria.includes("__reconciliation__"))

  const resolved = resolveReconciliation(bypassed, "update-overgeared-skills", ["manifest verified: 0 mismatches"])
  assert.equal(openReconciliations(resolved).length, 0)
  assert.equal(resolved.reconciliation[0].resolution_evidence.length, 1)
})

test("reconciliation refuses to be created without the checks still needed", async () => {
  const { makeTaskRecord, markReconciliation, resolveReconciliation } =
    await import("../src/task/record.mjs")
  const record = makeTaskRecord({ request: "push", criteria: [] })

  assert.throws(
    () => markReconciliation(record, { trigger: "guard_blocked", capability: "git-push", checks_needed: [] }),
    /at least one check/,
  )
  assert.throws(
    () => markReconciliation(record, { trigger: "not_a_trigger", capability: "git-push", checks_needed: ["x"] }),
    /trigger must be one of/,
  )
  assert.throws(
    () => markReconciliation(record, { trigger: "manual", checks_needed: ["x"] }),
    /must name the workflow/,
  )
  assert.throws(() => resolveReconciliation(record, "git-push", []), /no open reconciliation/)
})
