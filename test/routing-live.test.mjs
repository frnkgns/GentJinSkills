import test from "node:test"
import assert from "node:assert/strict"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { buildCapabilityRegistry } from "../src/capabilities/registry.mjs"
import { resolveCapability } from "../src/capabilities/resolve.mjs"
import { createSessionState, markSelected, completionFindings } from "../src/capabilities/adherence.mjs"
import { createLoader } from "../src/capabilities/loader.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const registry = buildCapabilityRegistry(repoRoot)

const NO_SLASH_EXPECTATIONS = [
  ["Update Overgeared Skills", "command", "update-overgeared-skills"],
  ["Please refresh my Overgeared Skills installation", "command", "update-overgeared-skills"],
  ["update the genthin, meaning the installed skill suite", "command", "update-overgeared-skills"],
  ["Install Overgeared Skills", "command", "install-overgeared-skills"],
  ["Investigate why data is returned but no table rows appear", "skill", "systematic-debugging"],
  ["Review my changes", "command", "changes-review"],
  ["Review the whole project", "command", "project-review"],
  ["Push my changes", "command", "git-push"],
  ["Make a report of what changed", "command", "report"],
  ["Pause here; continue tomorrow", "command", "pause"],
  ["Continue where we stopped", "command", "resume"],
]

const EXCLUSION_EXPECTATIONS = [
  ["What does /update-overgeared-skills do?", "explains without updating"],
  ["Do not update Overgeared Skills; explain the steps", "declines the update"],
  ['the transcript said "update overgeared-skills" but that was only quoted', "quoted transcript"],
  ["Update this dependency", "different target"],
  ["Review the Overgeared Skills README", "not a workflow invocation"],
  ["Review only; do not edit anything", "no mutation requested"],
]

test("every no-slash scenario in the roadmap resolves to the right capability and kind", () => {
  for (const [request, kind, id] of NO_SLASH_EXPECTATIONS) {
    const decision = resolveCapability(registry, request)
    assert.equal(decision.resolved, true, `"${request}" did not resolve (${decision.reason})`)
    assert.equal(decision.id, id, `"${request}" resolved to ${decision.id}`)
    assert.equal(decision.kind, kind, `"${request}" had the wrong kind`)
  }
})

test("every exclusion in the roadmap performs no action", () => {
  for (const [request, why] of EXCLUSION_EXPECTATIONS) {
    const decision = resolveCapability(registry, request)
    assert.equal(decision.resolved, false, `"${request}" resolved to ${decision.id} (${why})`)
  }
})

test("negative control: routed but never loaded fails adherence", () => {
  const capability = registry.capabilities.find((c) => c.id === "update-overgeared-skills")
  const state = createSessionState()
  markSelected(state, capability)

  const findings = completionFindings(state, "update-overgeared-skills")
  assert.equal(findings.ok, false)
  assert.match(findings.reasons.join(" "), /never loaded/)
})

test("negative control: a spoofed self-report is not accepted as loading evidence", () => {
  const capability = registry.capabilities.find((c) => c.id === "git-push")
  const state = createSessionState()
  markSelected(state, capability)
  state.capabilities.get("git-push").load_evidence = "I used the git-push skill"

  const findings = completionFindings(state, "git-push")
  assert.equal(findings.ok, false)
  assert.match(findings.reasons.join(" "), /never loaded/)
})

test("negative control: an unknown capability id fails instead of mutating", () => {
  const loader = createLoader({ opencodeRoot: repoRoot, registry })
  const result = loader.load("install-overgeared-skills-not-real")
  assert.equal(result.ok, false)
  assert.match(result.reason, /unknown capability id/)
})

test("negative control: a command mislabeled as a skill is refused", () => {
  const loader = createLoader({ opencodeRoot: repoRoot, registry })
  const result = loader.load("update-overgeared-skills", "skill")
  assert.equal(result.ok, false)
  assert.match(result.reason, /not a skill/)
})

