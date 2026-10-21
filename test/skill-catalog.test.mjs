import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { validateRegistry } from "../src/routing/route.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

test("every skill has a description that routes it", async () => {
  const registry = (await import("../scripts/build-registry.mjs")).buildRegistry()
  assert.equal(validateRegistry(registry).valid, true)

  for (const skill of registry.skills) {
    const text = readFileSync(join(repoRoot, skill.path), "utf8")
    assert.ok(/^---\r?\n/.test(text), `${skill.skill} must start with frontmatter`)
    assert.ok(text.includes(`name: ${skill.skill}`), `${skill.skill} frontmatter name mismatch`)
    assert.ok(
      skill.description.length > 40,
      `${skill.skill} description is too short to route reliably (${skill.description.length} chars)`,
    )
  }
})

test("no two skills claim the same trigger phrase", async () => {
  const registry = (await import("../scripts/build-registry.mjs")).buildRegistry()
  const byTrigger = new Map()
  for (const skill of registry.skills) {
    for (const trigger of skill.triggers) {
      byTrigger.set(trigger, [...(byTrigger.get(trigger) ?? []), skill.skill])
    }
  }
  const shared = [...byTrigger.entries()].filter(([, owners]) => owners.length > 1)
  assert.deepEqual(shared, [], `ambiguous triggers: ${shared.map(([t, o]) => `${t} -> ${o.join(",")}`).join("; ")}`)
})

test("the guardrail plugin ships as inert source and is not auto-installed", async () => {
  const { existsSync } = await import("node:fs")
  assert.ok(
    existsSync(join(repoRoot, "guardrails", "overgeared-skills-guardrails.js")),
    "guardrail source must ship",
  )
  assert.equal(
    existsSync(join(repoRoot, "plugins", "overgeared-skills-guardrails.js")),
    false,
    "guardrails must never land in plugins/, where OpenCode auto-loads them",
  )
  assert.ok(existsSync(join(repoRoot, "plugins", "overgeared-skills-trace.js")), "the trace plugin must ship")

  const installFile = join(repoRoot, "INSTALL.md")
  if (existsSync(installFile)) {
    const manifest = readFileSync(installFile, "utf8")
    assert.ok(
      manifest.includes("guardrails/") && !manifest.includes("guardrails/** -> <opencode-root>/plugins/"),
      "INSTALL.md must document guardrails as shipped-but-inert",
    )
  }
})