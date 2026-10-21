import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

export const STATES = ["selected", "instructions_loaded", "required_steps_performed", "outcome_verified"]

export function createSessionState() {
  return {
    schema_version: 1,
    capabilities: new Map(),
    events: [],
  }
}

function entryFor(state, id) {
  if (!state.capabilities.has(id)) {
    state.capabilities.set(id, {
      id,
      selected: false,
      instructions_loaded: false,
      required_steps_performed: false,
      outcome_verified: false,
      load_evidence: null,
      steps: [],
      revision: null,
    })
  }
  return state.capabilities.get(id)
}

export function markSelected(state, capability, evidence = null) {
  const entry = entryFor(state, capability.id)
  entry.selected = true
  entry.kind = capability.kind
  entry.path = capability.path
  entry.reason = capability.reason ?? null
  entry.waivable_steps = Array.isArray(capability.waivable_steps) ? capability.waivable_steps : []
  state.events.push({ id: capability.id, state: "selected", at: new Date().toISOString(), evidence })
  return entry
}

export function markLoaded(state, capability, loadEvidence) {
  const entry = entryFor(state, capability.id)
  if (!entry.selected) {
    throw new Error(`"${capability.id}" cannot be marked loaded before it is selected`)
  }
  entry.instructions_loaded = true
  entry.load_evidence = loadEvidence
  state.events.push({ id: capability.id, state: "instructions_loaded", at: new Date().toISOString(), evidence: loadEvidence })
  return entry
}

export function recordStep(state, id, step, status, evidence = null, waiver = null) {
  const entry = entryFor(state, id)

  if (status === "performed") {
    const observed = evidence && typeof evidence === "object" && evidence.source === "observed"
    if (!observed) {
      throw new Error(
        `step "${step}" of "${id}" is marked performed but carries no observed evidence; ` +
          `pass evidence as { source: "observed", kind, reference } and never as a claim`,
      )
    }
  }

  if (status === "not_applicable") {
    const declared = (entry.waivable_steps ?? []).find((w) => w.step === step)
    if (!declared) {
      throw new Error(
        `step "${step}" of "${id}" is marked not_applicable but the canonical workflow declares no ` +
          `waiver for it; add it to waivable_steps before using it as an exception`,
      )
    }
    if (!waiver || typeof waiver.reason !== "string" || waiver.reason.trim() === "") {
      throw new Error(`step "${step}" of "${id}" needs the waiver reason declared by the workflow`)
    }
    if (declared.reason && waiver.reason.trim() !== declared.reason.trim()) {
      throw new Error(
        `step "${step}" of "${id}" waiver reason does not match the canonical workflow, which allows: ` +
          `"${declared.reason}"`,
      )
    }
  }

  entry.steps.push({
    step,
    status,
    evidence: status === "performed" ? evidence : null,
    waiver: status === "not_applicable" ? waiver : null,
    at: new Date().toISOString(),
  })
  return entry
}

export function markPerformed(state, capability, steps = []) {
  const entry = entryFor(state, capability.id)
  entry.steps = []
  for (const s of steps) {
    const step = typeof s === "string" ? s : s.step
    const status = typeof s === "string" ? "performed" : (s.status ?? "performed")
    const evidence = typeof s === "string" ? null : (s.evidence ?? null)
    const waiver = typeof s === "string" ? null : (s.waiver ?? null)
    recordStep(state, capability.id, step, status, evidence, waiver)
  }
  entry.required_steps_performed = true
  state.events.push({ id: capability.id, state: "required_steps_performed", at: new Date().toISOString() })
  return entry
}

export function markVerified(state, capability, evidence) {
  const entry = entryFor(state, capability.id)
  if (!entry.required_steps_performed) {
    throw new Error(`"${capability.id}" cannot be verified before its required steps are performed`)
  }
  entry.outcome_verified = true
  entry.verification_evidence = evidence
  state.events.push({ id: capability.id, state: "outcome_verified", at: new Date().toISOString(), evidence })
  return entry
}

export function adherenceOf(state, id) {
  const entry = state.capabilities.get(id)
  if (!entry) {
    return { id, selected: false, instructions_loaded: false, required_steps_performed: false, outcome_verified: false }
  }
  return {
    id,
    kind: entry.kind,
    selected: entry.selected,
    instructions_loaded: entry.instructions_loaded,
    required_steps_performed: entry.required_steps_performed,
    outcome_verified: entry.outcome_verified,
    load_evidence: entry.load_evidence,
  }
}

