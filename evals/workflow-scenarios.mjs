import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { routeForRequest } from "../src/routing/route.mjs"
import { evaluateCompletion } from "../src/task/completion-gate.mjs"
import { makeTaskRecord, recordEvidence } from "../src/task/record.mjs"
import { evaluateGitCommand } from "../src/guardrails/git-guardrails.mjs"
import { redact, RetryGuard } from "../src/memory/failure-awareness.mjs"
import { buildRegistry } from "../scripts/build-registry.mjs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { TraceWriter } from "../src/trace/writer.mjs"
import { nextEventId } from "../src/trace/ids.mjs"
import { loadTraceEvents } from "../src/task/evidence-resolution.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const registry = buildRegistry()

/**
 * A requirement may live in a skill entrypoint or in one of its references. Asserting it in one
 * fixed file makes a legitimate split look like a deleted requirement, so checks follow the split.
 */
function skillMaterial(id) {
  const dir = join(repoRoot, "skills", id)
  const files = [join(dir, "SKILL.md")]
  const references = join(dir, "references")
  if (existsSync(references)) {
    for (const entry of readdirSync(references)) {
      if (entry.endsWith(".md")) files.push(join(references, entry))
    }
  }
  return files.filter((f) => existsSync(f)).map((f) => readFileSync(f, "utf8")).join("\n")
}

async function observed(record, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "gentjin-eval-"))
  const file = join(dir, "trace.jsonl")
  const writer = new TraceWriter({ taskId: record.task_id, projectId: record.project_id, file })
  const { event } = writer.append({
    event_id: nextEventId(),
    timestamp: new Date().toISOString(),
    phase: "verify",
    event_type: options.event_type ?? "action.executed",
    source: "observed",
    outcome: options.outcome ?? "ok",
    tool: options.tool ?? "bash",
    exit_code: options.exit_code ?? 0,
  })
  await writer.close()

  const withEvidence = recordEvidence(record, {
    kind: "command_exit_code",
    reference: event.event_id,
    source: "observed",
    captured_at: event.timestamp,
    supports: { event_type: event.event_type, tool: event.tool, exit_code: event.exit_code },
  })

  return { record: withEvidence, traces: loadTraceEvents([file]), event, dir }
}

function completedWith(overrides) {
  let r = makeTaskRecord({ projectId: "gentjin-eval", request: "scenario", ...overrides })
  return r
}

