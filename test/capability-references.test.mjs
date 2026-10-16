import test from "node:test"
import assert from "node:assert/strict"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { buildCapabilityRegistry, validateCapabilityRegistry } from "../src/capabilities/registry.mjs"
import { findCapability, findCapabilityOfKind } from "../src/capabilities/resolve.mjs"
import { createLoader } from "../src/capabilities/loader.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const registry = buildCapabilityRegistry(repoRoot)

/**
 * knowledge-vault carried 44% of every skill body line in the project, and it is loaded whole the
 * moment it is selected. Splitting it is only safe if a reference can be loaded on its own, so the
 * registry, the kind check, and the loader all had to learn a third kind first. These tests hold
 * that contract, including the ways it can go wrong.
 */

function fixture(skillName, files) {
  const root = mkdtempSync(join(tmpdir(), "gentjin-ref-"))
  mkdirSync(join(root, "skills", skillName), { recursive: true })
  for (const [relative, body] of Object.entries(files)) {
    const file = join(root, "skills", skillName, relative)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, body)
  }
  return root
}

const SKILL = `---
name: demo
description: A demo skill used to prove reference loading works end to end.
---

## Workflow

Load the entrypoint, then load only the reference this task needs.
`

test("a reference becomes its own loadable capability", () => {
  const root = fixture("demo", {
    "SKILL.md": SKILL,
    "references/detail.md": "# Detail\n\nThe long half that only some tasks need.\n",
  })
  try {
    const built = buildCapabilityRegistry(root)
    const reference = built.capabilities.find((c) => c.kind === "reference")
    assert.ok(reference, "no reference capability was registered")
    assert.equal(reference.path, "skills/demo/references/detail.md")
    assert.match(reference.id, /^[a-z0-9][a-z0-9-]*$/)
    assert.equal(reference.scope, "reference_material")
    assert.equal(validateCapabilityRegistry(built).valid, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a reference is namespaced by its skill so two skills cannot collide", () => {
  const root = fixture("demo", {
    "SKILL.md": SKILL,
    "references/detail.md": "# Detail\n",
  })
  try {
    const built = buildCapabilityRegistry(root)
    const reference = built.capabilities.find((c) => c.kind === "reference")
    assert.equal(reference.id, "demo-detail")
    assert.equal(reference.parent, "demo")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a skill lists the references it owns so a session knows they exist", () => {
  const root = fixture("demo", {
    "SKILL.md": SKILL,
    "references/detail.md": "# Detail\n",
    "references/other.md": "# Other\n",
  })
  try {
    const built = buildCapabilityRegistry(root)
    const skill = built.capabilities.find((c) => c.kind === "skill" && c.id === "demo")
    assert.deepEqual(skill.references.sort(), ["demo-detail", "demo-other"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a skill with no references lists none rather than an empty invented set", () => {
  const root = fixture("demo", { "SKILL.md": SKILL })
  try {
    const built = buildCapabilityRegistry(root)
    const skill = built.capabilities.find((c) => c.kind === "skill" && c.id === "demo")
    assert.deepEqual(skill.references, [])
    assert.equal(validateCapabilityRegistry(built).valid, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a skill is never handed a reference that does not exist on disk", () => {
  // The failure this guards against is a dangling link: a skill that tells the model to load
  // something the loader cannot find, which turns into a silently empty instruction.
  const root = fixture("demo", { "SKILL.md": SKILL })
  try {
    const built = buildCapabilityRegistry(root)
    const skill = built.capabilities.find((c) => c.kind === "skill" && c.id === "demo")
    for (const id of skill.references) {
      const found = findCapability(built, id)
      assert.equal(found.found, true, `dangling reference: ${id}`)
      assert.ok(existsSync(join(root, found.capability.path)))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a reference loads on demand instead of arriving with its parent", () => {
  const root = fixture("demo", {
    "SKILL.md": SKILL,
    "references/detail.md": "# Detail\n\nOnly the tasks that need this load it.\n",
  })
  try {
    const loader = createLoader({ repoRoot: root, opencodeRoot: root })
    const skill = loader.load("demo", "skill")
    assert.equal(skill.ok, true)
    assert.equal(skill.instructions.includes("Only the tasks that need this"), false)
    assert.deepEqual(skill.references, ["demo-detail"])

    const reference = loader.load("demo-detail", "reference")
    assert.equal(reference.ok, true)
    assert.equal(reference.instructions.includes("Only the tasks that need this"), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a reference cannot be loaded as if it were a skill", () => {
  const root = fixture("demo", {
    "SKILL.md": SKILL,
    "references/detail.md": "# Detail\n",
  })
  try {
    const built = buildCapabilityRegistry(root)
    const wrong = findCapabilityOfKind(built, "demo-detail", "skill")
    assert.equal(wrong.found, false)
    assert.match(wrong.reason, /is a reference, not a skill/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("loading a reference twice returns the cached body, not a second read", () => {
  const root = fixture("demo", {
    "SKILL.md": SKILL,
    "references/detail.md": "# Detail\n",
  })
  try {
    const loader = createLoader({ repoRoot: root, opencodeRoot: root })
    const first = loader.load("demo-detail", "reference")
    const second = loader.load("demo-detail", "reference")
    assert.equal(first.cached, undefined)
    assert.equal(second.cached, true)
    assert.equal(second.instructions, first.instructions)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a skill declares no references in the shipped project unless the files exist", () => {
  for (const capability of registry.capabilities) {
    if (capability.kind !== "skill") continue
    for (const id of capability.references ?? []) {
      const found = findCapability(registry, id)
      assert.equal(found.found, true, `${capability.id} references unknown ${id}`)
      assert.equal(found.capability.kind, "reference")
      assert.ok(existsSync(join(repoRoot, found.capability.path)))
    }
  }
})

test("splitting a skill must not strand a requirement in the entrypoint", () => {
  // Every requirement that used to live in the split section has to remain reachable, whether it
  // stayed in SKILL.md or moved to a reference.
  const loaded = new Set()
  for (const capability of registry.capabilities) {
    if (capability.kind !== "skill") continue
    loaded.add(capability.path)
    for (const id of capability.references ?? []) {
      const found = findCapability(registry, id)
      if (found.found) loaded.add(found.capability.path)
    }
  }
  const knowledgeVault = registry.capabilities.find((c) => c.id === "knowledge-vault")
  assert.ok(knowledgeVault, "knowledge-vault is missing from the registry")
  assert.ok(loaded.has(knowledgeVault.path), "knowledge-vault entrypoint is unreachable")
})
