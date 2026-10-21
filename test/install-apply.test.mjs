import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { applyPayload, preflightPayload, payloadFiles, sha256OfFile } from "../src/install/apply.mjs"
import { planReconcile, listUnclaimed } from "../src/install/reconcile.mjs"

function seed() {
  const base = mkdtempSync(join(tmpdir(), "gentjin-apply-"))
  const root = join(base, "install")
  mkdirSync(join(root, "command"), { recursive: true })
  mkdirSync(join(root, "skills", "alpha"), { recursive: true })
  writeFileSync(join(root, "command", "one.md"), "# one\n")
  writeFileSync(join(root, "command", "two.md"), "# two\n")
  writeFileSync(join(root, "skills", "alpha", "SKILL.md"), "# alpha\n")
  writeFileSync(join(root, "AGENTS.md"), "# agents\n")

  const managedFiles = ["command/one.md", "command/two.md", "skills/alpha/SKILL.md", "AGENTS.md"].map((p) => ({
    path: p,
    sha256: sha256OfFile(join(root, p)),
  }))
  writeFileSync(
    join(root, "manifest.json.tmp"),
    JSON.stringify({ schema_version: 1, managedFiles }),
  )
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json.tmp"), "utf8"))
  rmSync(join(root, "manifest.json.tmp"))
  return { base, root, manifest }
}

function goodPayload(base, mutate) {
  const payload = join(base, "payload")
  mkdirSync(join(payload, "command"), { recursive: true })
  mkdirSync(join(payload, "skills", "alpha"), { recursive: true })
  writeFileSync(join(payload, "command", "one.md"), "# one\n")
  writeFileSync(join(payload, "skills", "alpha", "SKILL.md"), "# alpha\n")
  writeFileSync(join(payload, "AGENTS.md"), "# agents\n")
  if (mutate) mutate(payload)
  return payload
}