export function assertFollowed(state, id) {
  const a = adherenceOf(state, id)
  if (!a.selected) throw new Error(`"${id}" was never selected`)
  if (!a.instructions_loaded) {
    throw new Error(`"${id}" was selected but its instructions were never loaded; workflow execution cannot be claimed`)
  }
  return a
}

export function completionFindings(state, id) {
  const entry = state.capabilities.get(id)
  if (!entry) return { ok: false, reasons: [`"${id}" was never selected`] }
  const reasons = []
  if (!entry.instructions_loaded) reasons.push(`"${id}" instructions were never loaded`)

  for (const step of entry.steps) {
    if (step.status === "performed" && (!step.evidence || step.evidence.source !== "observed")) {
      reasons.push(`"${id}" step "${step.step}" is recorded as performed without observed evidence`)
    }
    if (step.status === "not_applicable") {
      const declared = (entry.waivable_steps ?? []).find((w) => w.step === step.step)
      if (!declared) {
        reasons.push(`"${id}" step "${step.step}" is not_applicable but no waiver is declared by the workflow`)
      } else if (!step.waiver || !step.waiver.reason) {
        reasons.push(`"${id}" step "${step.step}" is not_applicable without its declared waiver reason`)
      }
    }
  }

  const missing = entry.steps.filter((s) => !["performed", "not_applicable"].includes(s.status))
  if (entry.selected && !entry.required_steps_performed && missing.length === 0) {
    reasons.push(`"${id}" required steps were never recorded as performed`)
  }
  for (const step of missing) reasons.push(`"${id}" step "${step.step}" is ${step.status}`)
  return { ok: reasons.length === 0, reasons, adherence: adherenceOf(state, id) }
}

const MUTATION =
  /(^|[;&|]\s*|\b)(rm|mv|cp|dd|chmod|chown|mkdir|touch|truncate|install|unlink|rename|tee)\b|(^|\s)(curl|wget)\b[^|;&]*\s(-o|--output)\b|\s-delete\b|>>|>\s*(~|\$HOME|\.{0,2}[\/\\])|\s-[A-Za-z]*[ow][A-Za-z]*\s/

const SCRIPT_INTERPRETER =
  /(^|[;&|]\s*)(node|bun|deno|python3?|py|ruby|perl|pwsh|powershell|bash|sh|zsh)\b(?!\s--(?:version|help))/

export function isGuardedAction(command, registry) {
  const text = String(command ?? "").toLowerCase()

  const targetsByCapability = {
    "update-overgeared-skills": [".config/opencode", ".overgeared-skills"],
    "install-overgeared-skills": [".config/opencode", ".overgeared-skills"],
    "git-push": ["git push", "git commit", "git checkout -b", "git merge"],
  }

  const owners = []
  for (const capability of registry.capabilities.filter((c) => c.guarded)) {
    const matched = (targetsByCapability[capability.id] ?? []).find((t) => text.includes(t.toLowerCase()))
    if (matched) owners.push({ capability, matched })
  }

  if (owners.length === 0) return { guarded: false }

  const gitMutation = owners.some((o) => o.capability.id === "git-push")
  const runsScript = SCRIPT_INTERPRETER.test(text)
  const mutates = MUTATION.test(text) || runsScript

  if (!gitMutation && !mutates) {
    return { guarded: false, reason: "read-only inspection of a guarded path is permitted" }
  }

  return {
    guarded: true,
    owners,
    capability: owners[0].capability,
    matched: owners[0].matched,
    reason: runsScript ? "runs a script against a guarded path" : "mutates a guarded path",
  }
}

export function loadCapabilityBody(registry, capability, opencodeRoot) {
  const candidate = join(opencodeRoot, capability.path)
  if (!existsSync(candidate)) {
    return { ok: false, reason: `capability file not found at ${capability.path}` }
  }
  const body = readFileSync(candidate, "utf8")
  const stat = statSync(candidate)
  return {
    ok: true,
    body,
    path: capability.path,
    bytes: stat.size,
    revision_hint: body.slice(0, 200),
  }
}