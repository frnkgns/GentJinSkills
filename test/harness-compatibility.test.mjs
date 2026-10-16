import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { installHarnesses } from "../scripts/install-harnesses.mjs"
import { HARNESS_TARGETS } from "../src/portability/contract.mjs"

const roots = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gentjin-harness-"))
  roots.push(root)
  writeFileSync(join(root, "AGENTS.md"), "# Rules\n\nAlways verify before claiming.\n", "utf-8")
  for (const name of ["alpha", "beta"]) {
    const dir = join(root, "skills", name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: test skill\n---\n\nBody\n`, "utf-8")
    mkdirSync(join(dir, "agents"), { recursive: true })
    writeFileSync(join(dir, "agents", "openai.yaml"), "display_name: test\n", "utf-8")
  }
  mkdirSync(join(root, "command"), { recursive: true })
  writeFileSync(join(root, "command", "review.md"), "# review\n", "utf-8")
  return root
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

test("a harness the user named is supported", () => {
  for (const id of ["opencode", "claude-code", "codex", "cursor", "windsurf", "gemini-cli", "github-copilot", "cline", "aider"]) {
    assert.ok(
      HARNESS_TARGETS.some((h) => h.id === id),
      `missing harness entry: ${id}`,
    )
  }
})

test("an unknown harness id is refused rather than silently ignored", () => {
  const root = fixture()
  assert.throws(() => installHarnesses({ sourceRoot: root, harnessIds: ["not-a-harness"] }), /unknown harness/)
})

test("CLAUDE.md imports AGENTS.md instead of copying it", () => {
  // A copied instruction file diverges the first time the source changes.
  const root = fixture()
  installHarnesses({ sourceRoot: root, harnessIds: ["claude-code"] })

  const claude = readFileSync(join(root, "CLAUDE.md"), "utf-8")
  assert.match(claude, /@AGENTS\.md/)
  assert.ok(!claude.includes("Always verify before claiming"), "must not duplicate the source body")
  assert.match(claude, /generated/i)
})

test("the shared skills directory mirrors every skill with its structure intact", () => {
  // OpenCode v2 discovers .claude/skills itself, so one copy serves both hosts. Getting this
  // wrong is silent: a flattened tree loads no skills at all.
  const root = fixture()
  installHarnesses({ sourceRoot: root, harnessIds: ["claude-skills"] })

  const mirrored = join(root, ".claude", "skills")
  assert.ok(existsSync(join(mirrored, "alpha", "SKILL.md")))
  assert.ok(existsSync(join(mirrored, "beta", "SKILL.md")))
  assert.ok(existsSync(join(mirrored, "alpha", "agents", "openai.yaml")))
  assert.ok(!existsSync(join(mirrored, "skills")), "the source directory name must not be nested again")
})

test("a harness layout lands under its own directory, not the repository root", () => {
  const root = fixture()
  installHarnesses({ sourceRoot: root, harnessIds: ["cursor"] })

  assert.ok(existsSync(join(root, ".cursor", "rules", "gentjin.mdc")))
  assert.ok(!existsSync(join(root, "rules")), "a bare rules/ at the root is wrong")
  assert.ok(!existsSync(join(root, "commands")), "a bare commands/ at the root is wrong")
})

test("cursor rules carry the frontmatter that makes them apply", () => {
  const root = fixture()
  installHarnesses({ sourceRoot: root, harnessIds: ["cursor"] })
  const rule = readFileSync(join(root, ".cursor", "rules", "gentjin.mdc"), "utf-8")
  assert.match(rule, /^---\n/)
  assert.match(rule, /alwaysApply: true/)
})

test("windsurf rules are always on", () => {
  const root = fixture()
  installHarnesses({ sourceRoot: root, harnessIds: ["windsurf"] })
  const rule = readFileSync(join(root, ".windsurf", "rules", "gentjin.md"), "utf-8")
  assert.match(rule, /trigger: always_on/)
})

test("harnesses that install into the user home are reported, not silently ignored", () => {
  const root = fixture()
  const result = installHarnesses({ sourceRoot: root, harnessIds: ["opencode", "claude-code"] })
  assert.ok(
    result.skipped.some((note) => note.includes("opencode")),
    `a user-home install must be surfaced, got ${JSON.stringify(result.skipped)}`,
  )
})

test("codex and AGENTS.md hosts generate no extra files", () => {
  const root = fixture()
  const result = installHarnesses({ sourceRoot: root, harnessIds: ["codex", "agents-md"] })
  assert.deepEqual(result.written, [], "both read AGENTS.md directly")
})

test("running twice produces the same files", () => {
  const root = fixture()
  const first = installHarnesses({ sourceRoot: root })
  const second = installHarnesses({ sourceRoot: root })
  assert.deepEqual(first.written, second.written)
})