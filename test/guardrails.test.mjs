import test from "node:test"
import assert from "node:assert/strict"
import { evaluateGitCommand, guardrailRules } from "../src/guardrails/git-guardrails.mjs"
import guardrailPlugin from "../guardrails/gentjin-guardrails.js"

function withAllow(value, fn) {
  const previous = process.env.GENTJIN_ALLOW_GIT
  if (value === undefined) delete process.env.GENTJIN_ALLOW_GIT
  else process.env.GENTJIN_ALLOW_GIT = value
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.GENTJIN_ALLOW_GIT
    else process.env.GENTJIN_ALLOW_GIT = previous
  }
}

test("plain git push is blocked", () => {
  const v = evaluateGitCommand("git push origin main")
  assert.equal(v.blocked, true)
  assert.equal(v.rule, "push")
})

test("force push is blocked and reported as the stronger rule", () => {
  const v = evaluateGitCommand("git push --force origin main")
  assert.equal(v.blocked, true)
  assert.equal(v.rule, "push-force")
  assert.ok(v.allMatched.includes("push"))
})

test("destructive history and worktree commands are blocked", () => {
  for (const command of [
    "git reset --hard HEAD~1",
    "git clean -fd",
    "git clean -fdx",
    "git branch -D feature/x",
    "git checkout .",
    "git restore .",
  ]) {
    assert.equal(evaluateGitCommand(command).blocked, true, `should block: ${command}`)
  }
})

test("ordinary git commands pass through", () => {
  for (const command of [
    "git status",
    "git diff --stat",
    "git log --oneline -5",
    "git add -A",
    "git commit -m 'fix: guard rails'",
    "git checkout main",
    "git branch -d feature/x",
  ]) {
    assert.equal(evaluateGitCommand(command).blocked, false, `should allow: ${command}`)
  }
})

test("non-git shell commands are untouched", () => {
  for (const command of ["npm test", "ls -la", "echo done", ""]) {
    assert.equal(evaluateGitCommand(command).blocked, false, command)
  }
})

test("a blocked command inside a compound shell line is still caught", () => {
  const v = evaluateGitCommand("cd repo && git push origin main")
  assert.equal(v.blocked, true)
})

test("an explicit per-session override allows exactly that rule", () => {
  withAllow("push", () => {
    assert.equal(evaluateGitCommand("git push origin main").blocked, false)
    assert.equal(evaluateGitCommand("git reset --hard").blocked, true)
  })
})

test("allowing push does not allow force push", () => {
  withAllow("push", () => {
    assert.equal(evaluateGitCommand("git push origin main").blocked, false)
    const forced = evaluateGitCommand("git push --force origin main")
    assert.equal(forced.blocked, true)
    assert.equal(forced.rule, "push-force")
  })
})

test("allowing push does not allow a second destructive command in the same line", () => {
  withAllow("push", () => {
    const v = evaluateGitCommand("git push origin main && git reset --hard HEAD~1")
    assert.equal(v.blocked, true)
    assert.equal(v.rule, "reset-hard")
  })
})

test("every rule carries a reason", () => {
  for (const rule of guardrailRules) {
    assert.equal(typeof rule.id, "string")
    assert.ok(rule.why.length > 10, `${rule.id} needs a real reason`)
  }
})

test("the guardrail plugin exports only the definition object OpenCode 2 requires", async () => {
  const mod = await import("../guardrails/gentjin-guardrails.js")
  assert.deepEqual(Object.keys(mod), ["default"])
  assert.equal(guardrailPlugin.id, "gentjin-guardrails")
  assert.equal(typeof guardrailPlugin.setup, "function")
})

async function mountGuardrails() {
  let before = null
  await guardrailPlugin.setup({
    tool: {
      hook: async (name, callback) => {
        if (name === "execute.before") before = callback
        return { dispose: async () => {} }
      },
    },
  })
  return (...args) => before(...args)
}

test("the plugin refuses a blocked command by throwing", async () => {
  const before = await mountGuardrails()
  assert.equal(typeof before, "function")

  await assert.rejects(
    () => before({ tool: "shell", input: { command: "git push origin main" } }),
    /Blocked by GENTJIN git guardrails/,
  )
})

test("the plugin lets ordinary commands through without throwing", async () => {
  const before = await mountGuardrails()
  assert.equal(await before({ tool: "shell", input: { command: "git status" } }), undefined)
})

test("the plugin ignores non-shell tools and missing args", async () => {
  const before = await mountGuardrails()
  await before({ tool: "read", input: { filePath: "x" } })
  await before({ tool: "shell", input: {} })
  await before({ tool: "shell", input: { command: 123 } })
  await before({})
})

test("the plugin still blocks the legacy V1 bash tool name", async () => {
  const before = await mountGuardrails()
  await assert.rejects(
    () => before({ tool: "bash", input: { command: "git push origin main" } }),
    /Blocked by GENTJIN git guardrails/,
  )
})