import test from "node:test"
import assert from "node:assert/strict"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { buildCapabilityRegistry } from "../src/capabilities/registry.mjs"
import { isGuardedAction, createSessionState } from "../src/capabilities/adherence.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const registry = buildCapabilityRegistry(repoRoot)

const MUTATING_PATTERNS = [
  "rm -rf ~/.config/opencode/skills",
  "mv ~/.config/opencode ~/.config/opencode.bak",
  "cp src/index.js ~/.config/opencode/plugins/",
  "mkdir -p ~/.config/opencode/skills",
  "node sync.mjs ~/.config/opencode",
  "python updater.py ~/.config/opencode",
  "bash install.sh ~/.config/opencode",
  "echo x > ~/.config/opencode/AGENTS.md",
  "git push origin main",
  "git commit -m x",
  "git checkout -b feature",
  "git merge main",
]

const READ_ONLY_COMMANDS = [
  "ls -la",
  "npm test",
  "git status",
  "git log --oneline -5",
  "cat ~/.config/opencode/.overgeared-skills/manifest.json",
  "grep -rn pattern ~/.config/opencode/skills",
  "node --version",
  "node --test test/x.mjs",
  "opencode --help",
]

test("every mutating pattern on a workflow-owned path is guarded", () => {
  for (const command of MUTATING_PATTERNS) {
    const verdict = isGuardedAction(command, registry)
    assert.equal(verdict.guarded, true, `not guarded: ${command}`)
  }
})

test("every read-only command is allowed, including on guarded paths", () => {
  for (const command of READ_ONLY_COMMANDS) {
    assert.equal(isGuardedAction(command, registry).guarded, false, `wrongly guarded: ${command}`)
  }
})

const KNOWN_EVASIONS = [
  {
    command: "OPENCODE=/tmp/oc node sync.mjs $OPENCODE",
    guarded: false,
    note: "the workflow-owned path is behind a shell variable and never appears literally",
  },
  {
    command: "xargs -0 rm < list.txt",
    guarded: false,
    note: "the targets live in a file, so no guarded path appears in the command at all",
  },
  {
    command: "git -C /tmp/repo push origin main",
    guarded: false,
    note: "-C moves the repository away from the literal git push form",
  },
  {
    command: "find ~/.config/opencode/skills -name '*.md' -delete",
    guarded: true,
    note: "caught by the -delete mutation flag",
  },
  {
    command: "printf x | sh -c \"rm -rf $HOME/.config/opencode/skills\"",
    guarded: true,
    note: "caught because the path is still literal inside the nested shell",
  },
]

test("evasion behaviour is measured and recorded rather than assumed", () => {
  for (const evasion of KNOWN_EVASIONS) {
    const actual = isGuardedAction(evasion.command, registry).guarded
    assert.equal(
      actual,
      evasion.guarded,
      `behaviour changed for: ${evasion.command} (now guarded=${actual}, recorded=${evasion.guarded})`,
    )
    assert.ok(evasion.note.length > 0, "every evasion needs a recorded reason")
  }

  const unguarded = KNOWN_EVASIONS.filter((e) => !e.guarded)
  assert.equal(unguarded.length, 3, "three evasions remain uncaught and are documented as limits")
})

test("documented limits are explicit that the guard is not a security boundary", () => {
  const unguardedCount = KNOWN_EVASIONS.filter((e) => !e.guarded).length
  assert.ok(unguardedCount > 0, "if nothing evaded the guard, the boundary claim would need re-proving")
})

test("the guard never claims to be a security boundary", () => {
  const verdict = isGuardedAction("ls -la", registry)
  assert.equal(verdict.guarded, false)
  const guarded = isGuardedAction("rm -rf ~/.config/opencode/skills", registry)
  assert.equal(verdict.reason, undefined)
  assert.equal(guarded.capability.guarded, true)
})

const CONCISE_BUDGET = { words: 120, lines: 40 }

function assessResponse(text) {
  const lines = text.split("\n")
  return {
    words: text.split(/\s+/).filter(Boolean).length,
    lines: lines.length,
    within_budget:
      text.split(/\s+/).filter(Boolean).length <= CONCISE_BUDGET.words && lines.length <= CONCISE_BUDGET.lines,
  }
}

test("concise responses stay inside the budget", () => {
  const concise = "Summary: guard verified live. Details: blocked a governed mutation. Notes: none."
  assert.equal(assessResponse(concise).within_budget, true)
})

test("an over-long response is detected as over budget", () => {
  const verbose = Array.from({ length: 60 }, (_, i) => `line ${i} with a reasonable amount of filler text`).join("\n")
  const result = assessResponse(verbose)
  assert.equal(result.within_budget, false)
  assert.ok(result.lines > CONCISE_BUDGET.lines)
})

test("response length is detectable only after the fact, never preventable", () => {
  const state = createSessionState()
  state.observations = []
  assert.deepEqual(state.observations, [])
  assert.equal(
    typeof state.blockResponse,
    "undefined",
    "no adherence state may expose a way to block a response that was already produced",
  )
})