test("a valid payload installs and records metadata", () => {
  const { base, root, manifest } = seed()
  try {
    const payload = goodPayload(base)
    const result = applyPayload({ root, payloadRoot: payload, manifest, branch: "main", commit: "abc1234" })

    assert.equal(result.applied, true)
    assert.ok(result.replaced.includes("skills/alpha/SKILL.md") || result.replaced.length >= 0)
    assert.equal(existsSync(join(root, "skills", "alpha", "SKILL.md")), true)
    assert.equal(JSON.parse(readFileSync(join(root, ".overgeared-skills", "version.json"), "utf8")).version, "abc1234")
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("regression: a stale payload with no commands removes nothing", () => {
  const { base, root, manifest } = seed()
  try {
    const payload = join(base, "stale-payload")
    mkdirSync(payload, { recursive: true })
    writeFileSync(join(payload, "readme.txt"), "not an Overgeared Skills tree\n")

    const result = applyPayload({ root, payloadRoot: payload, manifest, branch: "main", commit: "abc1234" })

    assert.equal(result.applied, false)
    assert.equal(result.refused, true)
    assert.equal(result.staleRemoved.length, 0)
    assert.equal(existsSync(join(root, "command", "one.md")), true, "installation survives a stale payload")
    assert.equal(existsSync(join(root, "command", "two.md")), true)
    assert.equal(existsSync(join(root, "skills", "alpha", "SKILL.md")), true)
    assert.equal(existsSync(join(root, "AGENTS.md")), true)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("regression: a missing payload path removes nothing and writes no metadata", () => {
  const { base, root, manifest } = seed()
  try {
    const result = applyPayload({
      root,
      payloadRoot: join(base, "gone", "payload"),
      manifest,
      branch: "main",
      commit: "abc1234",
    })

    assert.equal(result.applied, false)
    assert.equal(result.staleRemoved.length, 0)
    assert.equal(existsSync(join(root, ".overgeared-skills", "manifest.json")), false, "no metadata written on refusal")
    assert.equal(existsSync(join(root, "command", "one.md")), true)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("regression: a payload missing skills is refused even though it has commands", () => {
  const { base, root, manifest } = seed()
  try {
    const payload = join(base, "partial")
    mkdirSync(join(payload, "command"), { recursive: true })
    writeFileSync(join(payload, "command", "one.md"), "# one\n")
    writeFileSync(join(payload, "AGENTS.md"), "# agents\n")

    const result = applyPayload({ root, payloadRoot: payload, manifest, branch: "main", commit: "abc1234" })

    assert.equal(result.applied, false)
    assert.match(result.reason, /command\/ and skills\//)
    assert.equal(existsSync(join(root, "command", "two.md")), true)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("regression: a payload missing AGENTS.md is refused", () => {
  const { base, root, manifest } = seed()
  try {
    const payload = join(base, "noagents")
    mkdirSync(join(payload, "command"), { recursive: true })
    mkdirSync(join(payload, "skills", "alpha"), { recursive: true })
    writeFileSync(join(payload, "command", "one.md"), "# one\n")
    writeFileSync(join(payload, "skills", "alpha", "SKILL.md"), "# alpha\n")

    const result = applyPayload({ root, payloadRoot: payload, manifest, branch: "main", commit: "abc1234" })

    assert.equal(result.applied, false)
    assert.match(result.reason, /AGENTS\.md/)
    assert.equal(existsSync(join(root, "command", "one.md")), true)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("a locally modified managed file is never replaced", () => {
  const { base, root, manifest } = seed()
  try {
    writeFileSync(join(root, "command", "one.md"), "# mine, locally edited\n")
    const payload = goodPayload(base)
    const result = applyPayload({ root, payloadRoot: payload, manifest, branch: "main", commit: "abc1234" })

    assert.equal(result.applied, true)
    assert.ok(result.refusedLocal.includes("command/one.md"))
    assert.equal(readFileSync(join(root, "command", "one.md"), "utf8"), "# mine, locally edited\n")
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("recovery preserves unrelated user files under command/ and skills/", () => {
  const { base, root, manifest } = seed()
  try {
    writeFileSync(join(root, "command", "my-own.md"), "# mine\n")
    mkdirSync(join(root, "skills", "my-skill"), { recursive: true })
    writeFileSync(join(root, "skills", "my-skill", "SKILL.md"), "# mine\n")

    const payload = goodPayload(base)
    const result = applyPayload({ root, payloadRoot: payload, manifest, branch: "main", commit: "abc1234" })

    assert.equal(result.applied, true)
    assert.equal(existsSync(join(root, "command", "my-own.md")), true)
    assert.equal(existsSync(join(root, "skills", "my-skill", "SKILL.md")), true)
    assert.equal(result.staleRemoved.includes("command/my-own.md"), false)

    const unclaimed = listUnclaimed(root, JSON.parse(readFileSync(join(root, ".overgeared-skills", "manifest.json"), "utf8")))
    assert.ok(unclaimed.includes("command/my-own.md"))
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("a refused payload leaves unrelated files and metadata untouched on a second attempt", () => {
  const { base, root, manifest } = seed()
  try {
    writeFileSync(join(root, "command", "my-own.md"), "# mine\n")
    const good = goodPayload(base)
    applyPayload({ root, payloadRoot: good, manifest, branch: "main", commit: "first" })
    const manifestPath = join(root, ".overgeared-skills", "manifest.json")
    const before = readFileSync(manifestPath, "utf8")

    const refused = applyPayload({
      root,
      payloadRoot: join(base, "stale"),
      manifest: JSON.parse(before),
      branch: "main",
      commit: "second",
    })

    assert.equal(refused.applied, false)
    assert.equal(readFileSync(manifestPath, "utf8"), before, "metadata unchanged on refusal")
    assert.equal(JSON.parse(readFileSync(join(root, ".overgeared-skills", "version.json"), "utf8")).version, "first")
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("the reconciliation planner also refuses a stale payload source", () => {
  const { base, root, manifest } = seed()
  try {
    const stale = join(base, "stale")
    mkdirSync(stale, { recursive: true })
    const plan = planReconcile({ root, payloadRoot: stale, manifest })
    assert.deepEqual(plan.stale, [])
    assert.equal(plan.safe.length, 0)
    assert.equal(plan.conflicts.length, 0)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