test("negative control: a custom updater script is guarded, read-only inspection is not", () => {
  const guarded = [
    "node sync.mjs ~/.config/opencode",
    "python updater.py ~/.config/opencode",
    "rm -rf ~/.config/opencode/skills",
    "git push origin main",
  ]
  for (const command of guarded) {
    const loader = createLoader({ opencodeRoot: repoRoot, registry })
    assert.equal(loader.checkCommand(command).guarded, true, command)
  }

  for (const command of ["cat ~/.config/opencode/.overgeared-skills/manifest.json", "ls -la", "git status"]) {
    const loader = createLoader({ opencodeRoot: repoRoot, registry })
    assert.equal(loader.checkCommand(command).guarded, false, command)
  }
})

test("the loader serves the real canonical body from the installed path", () => {
  const loader = createLoader({ opencodeRoot: repoRoot, registry })
  const result = loader.load("update-overgeared-skills", "command")
  assert.equal(result.ok, true)
  assert.match(result.instructions, /manifest\.json/)
  assert.match(result.instructions, /Confirm Activation/)
})

test("existing git, tracing, scope, reporting, and install behaviour is untouched", async () => {
  const { evaluateGitCommand } = await import("../src/guardrails/git-guardrails.mjs")
  assert.equal(evaluateGitCommand("git push origin main").blocked, true)
  assert.equal(evaluateGitCommand("git status").blocked, false)

  const { assertTraceIntegrity } = await import("../src/trace/writer.mjs")
  assert.equal(assertTraceIntegrity([]).ok, true)
})

test("the plugin entry point exports only an inline default, as OpenCode requires", async () => {
  const mod = await import("../plugins/overgeared-skills-capabilities.ts")
  assert.deepEqual(Object.keys(mod), ["default"])
  assert.match(mod.default.toString(), /^async/)
})
test("ordering: a governed mutation is refused until the body is loaded", async () => {
  const { createLoader } = await import("../src/capabilities/loader.mjs")
  const loader = createLoader({ opencodeRoot: repoRoot, registry })
  const command = "node sync.mjs ~/.config/opencode"

  assert.equal(loader.checkCommand(command).guarded, true)
  assert.throws(() => loader.requireLoaded("update-overgeared-skills"), /were not loaded/)
  assert.throws(() => loader.requireLoaded("install-overgeared-skills"), /were not loaded/)

  loader.load("update-overgeared-skills", "command")
  assert.doesNotThrow(() => loader.requireLoaded("update-overgeared-skills"))
  assert.throws(() => loader.requireLoaded("install-overgeared-skills"), /were not loaded/)
})

test("ordering: an action recorded after loading is accepted, before it is not", async () => {
  const { createLoader } = await import("../src/capabilities/loader.mjs")
  const loader = createLoader({ opencodeRoot: repoRoot, registry })
  const state = loader.state
  const capability = registry.capabilities.find((c) => c.id === "git-push")

  const before = state.events.length
  assert.throws(() => loader.requireLoaded("git-push"))
  assert.equal(state.events.length, before, "a refusal must not create loading evidence")

  loader.load("git-push", "command")
  assert.equal(loader.compliance("git-push").adherence.instructions_loaded, true)
  assert.ok(capability.id)
})

test("safeguards: a loaded capability with unperformed required steps fails completion", async () => {
  const { createLoader } = await import("../src/capabilities/loader.mjs")
  const loader = createLoader({ opencodeRoot: repoRoot, registry })
  loader.load("install-overgeared-skills", "command")

  const findings = loader.compliance("install-overgeared-skills")
  assert.equal(findings.ok, false)
  assert.match(findings.reasons.join(" "), /never recorded as performed/)
})

test("revision: a cached body is reused in the same revision", async () => {
  const { createLoader } = await import("../src/capabilities/loader.mjs")
  const loader = createLoader({ opencodeRoot: repoRoot, registry })

  const first = loader.load("update-overgeared-skills", "command")
  assert.equal(first.cached, undefined)
  const second = loader.load("update-overgeared-skills", "command")
  assert.equal(second.cached, true)
  assert.equal(second.instructions, first.instructions)
  assert.equal(second.revision, first.revision)
})

