import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveProject } from "../src/discovery/resolve.mjs"
import {
  beginSession,
  createDiscoveryState,
  declareScope,
  noteRead,
  readinessFor,
  recordMemory,
  startDiscovery,
} from "../src/discovery/gate.mjs"

/**
 * Both failures here were reported as one confusing symptom: a session that could not edit anything
 * and appeared to be looking in a vault folder that did not exist. They are separate defects, and
 * each one silently produced the other's message.
 */

function projectWith(agentFile) {
  const dir = mkdtempSync(join(tmpdir(), "gentjin-override-"))
  mkdirSync(join(dir, "src"), { recursive: true })
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "rafa-app" }))
  writeFileSync(join(dir, "src", "app.ts"), "export const x = 1")
  if (agentFile !== null) writeFileSync(join(dir, ".project-agent.md"), agentFile)
  return dir
}

function gateFixture(dir) {
  const resolution = {
    project_root: dir,
    root_source: "test",
    identity: "p",
    identity_source: "test",
    identifier: "p",
    knowledge_root: join(dir, ".vault"),
    knowledge_root_source: "default",
    git_root: dir,
    git: true,
    monorepo: false,
    override_file: null,
    identity_candidates: [],
  }
  const state = createDiscoveryState()
  beginSession(state, "s1", resolution)
  startDiscovery(state, "s1")
  return { state, resolution }
}

test("a prose override key is honoured, because people write them that way", () => {
  // The real-world report: `- Knowledge root: ~/.../Rafa`. The parser required a hyphenated key,
  // so it matched nothing and the session silently fell back to a folder derived from
  // package.json.name that does not exist.
  const dir = projectWith("# Overrides\n\n- Knowledge root: `~/Documents/KnowledgeVault/Rafa`\n")
  try {
    const resolved = resolveProject(dir)
    assert.equal(resolved.knowledge_root_source, "override")
    assert.match(resolved.knowledge_root, /KnowledgeVault[\\/]Rafa$/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("every override spelling resolves to the same knowledge root", () => {
  const forms = [
    ["prose bullet", "# O\n\n- Knowledge root: `~/vault`\n"],
    ["prose without a bullet", "Knowledge root: ~/vault\n"],
    ["hyphenated bullet", "- knowledge_root: ~/vault\n"],
    ["yaml frontmatter", "---\nname: Rafa\nknowledge_root: ~/vault\n---\n"],
  ]
  const dirs = forms.map(([, content]) => projectWith(content))
  try {
    const roots = dirs.map((dir) => resolveProject(dir).knowledge_root)
    assert.equal(new Set(roots).size, 1, `forms disagreed: ${JSON.stringify(roots)}`)
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  }
})

test("a file with no override still falls back to the manifest identity", () => {
  // The parser is looser now, so it must not invent an override out of ordinary prose.
  const dir = projectWith("# Project agent overrides\n\nSome prose about this project.\n")
  try {
    const resolved = resolveProject(dir)
    assert.equal(resolved.knowledge_root_source, "default")
    assert.match(resolved.knowledge_root, /KnowledgeVault[\\/]rafa-app$/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a read recorded relatively satisfies a relative scope", () => {
  const dir = projectWith(null)
  try {
    const { state } = gateFixture(dir)
    declareScope(state, "s1", ["src/app.ts"])
    noteRead(state, "s1", "src/app.ts")
    recordMemory(state, "s1", { status: "ok", notes_read: [], no_relevant_notes: true, searched: [] })
    assert.equal(readinessFor(state, "s1").status, "ready")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the path form a read uses does not change whether it counts", () => {
  // The runtime may report a read as relative or absolute. Readiness must not depend on which.
  const dir = projectWith(null)
  try {
    const { state } = gateFixture(dir)
    const absolute = join(dir, "src", "app.ts")
    declareScope(state, "s1", [absolute])
    noteRead(state, "s1", "src/app.ts")
    recordMemory(state, "s1", { status: "ok", notes_read: [], no_relevant_notes: true, searched: [] })
    assert.equal(readinessFor(state, "s1").status, "ready")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a read in another directory still does not satisfy the scope", () => {
  // Normalizing paths must not become a way to satisfy the gate without reading anything.
  // Coverage is per directory: a sibling file in an inspected directory is in scope by design,
  // but an unrelated directory is not.
  const dir = projectWith(null)
  try {
    mkdirSync(join(dir, "lib"), { recursive: true })
    writeFileSync(join(dir, "lib", "other.ts"), "export const y = 2")
    const { state } = gateFixture(dir)
    declareScope(state, "s1", ["src/app.ts"])
    noteRead(state, "s1", "lib/other.ts")
    recordMemory(state, "s1", { status: "ok", notes_read: [], no_relevant_notes: true, searched: [] })
    const verdict = readinessFor(state, "s1")
    assert.notEqual(verdict.status, "ready")
    assert.match(verdict.reasons.join(" "), /no recorded read/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})