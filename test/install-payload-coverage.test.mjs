import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { PAYLOAD_DIRECTORIES, PAYLOAD_FILES } from "../src/install/apply.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

function read(...parts) {
  return readFileSync(join(repoRoot, ...parts), "utf-8")
}

/**
 * The runbook is a repository document and is deliberately never installed, so these checks can
 * only run where it exists. The payload ships whole, and a guard that fails for a missing
 * document it never claimed would train everyone to ignore a real drift signal.
 */
const runbookAbsent = {
  skip: existsSync(join(repoRoot, "INSTALL.md"))
    ? false
    : "INSTALL.md is a repository document and is not part of the installed payload",
}

/**
 * Collects the payload names a document claims to install. Runbooks write the
 * mapping as `<source-root>/x -> <opencode-root>/x`; commands name the destination
 * only, as `<opencode-root>/x/`. Both notations mean the same payload entry.
 */
function claimedPaths(text) {
  return new Set(
    [...text.matchAll(/<(?:source|opencode)-root>\/([A-Za-z0-9_.-]+)/g)].map((match) => match[1]),
  )
}

test("the runbook's executable install step carries the whole payload", runbookAbsent, () => {
  // The mapping table and the executable step are separate blocks in one file, and they
  // drifted apart: the table listed plugins/ and src/, the step copied three paths, and
  // every install obeyed the step. Anything in the payload must appear in the step.
  const install = read("INSTALL.md")
  const stepStart = install.indexOf("### 3. Install runtime files directly")
  assert.notEqual(stepStart, -1, "INSTALL.md must still contain the install step")
  const stepEnd = install.indexOf("### 4.", stepStart)
  const step = install.slice(stepStart, stepEnd)

  const expected = new Set([...PAYLOAD_DIRECTORIES, ...PAYLOAD_FILES])
  const installed = claimedPaths(step)

  const missing = [...expected].filter((name) => !installed.has(name))
  assert.deepEqual(missing, [], `install step omits payload: ${missing.join(", ")}`)
})

test("the mapping table and the install step agree", runbookAbsent, () => {
  const install = read("INSTALL.md")
  const tableStart = install.indexOf("Installation direction:")
  const tableEnd = install.indexOf("Expected end state")
  const table = install.slice(tableStart, tableEnd)
  const stepStart = install.indexOf("### 3. Install runtime files directly")
  const step = install.slice(stepStart, install.indexOf("### 4.", stepStart))

  assert.deepEqual(
    [...claimedPaths(table)].sort(),
    [...claimedPaths(step)].sort(),
    "the mapping table and the executable step must name the same payload",
  )
})

test("the install and update commands name the whole payload, not just the instruction layer", () => {
  // These commands are what the model actually follows. Naming only AGENTS.md, command/,
  // and skills/ is what left the entire runtime layer uninstalled.
  const expected = [...PAYLOAD_DIRECTORIES, ...PAYLOAD_FILES]
  const named = [...claimedPaths(read("command", "install-gentjin.md"))]

  const missing = expected.filter((name) => !named.includes(name))
  assert.deepEqual(missing, [], `/install-gentjin omits payload: ${missing.join(", ")}`)

  const update = read("command", "update-gentjin.md")
  for (const name of expected) {
    assert.ok(update.includes(`${name}/`) || update.includes(name), `/update-gentjin omits ${name}`)
  }
})

test("both commands tell the operator to verify the runtime layer loaded", () => {
  // Verification that only checks skills and commands passes while every plugin is dead.
  for (const name of ["install-gentjin.md", "update-gentjin.md"]) {
    const text = read("command", name)
    assert.match(text, /<opencode-root>\/plugins\//, `${name} must verify plugins/`)
    assert.match(text, /failed to load plugin/, `${name} must check the plugin load log`)
  }
})