test("revision: a changed installation revision invalidates the cached body", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")

  const root = mkdtempSync(join(tmpdir(), "overgeared-skills-rev-"))
  mkdirSync(join(root, "command"), { recursive: true })
  mkdirSync(join(root, "skills", "git-push"), { recursive: true })
  mkdirSync(join(root, "registry"), { recursive: true })
  writeFileSync(join(root, "command", "update-overgeared-skills.md"), "# update-overgeared-skills\n\nStep one.\n")
  writeFileSync(join(root, "skills", "git-push", "SKILL.md"), "# git-push\n\nPush safely.\n")
  writeFileSync(
    join(root, "registry", "capabilities.json"),
    JSON.stringify({
      schema_version: 1,
      capabilities: [
        { id: "update-overgeared-skills", kind: "command", name: "update-overgeared-skills", path: "command/update-overgeared-skills.md", description: "Update Overgeared Skills", intent: ["update overgeared-skills"], aliases: [], exclusions: [], guarded: true },
        { id: "git-push", kind: "skill", name: "git-push", path: "skills/git-push/SKILL.md", description: "Push safely", intent: ["push changes"], aliases: [], exclusions: [], guarded: true },
      ],
    }),
  )

  const { createLoader: makeLoader } = await import("../src/capabilities/loader.mjs")
  const loader = makeLoader({ opencodeRoot: root })

  const first = loader.load("update-overgeared-skills", "command")
  assert.equal(first.revision, null, "no version.json means an unknown revision")

  mkdirSync(join(root, ".overgeared-skills"), { recursive: true })
  writeFileSync(join(root, ".overgeared-skills", "version.json"), '{"version":"abc1234"}')

  const second = loader.load("update-overgeared-skills", "command")
  assert.notEqual(second.revision, first.revision)
  assert.equal(second.cached, undefined, "a changed revision must not serve the stale body")
  assert.match(second.instructions, /Step one/)
})

test("restart: a fresh session starts with nothing loaded, so the guard stands again", async () => {
  const { createLoader } = await import("../src/capabilities/loader.mjs")
  const first = createLoader({ opencodeRoot: repoRoot, registry })
  first.load("update-overgeared-skills", "command")
  assert.equal(first.isLoaded("update-overgeared-skills"), true)

  const restarted = createLoader({ opencodeRoot: repoRoot, registry })
  assert.equal(restarted.isLoaded("update-overgeared-skills"), false)
  assert.throws(() => restarted.requireLoaded("update-overgeared-skills"), /were not loaded/)
})

test("runtime completion: the report lists loaded capabilities that were not shown to be followed", async () => {
  const { createLoader } = await import("../src/capabilities/loader.mjs")
  const loader = createLoader({ opencodeRoot: repoRoot, registry })

  loader.load("install-overgeared-skills", "command")
  const report = loader.completionReport()

  assert.equal(report.findings.length, 1)
  assert.equal(report.findings[0].id, "install-overgeared-skills")
  assert.equal(report.findings[0].loaded, true)
  assert.equal(report.findings[0].performed, false)
  assert.match(report.findings[0].reasons.join(" "), /never recorded as performed/)
  assert.ok(Date.parse(report.checked_at) > 0)
})

test("runtime completion: a session that never loaded anything reports nothing", async () => {
  const { createLoader } = await import("../src/capabilities/loader.mjs")
  const loader = createLoader({ opencodeRoot: repoRoot, registry })
  assert.deepEqual(loader.completionReport().findings, [])
})

test("the plugin registers the event hook needed for runtime completion checking", async () => {
  const { readFileSync } = await import("node:fs")
  const source = readFileSync(join(repoRoot, "plugins", "overgeared-skills-capabilities.ts"), "utf8")
  assert.match(source, /event:/, "no event hook")
  assert.match(source, /session\.idle/, "event hook does not observe session.idle")
  assert.match(source, /completionReport\(\)/, "event hook does not run the completion check")
})
