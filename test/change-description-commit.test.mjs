import test, { after } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { checkChangeDescription, renderChangeDescription } from "../src/reporting/change-description.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const created = []

function git(dir, ...args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim()
}

function makeTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "gentjin-cd-"))
  created.push(dir)
  git(dir, "init", "-q", "-b", "main")
  git(dir, "config", "user.email", "test@example.invalid")
  git(dir, "config", "user.name", "Overgeared Skills Test")
  return dir
}

after(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true })
})

test("a fresh commit in an isolated repository has the intended subject and body", () => {
  const dir = makeTempRepo()
  writeFileSync(join(dir, "a.txt"), "hello\n")

  const items = [
    "Fixed tracing so OpenCode sessions can record activity.",
    "Added optional Git safeguards that block restricted commands after setup.",
    "Improved bug investigation so fixes start from observed evidence.",
  ]
  const body = renderChangeDescription(items, "Improves tracing, optional Git safeguards, and engineering workflows.")
  const messageFile = join(tmpdir(), `gentjin-msg-${process.pid}-${created.length}.txt`)
  writeFileSync(messageFile, `Improve tracing and safeguards\n\n${body}\n`)

  git(dir, "add", "a.txt")
  git(dir, "commit", "-q", "-F", messageFile)
  rmSync(messageFile, { force: true })

  const recorded = git(dir, "show", "-s", "--format=%B", "HEAD")
  const subject = git(dir, "show", "-s", "--format=%s", "HEAD")

  assert.equal(subject, "Improve tracing and safeguards")
  assert.ok(recorded.includes("1. Fixed tracing so OpenCode sessions can record activity."), "real newlines must survive")
  assert.ok(recorded.includes("3. Improved bug investigation so fixes start from observed evidence."))

  const result = checkChangeDescription(recorded)
  assert.equal(result.ok, true, result.findings.join("; "))
  assert.equal(result.items, 3)
})

test("a multiline body with shell-sensitive characters survives a message file", () => {
  const dir = makeTempRepo()
  writeFileSync(join(dir, "b.txt"), "x\n")

  const body = renderChangeDescription([
    "Improved the push command so it prints a ready-to-paste body.",
    "Kept $VAR, `backticks`, and $(subshell) literal in the message.",
  ])
  const messageFile = join(dir, "..", `msg-${process.pid}.txt`)
  writeFileSync(messageFile, `Handle shell characters\n\n${body}\n`)

  git(dir, "add", "b.txt")
  git(dir, "commit", "-q", "-F", messageFile)
  rmSync(messageFile, { force: true })

  const recorded = git(dir, "show", "-s", "--format=%B", "HEAD")
  assert.ok(recorded.includes("$(subshell)"), "subshell syntax must not be interpolated")
  assert.ok(recorded.includes("`backticks`"), "backticks must survive literally")
  assert.equal(checkChangeDescription(recorded).ok, true)
})

test("a verbose commit body is detected when actually inspected", () => {
  const dir = makeTempRepo()
  writeFileSync(join(dir, "c.txt"), "x\n")

  const verbose = `The trace plugin had never run once.

1. Fixed tracing.

Root Cause:
The loader only discovers .js files in plugins/, so the .mjs entry was silently
ignored at startup, which meant no trace events were ever written during any
session and the coverage report always showed zero observed hooks throughout
the whole investigation period before the change was finally applied.`
  const messageFile = join(dir, "..", `verbose-${process.pid}.txt`)
  writeFileSync(messageFile, `Fix tracing\n\n${verbose}\n`)

  git(dir, "add", "c.txt")
  git(dir, "commit", "-q", "-F", messageFile)
  rmSync(messageFile, { force: true })

  const recorded = git(dir, "show", "-s", "--format=%B", "HEAD")
  const result = checkChangeDescription(recorded)
  assert.equal(result.ok, false, "a real verbose commit must be rejected")
  assert.ok(result.findings.some((f) => /prose block/.test(f)))
})

test("existing verbose history is left unchanged; history is never rewritten", () => {
  const dir = makeTempRepo()
  writeFileSync(join(dir, "d.txt"), "x\n")
  const first = join(dir, "..", `first-${process.pid}.txt`)
  writeFileSync(first, "First change\n\n1. Added a thing.\n")
  git(dir, "add", "d.txt")
  git(dir, "commit", "-q", "-F", first)
  rmSync(first, { force: true })

  const originalBody = git(dir, "show", "-s", "--format=%B", "HEAD")
  const originalCount = git(dir, "rev-list", "--count", "HEAD")

  const second = join(dir, "..", `second-${process.pid}.txt`)
  writeFileSync(second, "Second change\n\n1. Added another thing.\n")
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "--allow-empty", "-F", second)
  rmSync(second, { force: true })

  assert.equal(git(dir, "rev-list", "--count", "HEAD"), String(Number(originalCount) + 1))
  assert.equal(git(dir, "show", "-s", "--format=%B", "HEAD~1"), originalBody)
})

test("multi-commit work yields a description summarising the whole branch", () => {
  const dir = makeTempRepo()
  const commits = [
    "Add tracing\n\n1. Added trace collection for sessions.",
    "Add guardrails\n\n1. Added optional Git safeguards.",
    "Sharpen skills\n\n1. Improved bug investigation guidance.",
  ]
  commits.forEach((message, index) => {
    writeFileSync(join(dir, `f${index}.txt`), `${index}\n`)
    const file = join(dir, "..", `multi-${process.pid}-${index}.txt`)
    writeFileSync(file, `${message}\n`)
    git(dir, "add", `-A`)
    git(dir, "commit", "-q", "-F", file)
    rmSync(file, { force: true })
  })

  assert.equal(git(dir, "rev-list", "--count", "HEAD"), "3")

  const branchSummary = renderChangeDescription(
    [
      "Fixed tracing so OpenCode sessions can record activity.",
      "Added optional Git safeguards that block restricted commands after setup.",
      "Improved bug investigation so fixes start from observed evidence.",
    ],
    "Improves tracing, optional Git safeguards, and engineering workflows.",
  )
  const result = checkChangeDescription(branchSummary)
  assert.equal(result.ok, true)
  assert.equal(result.items, 3, "the summary covers the branch, not the last commit alone")
})

test("a PR body file written with gh --body-file preserves the body", () => {
  const dir = makeTempRepo()
  const body = renderChangeDescription(
    ["Fixed tracing so OpenCode sessions can record activity."],
    "Improves tracing.",
  )
  const bodyFile = join(dir, "pr-body.md")
  writeFileSync(bodyFile, `${body}\n`)

  assert.ok(existsSync(bodyFile))
  const readBack = readFileSync(bodyFile, "utf8")
  assert.equal(checkChangeDescription(readBack).ok, true)
  assert.ok(readBack.includes("1. Fixed tracing"))
})