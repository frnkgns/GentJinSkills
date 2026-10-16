import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import assert from "node:assert/strict"

import {
  describeContract,
  isAdapter,
  isPortableCore,
  HARNESS_TARGETS,
  PORTABLE_CORE_DIRECTORIES,
  REQUIRED_HOST_CAPABILITIES,
  SKILL_FORMAT,
} from "../src/portability/contract.mjs"
import { buildCapabilityManifest, exportPortable, portableFiles } from "../src/portability/export.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

function inTemp(fn) {
  const dir = mkdtempSync(join(process.env.TEMP, "gentjin-portability-"))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** A minimal payload shaped like the real tree, so classification is testable in isolation. */
function fakePayload(root) {
  mkdirSync(join(root, "command"), { recursive: true })
  mkdirSync(join(root, "skills", "alpha"), { recursive: true })
  mkdirSync(join(root, "src"), { recursive: true })
  mkdirSync(join(root, "registry"), { recursive: true })
  writeFileSync(join(root, "AGENTS.md"), "# rules\n")
  writeFileSync(join(root, "command", "alpha.md"), "---\ndescription: do alpha\n---\n\nbody\n")
  writeFileSync(
    join(root, "skills", "alpha", "SKILL.md"),
    "---\nname: alpha\ndescription: Use for alpha work.\n---\n\nbody\n",
  )
  writeFileSync(join(root, "src", "runtime.mjs"), "export const x = 1\n")
  writeFileSync(join(root, "registry", "capabilities.json"), "{}")
  writeFileSync(join(root, "package.json"), "{}\n")
}

test("the portable core is commands, skills, and AGENTS.md", () => {
  for (const path of ["AGENTS.md", "command/alpha.md", "skills/alpha/SKILL.md"]) {
    assert.equal(isPortableCore(path), true, `${path} should be core`)
    assert.equal(isAdapter(path), false, `${path} should not be adapter`)
  }
})

test("runtime and tooling are adapter, never core", () => {
  for (const path of ["src/runtime.mjs", "registry/skills.json", "plugins/p.ts", "package.json", "test/x.mjs"]) {
    assert.equal(isAdapter(path), true, `${path} should be adapter`)
    assert.equal(isPortableCore(path), false, `${path} should not be core`)
  }
})

test("core and adapter never claim the same file", () => {
  for (const path of ["AGENTS.md", "command/a.md", "skills/a/SKILL.md", "src/a.mjs", "package.json"]) {
    assert.notEqual(isPortableCore(path) && isAdapter(path), true, `${path} is in both sets`)
  }
})

test("portableFiles returns the core and nothing else", () => {
  inTemp((dir) => {
    const payload = join(dir, "payload")
    mkdirSync(payload, { recursive: true })
    fakePayload(payload)
    const files = portableFiles(payload)
    assert.deepEqual(files.sort(), ["AGENTS.md", "command/alpha.md", "skills/alpha/SKILL.md"])
  })
})

test("the skill format is the shared name+description frontmatter contract", () => {
  assert.equal(SKILL_FORMAT.filename, "SKILL.md")
  assert.deepEqual(SKILL_FORMAT.requiredFrontmatter, ["name", "description"])
})

test("every payload skill already satisfies the declared contract", () => {
  const files = portableFiles(repoRoot).filter((p) => p.endsWith("/SKILL.md"))
  assert.ok(files.length > 0, "expected skills in the repository")
  for (const relative of files) {
    const text = readFileSync(join(repoRoot, relative), "utf-8")
    const name = /^---\r?\nname:\s*(.+?)\r?\n/.exec(text)?.[1]?.trim()
    const description = /^---\r?\nname:.*\r?\ndescription:\s*(.+?)\r?\n---/.exec(text)?.[1]?.trim()
    const directory = relative.split("/")[1]
    assert.equal(name, directory, `${relative} name must match its directory`)
    assert.ok(description && description.length > 0, `${relative} needs a description`)
  }
})

test("the manifest is buildable without the generated registry", () => {
  inTemp((dir) => {
    const payload = join(dir, "payload")
    mkdirSync(payload, { recursive: true })
    fakePayload(payload)
    const manifest = buildCapabilityManifest(payload)
    assert.equal(manifest.name, "gentjin")
    assert.equal(manifest.capabilities.count, 1)
    assert.equal(manifest.capabilities.list[0].id, "alpha")
    assert.deepEqual(manifest.commands.list, ["alpha"])
  })
})

test("the manifest prefers the generated registry when present", () => {
  const manifest = buildCapabilityManifest(repoRoot)
  assert.ok(manifest.capabilities.count >= 20, `expected the real catalog, got ${manifest.capabilities.count}`)
  const ids = manifest.capabilities.list.map((c) => c.id)
  assert.deepEqual(ids, [...ids].sort(), "capabilities should be sorted")
})

test("every skill in the manifest points at a real SKILL.md", () => {
  const manifest = buildCapabilityManifest(repoRoot)
  for (const capability of manifest.capabilities.list) {
    assert.ok(
      existsSync(join(repoRoot, capability.path)),
      `${capability.id} points at a missing file: ${capability.path}`,
    )
  }
})

test("the manifest names the host capabilities GENTJIN needs", () => {
  const manifest = buildCapabilityManifest(repoRoot)
  const ids = manifest.required_host_capabilities.map((c) => c.id)
  assert.deepEqual(ids, REQUIRED_HOST_CAPABILITIES.map((c) => c.id))
  assert.ok(ids.includes("shell"), "verification steps require a shell")
})

test("more than one harness target is declared so this is not OpenCode-only", () => {
  const ids = HARNESS_TARGETS.map((t) => t.id)
  assert.ok(ids.includes("opencode"))
  assert.ok(ids.length >= 3)
  const agentSkills = HARNESS_TARGETS.find((t) => t.id === "agent-skills")
  assert.equal(agentSkills.layout.skills, "skills/")
})

test("export writes the core plus metadata and leaks no adapter files", () => {
  inTemp((dir) => {
    const payload = join(dir, "payload")
    mkdirSync(payload, { recursive: true })
    fakePayload(payload)
    const exportDir = join(dir, "out")
    const result = exportPortable({ payloadRoot: payload, exportDir })

    assert.equal(result.skills, 1)
    assert.equal(result.commands, 1)
    assert.ok(existsSync(join(exportDir, "AGENTS.md")))
    assert.ok(existsSync(join(exportDir, "capabilities.json")))
    assert.ok(existsSync(join(exportDir, "INTEGRATION.md")))
    assert.ok(existsSync(join(exportDir, "skills", "alpha", "SKILL.md")))
    assert.equal(existsSync(join(exportDir, "src")), false, "adapter must not be exported")
    assert.equal(existsSync(join(exportDir, "package.json")), false, "adapter must not be exported")
  })
})

test("the generated integration guide explains the format without an OpenCode dependency", () => {
  inTemp((dir) => {
    const exportDir = join(dir, "out")
    exportPortable({ payloadRoot: repoRoot, exportDir })
    const guide = readFileSync(join(exportDir, "INTEGRATION.md"), "utf-8")
    assert.match(guide, /SKILL\.md/)
    assert.match(guide, /name.*description/s)
    assert.match(guide, /agent-skills/)
    assert.match(guide, /generic-markdown/)
  })
})

test("export refuses to run without both roots", () => {
  assert.throws(() => exportPortable({ payloadRoot: null, exportDir: "x" }), /required/)
  assert.throws(
    () => exportPortable({ payloadRoot: join(process.env.TEMP, "does-not-exist-xyz"), exportDir: "x" }),
    /does not exist/,
  )
})

test("the contract reports the same core directories it exports", () => {
  const contract = describeContract()
  assert.deepEqual(contract.core.directories, PORTABLE_CORE_DIRECTORIES)
  for (const directory of contract.core.directories) {
    assert.equal(isPortableCore(`${directory}/anything.md`), true)
  }
})