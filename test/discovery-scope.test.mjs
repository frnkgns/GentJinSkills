import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import {
  createDiscoveryState,
  beginSession,
  startDiscovery,
  declareScope,
  noteRead,
  recordMemory,
  evaluateGate,
  readinessFor,
} from "../src/discovery/gate.mjs"
import { resolveProject } from "../src/discovery/resolve.mjs"

const require = createRequire(import.meta.url)
import { READINESS } from "../src/discovery/readiness.mjs"

function project(name) {
  const base = mkdtempSync(join(tmpdir(), "gentjin-scope-"))
  const root = join(base, name)
  mkdirSync(join(root, "src"), { recursive: true })
  writeFileSync(join(root, "package.json"), JSON.stringify({ name }))
  writeFileSync(join(root, "src", "app.js"), "module.exports = 1\n")
  return { base, root }
}

test("before discovery, a write to a temporary file outside the project is allowed", () => {
  const { base, root } = project("scope-temp-write")
  try {
    const state = createDiscoveryState()
    beginSession(state, "s1", resolveProject(root))

    const target = join(tmpdir(), "gentjin-commit-message.txt")
    const gate = evaluateGate({ state, sessionId: "s1", tool: "write", filePath: target })

    assert.equal(gate.allowed, true)
    assert.match(gate.reason, /outside the resolved project root/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("before discovery, a project edit is still blocked", () => {
  const { base, root } = project("scope-project-edit")
  try {
    const state = createDiscoveryState()
    beginSession(state, "s1", resolveProject(root))

    const gate = evaluateGate({
      state,
      sessionId: "s1",
      tool: "edit",
      filePath: join(root, "src", "app.js"),
    })

    assert.equal(gate.allowed, false)
    assert.equal(gate.status, READINESS.NOT_STARTED)
    assert.match(gate.reason, /blocked until this session has verified context/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("before discovery, a write inside the resolved knowledge root is allowed", () => {
  const { base, root } = project("scope-vault-write")
  try {
    const state = createDiscoveryState()
    const resolution = resolveProject(root)
    beginSession(state, "s1", resolution)

    const gate = evaluateGate({
      state,
      sessionId: "s1",
      tool: "write",
      filePath: join(resolution.knowledge_root, "project", "overview.md"),
    })

    assert.equal(gate.allowed, true)
    assert.match(gate.reason, /inside the resolved knowledge root/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("without a usable resolution the gate stays closed rather than opening by default", () => {
  const state = createDiscoveryState()
  for (const bad of [null, {}, { project_root: "" }, { project_root: 5, knowledge_root: "x" }]) {
    beginSession(state, "s", { ...(bad ?? {}) })
    const gate = evaluateGate({
      state,
      sessionId: "s",
      tool: "write",
      filePath: join(tmpdir(), "somewhere-else.txt"),
    })
    assert.equal(gate.allowed, false, JSON.stringify(bad))
  }
})

test("a session that never resolved blocks project edits instead of assuming a scope", () => {
  const state = createDiscoveryState()
  const gate = evaluateGate({ state, sessionId: "unknown", tool: "edit", filePath: join("C:", "x", "app.js") })
  assert.equal(gate.allowed, false)
})

test("scope ordering does not weaken the check once discovery has started", () => {
  const { base, root } = project("scope-after-discovery")
  try {
    const state = createDiscoveryState()
    beginSession(state, "s1", resolveProject(root))
    startDiscovery(state, "s1")

    const target = join(root, "src", "app.js")
    noteRead(state, "s1", target)
    declareScope(state, "s1", [target])
    const vault = resolveProject(root).knowledge_root
    noteRead(state, "s1", join(vault, "memory-index.md"))
    recordMemory(state, "s1", {
      status: "ok",
      notes_read: [],
      no_relevant_notes: true,
      searched: ["memory-index.md"],
    })

    assert.equal(readinessFor(state, "s1").status, READINESS.READY)
    assert.equal(evaluateGate({ state, sessionId: "s1", tool: "edit", filePath: target }).allowed, true)

    const uninspected = join(root, "src", "other.js")
    assert.equal(
      evaluateGate({ state, sessionId: "s1", tool: "write", filePath: uninspected }).allowed,
      true,
      "a new file in an already inspected directory stays in scope",
    )

    const elsewhere = join(root, "lib", "deep.js")
    declareScope(state, "s1", [elsewhere])
    assert.notEqual(readinessFor(state, "s1").status, READINESS.READY)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("regression: the plugin resolve handler starts discovery instead of returning a null record", () => {
  const { readFileSync } = require("node:fs")
  const { join: joinPath } = require("node:path")
  const source = readFileSync(joinPath(process.cwd(), "plugins", "overgeared-skills-capabilities.ts"), "utf8")

  assert.match(
    source,
    /action === "resolve"[\s\S]{0,120}startDiscovery\(discovery, sessionId\)/,
    "the resolve action must return the started discovery record",
  )
  assert.equal(
    /action === "resolve"[\s\S]{0,120}JSON\.stringify\(record,/.test(source),
    false,
    "the resolve action must not return a record captured before discovery started",
  )
})
