import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

const VAULT = "~/Documents/KnowledgeVault/*"
const REQUIRED_ACTIONS = ["external_directory", "read", "edit"]

/**
 * The runbook is a repository document and is deliberately never installed, so this contract can
 * only be checked where it exists.
 */
const runbookAbsent = {
  skip: existsSync(join(repoRoot, "INSTALL.md"))
    ? false
    : "INSTALL.md is a repository document and is not part of the installed payload",
}

function permissionSection() {
  const text = readFileSync(join(repoRoot, "INSTALL.md"), "utf-8")
  const start = text.indexOf("## Add the required global permissions")
  assert.notEqual(start, -1, "INSTALL.md must still contain the global permissions section")
  const end = text.indexOf("\n## ", start + 1)
  return text.slice(start, end === -1 ? text.length : end)
}

test("the runbook grants all three permission rules the vault needs", runbookAbsent, () => {
  // OpenCode 2 approves a directory boundary with external_directory and then still asks for read
  // and edit on it. A runbook that specifies only the boundary reads as satisfied while every
  // vault operation falls back to prompting.
  const body = permissionSection()
  assert.match(body, /"permissions"\s*:/, "the rules must use the OpenCode 2 permissions array")

  const escaped = VAULT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  for (const action of REQUIRED_ACTIONS) {
    const rule = new RegExp(
      `"action"\\s*:\\s*"${action}"[^}]*"resource"\\s*:\\s*"${escaped}"[^}]*"effect"\\s*:\\s*"allow"`,
    )
    assert.match(body, rule, `missing an allow rule for ${action} on the vault path`)
  }
})

test("the runbook does not hand back the OpenCode 1 permission object", runbookAbsent, () => {
  const body = permissionSection()
  assert.doesNotMatch(
    body,
    /"permission"\s*:\s*\{/,
    "the singular permission object is OpenCode 1 syntax and is not what an install should write",
  )
})

test("the runbook explains why one boundary rule is not sufficient", runbookAbsent, () => {
  // Without this the three rules look redundant, and a later editor will "simplify" them back to
  // one. That single simplification is the defect this file exists to prevent.
  const body = permissionSection()
  assert.match(body, /boundary/i, "the runbook must say external_directory grants only the boundary")
  assert.match(body, /`ask`|falls back to the default/i, "the runbook must name the ask fallback")
})

test("the runbook asks before converting an OpenCode 1 configuration", runbookAbsent, () => {
  const body = permissionSection()
  assert.match(
    body,
    /OpenCode 1|permission\.external_directory/,
    "the runbook must recognise the OpenCode 1 shape rather than rewriting it silently",
  )
  assert.match(
    body,
    /ask before converting|ask the user/,
    "converting a working configuration requires explicit approval",
  )
})

test("the runbook uses a single-star vault pattern", runbookAbsent, () => {
  const body = permissionSection()
  assert.doesNotMatch(
    body,
    /KnowledgeVault\/\*\*/,
    "** is redundant: OpenCode matches whole values and * already crosses /",
  )
})