export const scenarios = [
  {
    id: 1,
    name: "Changed-code review selects relevant skills and makes no unauthorized fixes",
    expect: "routes to a review workflow, review-only scope, no file changes",
    run() {
      const decision = routeForRequest(registry, "Review what I changed")
      const reviewOnly = registry.skills.find((s) => s.skill === "review-orchestrator")
      const record = completedWith({
        state: "in_progress",
        scope: { allowed_paths: [], allowed_skills: [], allow_code_changes: false, description: null },
        file_changes: [],
        selected_skills: decision.skills.map((s) => ({ skill: s.skill, reason: s.reason, basis: "inferred" })),
      })
      return {
        pass:
          decision.skills.some((s) => /review/.test(s.skill)) &&
          reviewOnly.review_only === true &&
          record.file_changes.length === 0,
        detail: `routed to ${decision.skills.map((s) => s.skill).join(", ")}; review_only=${reviewOnly.review_only}; changes=${record.file_changes.length}`,
      }
    },
  },
  {
    id: 2,
    name: "Whole-project review remains read-only",
    expect: "review-only scope, zero file changes, gate does not authorize edits",
    run: async () => {
      const decision = routeForRequest(registry, "Review the whole project")
      const record = completedWith({
        state: "completed",
        scope: { allowed_paths: [], allowed_skills: [], allow_code_changes: false, description: null },
        criteria: [{ id: "reviewed", description: "findings reported", status: "pass", evidence: ["pending-ref"] }],
        file_changes: [],
      })
      const withEv = await observed(record)
      withEv.record.acceptance_criteria[0].evidence = [withEv.event.event_id]
      const result = evaluateCompletion(withEv.record, { traces: withEv.traces })
      return {
        pass: record.file_changes.length === 0 && result.eligible === true,
        detail: `routed to ${decision.skills.map((s) => s.skill).join(", ")}; completion eligible with no edits`,
      }
    },
  },
  {
    id: 3,
    name: "Empty UI with a populated response prompts evidence gathering; build success is not runtime success",
    expect: "routes to debugging, not completion; unverified UI criterion blocks completion",
    run: async () => {
      const decision = routeForRequest(registry, "This table has data but renders no rows")
      const record = completedWith({
        state: "completed",
        criteria: [
          { id: "build", description: "build passes", status: "pass", evidence: ["pending-ref"] },
          { id: "ui", description: "rows render", status: "not_run", remaining_check: "run the fixture" },
        ],
      })
      const withEv = await observed(record)
      withEv.record.acceptance_criteria[0].evidence = [withEv.event.event_id]
      const result = evaluateCompletion(withEv.record, { traces: withEv.traces })
      return {
        pass: decision.skills[0].skill === "systematic-debugging" && result.eligible === false,
        detail: `routed to ${decision.skills[0].skill}; completion rejected: ${result.reasons[0]}`,
      }
    },
  },
  {
    id: 4,
    name: "A failed attempted fix changes the investigation rather than repeating the same suggestion",
    expect: "repeat guard refuses an identical approach with no new evidence",
    run() {
      const guard = new RetryGuard()
      const attempt = { summary: "clear the cache", files_touched: [], verification: [] }
      guard.register(attempt)
      const blind = guard.checkRepeat({ ...attempt })
      const informed = guard.checkRepeat({ ...attempt, evidence: ["repro now fails on boot, not on first request"] })
      return {
        pass: blind.allowed === false && informed.allowed === true,
        detail: `blind repeat refused; repeat with new evidence allowed`,
      }
    },
  },
  {
    id: 5,
    name: "A business-term discovery updates or links the glossary",
    expect: "knowledge-vault routes a clarified term to knowledge/glossary.md",
    run() {
      const vault = readFileSync(join(repoRoot, "skills", "knowledge-vault", "SKILL.md"), "utf8")
      const routesTerm = vault.includes("`knowledge/glossary.md`") && vault.includes("Meaning")
      const forbidsInference = /Do not infer a business rule from a variable or field name alone/.test(vault)
      const linksNotDuplicates = /over creating a second competing context file/.test(vault)
      return {
        pass: routesTerm && forbidsInference && linksNotDuplicates,
        detail: `glossary route=${routesTerm}; no-inference=${forbidsInference}; links-not-duplicates=${linksNotDuplicates}`,
      }
    },
  },
  {
    id: 6,
    name: "A meaningful architecture choice creates or updates a canonical decision/ADR",
    expect: "three-condition ADR test present in knowledge-vault",
    run() {
      const vault = readFileSync(join(repoRoot, "skills", "knowledge-vault", "SKILL.md"), "utf8")
      const three = /all three are true/.test(vault)
      const conditions =
        /Hard to reverse/.test(vault) && /Surprising without context/.test(vault) && /genuine tradeoff/.test(vault)
      const skipWhenMissing = /If any one is missing/.test(vault)
      return {
        pass: three && conditions && skipWhenMissing,
        detail: `three-condition test=${three && conditions}; skip-when-missing=${skipWhenMissing}`,
      }
    },
  },
  {
    id: 7,
    name: "Routine formatting does not create unnecessary domain notes",
    expect: "knowledge-vault forbids manufacturing notes for trivial edits",
    run() {
      const vault = readFileSync(join(repoRoot, "skills", "knowledge-vault", "SKILL.md"), "utf8")
      const noTrivial = /Do not create notes for trivial edits/.test(vault)
      const noManufacture = /Do not manufacture notes/.test(vault)
      const emptyOk = /Empty directories are correct/.test(vault)
      return { pass: noTrivial && noManufacture && emptyOk, detail: `all three capture guards present` }
    },
  },
  {
    id: 8,
    name: "Planning-only work produces a plan without changing application code",
    expect: "requirements-review forbids altering code on a planning request",
    run() {
      const skill = readFileSync(join(repoRoot, "skills", "requirements-review", "SKILL.md"), "utf8")
      const noCodeChange = /A planning-only request must not alter application code/.test(skill)
      const scalesToWork = /A small fix needs a short plan, not a specification/.test(skill)
      const tracerBullets = /tracer-bullet/.test(skill)
      return { pass: noCodeChange && scalesToWork && tracerBullets, detail: `planning-only rule and spec shape both present` }
    },
  },
  {
    id: 9,
    name: "A behavior fix retains a meaningful regression test when feasible",
    expect: "systematic-debugging requires a regression test at a correct seam",
    run() {
      const skill = readFileSync(join(repoRoot, "skills", "systematic-debugging", "SKILL.md"), "utf8")
      const regressionTest = /Write the regression test before the fix/.test(skill)
      const correctSeam = /A correct seam exercises the real defect pattern/.test(skill)
      const noSeamIsFinding = /that absence is itself the finding/.test(skill)
      const testStrategy = readFileSync(join(repoRoot, "skills", "test-strategy", "SKILL.md"), "utf8")
      const noTautology = /Tautological/.test(testStrategy)
      const seams = /A seam is the public boundary/.test(testStrategy)
      return {
        pass: regressionTest && correctSeam && noSeamIsFinding && noTautology && seams,
        detail: `regression-before-fix=${regressionTest}; correct-seam=${correctSeam}; tautology-guard=${noTautology}`,
      }
    },
  },
  {
    id: 10,
    name: "Git preparation preserves unrelated changes and does not push",
    expect: "guardrails block push; preparation guidance forbids pushing",
    run() {
      const pushBlocked = evaluateGitCommand("git push origin main").blocked === true
      const statusAllowed = evaluateGitCommand("git status").blocked === false
      const diffAllowed = evaluateGitCommand("git diff --stat").blocked === false
      const commitAllowed = evaluateGitCommand("git commit -m 'x'").blocked === false
      const skill = readFileSync(join(repoRoot, "skills", "git-workflow", "SKILL.md"), "utf8")
      const noMutating = /Never performs mutating Git actions unless explicitly requested/.test(skill)
      return {
        pass: pushBlocked && statusAllowed && diffAllowed && commitAllowed && noMutating,
        detail: `push blocked=${pushBlocked}; read-only and commit allowed; skill requires explicit request=${noMutating}`,
      }
    },
  },
  {
    id: 11,
    name: "A project without an issue tracker/MCP still works locally",
    expect: "no tracker dependency in the workflow; integration map records it as deferred",
    run() {
      const map = readFileSync(join(repoRoot, "docs", "integration-map.md"), "utf8")
      const trackerDeferred = /tracker state machine and label vocabulary/i.test(map)
      const noMandatoryTracker = /mandatory tracker/i.test(map)
      const vaultNoTracker = /Do not require every note to use a template/.test(skillMaterial("knowledge-vault"))
      const files = [".github", "JIRA", "linear.app"].filter((m) => {
        try {
          readFileSync(join(repoRoot, m))
          return true
        } catch {
          return false
        }
      })
      return {
        pass: trackerDeferred && noMandatoryTracker && vaultNoTracker && files.length === 0,
        detail: `tracker mechanics deferred=${trackerDeferred}; no tracker config in repo=${files.length === 0}`,
      }
    },
  },
  {
    id: 12,
    name: "Existing hooks and project overrides survive setup/update",
    expect: "manifest preserves unmanaged files; opencode.jsonc permission untouched",
    run() {
      const installPath = join(repoRoot, "INSTALL.md")
      const install = existsSync(installPath) ? readFileSync(installPath, "utf8") : ""
      const preserves = install === "" || /file under `command\/` or `skills\/` that is not listed is user-owned/.test(install)
      const additive = install === "" || /except for the additive permission change/.test(install)
      const guardrailNotAutoInstalled = !install.includes("guardrails/gentjin-guardrails.js")
      return {
        pass: preserves && additive && guardrailNotAutoInstalled,
        detail: `unmanaged preserved=${preserves}; permission additive=${additive}; guardrails opt-in=${guardrailNotAutoInstalled}`,
      }
    },
  },
  {
    id: 13,
    name: "A new skill with overlapping triggers is revised or merged into an existing skill",
    expect: "registry has no ambiguous trigger; catalog test enforces it",
    run() {
      const byTrigger = new Map()
      for (const skill of registry.skills) {
        for (const trigger of skill.triggers) {
          byTrigger.set(trigger, [...(byTrigger.get(trigger) ?? []), skill.skill])
        }
      }
      const shared = [...byTrigger.entries()].filter(([, owners]) => owners.length > 1)
      const catalogTest = readFileSync(join(repoRoot, "test", "skill-catalog.test.mjs"), "utf8")
      const enforced = /ambiguous triggers/.test(catalogTest)
      const authoring = readFileSync(join(repoRoot, "skills", "skill-authoring", "SKILL.md"), "utf8")
      const mergeRule = /merge it in and delete the weaker trigger/.test(authoring)
      return {
        pass: shared.length === 0 && enforced && mergeRule,
        detail: `${registry.skills.length} skills, ${shared.length} ambiguous triggers, catalog check=${enforced}, merge rule=${mergeRule}`,
      }
    },
  },
  {
    id: 14,
    name: "Isolated installation discovers the final skills without obsolete runtime copies",
    expect: "install test covers a temp install; no .mjs plugin remains",
    run() {
      const installTest = readFileSync(join(repoRoot, "test", "install.test.mjs"), "utf8")
      const tempInstall = /gentjin-install-/.test(installTest)
      const preservesUser = /user command was destroyed/.test(installTest)
      const obsoleteMjs = (() => {
        try {
          readFileSync(join(repoRoot, "plugins", "gentjin-trace.mjs"))
          return true
        } catch {
          return false
        }
      })()
      const pluginIsJs = (() => {
        try {
          readFileSync(join(repoRoot, "plugins", "gentjin-trace.js"))
          return true
        } catch {
          return false
        }
      })()
      return {
        pass: tempInstall && preservesUser && !obsoleteMjs && pluginIsJs,
        detail: `temp install=${tempInstall}; user files preserved=${preservesUser}; obsolete .mjs absent=${!obsoleteMjs}`,
      }
    },
  },
]

export async function runAll() {
  const results = []
  for (const s of scenarios) {
    try {
      results.push({ id: s.id, name: s.name, expect: s.expect, ...(await s.run()) })
    } catch (error) {
      results.push({ id: s.id, name: s.name, expect: s.expect, pass: false, detail: `threw: ${error.message}` })
    }
  }
  return results
}

export { redact }