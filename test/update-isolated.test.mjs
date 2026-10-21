import test from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { resolveCapability } from "../src/capabilities/resolve.mjs"
import { createLoader } from "../src/capabilities/loader.mjs"
import { buildCapabilityRegistry } from "../src/capabilities/registry.mjs"
import { planReconcile, sha256OfFile } from "../src/install/reconcile.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

const PAYLOAD_DIRECTORIES = ["command", "skills", "src", "registry", "plugins", "evals", "scripts", "docs", "test"]
const PAYLOAD_FILES = ["AGENTS.md", "package.json"]

function listPayload(root, prefix, out = []) {
  const dir = join(root, prefix)
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`
    if (entry.isDirectory()) listPayload(root, relative, out)
    else out.push(relative)
  }
  return out
}

const SKIPPED_WHEN_COPYING = new Set(["node_modules", ".git", ".overgeared-skills"])

function copyPayload(destination) {
  cpSync(repoRoot, destination, {
    recursive: true,
    filter: (source) => !SKIPPED_WHEN_COPYING.has(source.split(/[\\/]/).pop()),
  })
}

function buildIsolatedInstall() {
  const base = mkdtempSync(join(tmpdir(), "overgeared-skills-update-"))
  const root = join(base, "install")
  copyPayload(root)

  const paths = [...PAYLOAD_FILES, ...PAYLOAD_DIRECTORIES.flatMap((d) => listPayload(repoRoot, d))].sort()
  const manifest = {
    schema_version: 1,
    branch: "main",
    installed_commit: "d2c01bf",
    managedFiles: paths
      .filter((p) => existsSync(join(repoRoot, p)))
      .map((p) => ({ path: p, sha256: sha256OfFile(join(repoRoot, p)) })),
  }

  mkdirSync(join(root, "skills", "my-own-skill"), { recursive: true })
  writeFileSync(join(root, "skills", "my-own-skill", "SKILL.md"), "# my own skill, not claimed\n")

  const payloadRoot = join(base, "payload")
  copyPayload(payloadRoot)
  writeFileSync(join(payloadRoot, "docs", "routing-diagnosis.md"), "# upstream changed this file\n")

  return { base, root, payloadRoot, manifest }
}

test("natural language selects update-overgeared-skills with no slash prefix", () => {
  const registry = buildCapabilityRegistry(repoRoot)
  for (const request of ["Update Overgeared Skills", "please update overgeared-skills", "update the genthin install"]) {
    const decision = resolveCapability(registry, request)
    assert.equal(decision.id, "update-overgeared-skills", request)
    assert.equal(decision.kind, "command", request)
  }
})

test("the canonical body loads from the isolated install before any file is touched", () => {
  const { base, root } = buildIsolatedInstall()
  try {
    const loader = createLoader({ opencodeRoot: root, repoRoot: root })
    const result = loader.load("update-overgeared-skills", "command")

    assert.equal(result.ok, true)
    assert.match(result.instructions, /manifest\.json/)
    assert.match(result.instructions, /locally modified/)
    assert.match(result.instructions, /version.json.{0,3} last/)
    assert.equal(loader.isLoaded("update-overgeared-skills"), true)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("a locally modified managed file becomes a conflict and is never silently replaced", () => {
  const { base, root, payloadRoot, manifest } = buildIsolatedInstall()
  try {
    const edited = join(root, "command", "update-overgeared-skills.md")
    writeFileSync(edited, "---\ndescription: I edited this locally\n---\n\nmy own version\n")

    const plan = planReconcile({ root, payloadRoot, manifest })

    const conflict = plan.conflicts.find((c) => c.path === "command/update-overgeared-skills.md")
    assert.ok(conflict, "the locally edited file must be reported as a conflict")
    assert.equal(conflict.reason, "locally_modified")
    assert.equal(plan.safe.some((s) => s.path === "command/update-overgeared-skills.md"), false)
    assert.equal(readFileSync(edited, "utf8").includes("my own version"), true, "the local edit survives planning")
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("an unclaimed file is preserved and never scheduled for deletion", () => {
  const { base, root, payloadRoot, manifest } = buildIsolatedInstall()
  try {
    writeFileSync(join(root, "command", "my-local-command.md"), "# mine\n")

    const plan = planReconcile({ root, payloadRoot, manifest })

    assert.ok(plan.unclaimed.includes("command/my-local-command.md"))
    assert.ok(plan.unclaimed.includes("skills/my-own-skill/SKILL.md"))
    assert.equal(plan.stale.includes("command/my-local-command.md"), false)
    assert.equal(existsSync(join(root, "command", "my-local-command.md")), true)
    assert.equal(existsSync(join(root, "skills", "my-own-skill", "SKILL.md")), true)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("unchanged managed files are safe and files gone upstream are reported stale", () => {
  const { base, root, payloadRoot, manifest } = buildIsolatedInstall()
  try {
    manifest.managedFiles.push({ path: "command/removed-upstream.md", sha256: "0".repeat(64) })

    const plan = planReconcile({ root, payloadRoot, manifest })

    const safeEntry = plan.safe.find((s) => s.path === "docs/routing-diagnosis.md")
    assert.ok(safeEntry, "an unmodified file whose payload changed is safe to replace")
    assert.equal(safeEntry.reason, "upstream_changed")
    assert.equal(safeEntry.to, sha256OfFile(join(payloadRoot, "docs/routing-diagnosis.md")))
    assert.ok(plan.unchanged.includes("AGENTS.md"), "an identical file is unchanged, not rewritten")
    assert.equal(plan.safe.some((s) => s.path === "AGENTS.md"), false)
    assert.deepEqual(plan.stale, ["command/removed-upstream.md"])
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("a file that matches the payload exactly is reported unchanged, not rewritten", () => {
  const { base, root, payloadRoot, manifest } = buildIsolatedInstall()
  try {
    const plan = planReconcile({ root, payloadRoot, manifest })
    assert.ok(plan.unchanged.includes("AGENTS.md"))
    assert.equal(plan.safe.some((s) => s.path === "AGENTS.md"), false)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("metadata written last is internally consistent and every safe hash matches the payload", () => {
  const { base, root, payloadRoot, manifest } = buildIsolatedInstall()
  try {
    const plan = planReconcile({ root, payloadRoot, manifest })
    const nextManifest = plan.safe.map((s) => ({
      path: s.path,
      sha256: sha256OfFile(join(repoRoot, s.path)),
    }))

    for (const entry of nextManifest) {
      assert.equal(
        entry.sha256,
        sha256OfFile(join(repoRoot, entry.path)),
        `metadata hash must match the payload for ${entry.path}`,
      )
    }
    assert.equal(plan.writes_metadata_last, true)
    assert.ok(nextManifest.length > 0)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("planning never writes to the installation", () => {
  const { base, root, payloadRoot, manifest } = buildIsolatedInstall()
  try {
    const before = JSON.stringify(manifest.managedFiles)
    planReconcile({ root, payloadRoot, manifest })
    assert.equal(JSON.stringify(manifest.managedFiles), before)
    assert.equal(existsSync(join(root, ".overgeared-skills")), false, "planning must not create metadata")
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
test("a local skill that collides with a command id is refused rather than guessed", () => {
  const { base, root } = buildIsolatedInstall()
  try {
    mkdirSync(join(root, "skills", "update-overgeared-skills"), { recursive: true })
    writeFileSync(join(root, "skills", "update-overgeared-skills", "SKILL.md"), "# name collision\n")

    const loader = createLoader({ opencodeRoot: root, repoRoot: root })
    const result = loader.load("update-overgeared-skills", "command")

    assert.equal(result.ok, false)
    assert.match(result.reason, /is a skill, not a command/)
    assert.equal(loader.isLoaded("update-overgeared-skills"), false)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
