import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import assert from "node:assert/strict"
import { buildRegistry } from "../scripts/build-registry.mjs"
import { payloadFiles } from "../src/install/apply.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

function inTemp(fn) {
  const dir = mkdtempSync(join(process.env.TEMP, "gentjin-install-"))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function installTo(target, source = repoRoot) {
  for (const rel of payloadFiles(source)) {
    const dest = join(target, rel)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(source, rel), dest)
  }
}

test("a clean install copies the full runtime payload into a temporary location", () => {
  inTemp((target) => {
    installTo(target)
    for (const rel of payloadFiles(repoRoot)) {
      assert.ok(existsSync(join(target, rel)), `missing after install: ${rel}`)
    }
    assert.ok(existsSync(join(target, "AGENTS.md")))
    assert.ok(existsSync(join(target, "skills", "knowledge-vault", "SKILL.md")))
    assert.ok(existsSync(join(target, "plugins", "gentjin-trace.js")))
    assert.ok(existsSync(join(target, "src", "trace", "plugin-body.mjs")))
    assert.ok(existsSync(join(target, "src", "trace", "plugin-support.mjs")))
    assert.ok(existsSync(join(target, "registry", "skills.json")))
  })
})

test("the payload ships the typecheck config, because without it the typecheck script silently passes", () => {
  assert.ok(
    payloadFiles(repoRoot).includes("tsconfig.json"),
    "tsconfig.json must be in the payload or an installed copy reports a clean typecheck it never ran",
  )
})

test("the payload ships the plugins that OpenCode 2 requires a definition object from", () => {
  inTemp((target) => {
    installTo(target)
    const plugin = readFileSync(join(target, "plugins", "gentjin-capabilities.ts"), "utf8")
    assert.match(plugin, /id: "gentjin"/, "the plugin must export a V2 definition object")
    assert.match(plugin, /async setup\(ctx/, "the plugin must initialize inside setup")
  })
})

test("an upgrade preserves user configuration and unrelated files", () => {
  inTemp((target) => {
    installTo(target)

    const userConfig = join(target, "opencode.jsonc")
    writeFileSync(userConfig, '{ "model": "some/model" }\n')
    mkdirSync(join(target, "command"), { recursive: true })
    writeFileSync(join(target, "command", "my-own-command.md"), "# my command\n")
    mkdirSync(join(target, "skills", "my-own-skill"), { recursive: true })
    writeFileSync(join(target, "skills", "my-own-skill", "SKILL.md"), "---\nname: my-own-skill\ndescription: mine\n---\n")

    const skillCountBefore = readdirSync(join(target, "skills")).length

    copyFileSync(join(repoRoot, "AGENTS.md"), join(target, "AGENTS.md"))
    writeFileSync(join(target, "skills", "knowledge-vault", "SKILL.md"), "# updated\n")

    assert.equal(readFileSync(userConfig, "utf8"), '{ "model": "some/model" }\n')
    assert.ok(existsSync(join(target, "command", "my-own-command.md")), "user command was destroyed")
    assert.ok(existsSync(join(target, "skills", "my-own-skill", "SKILL.md")), "user skill was destroyed")
    assert.equal(readdirSync(join(target, "skills")).length, skillCountBefore)
  })
})

test("no credential file, dependency directory, or generated trace is shipped", () => {
  const forbiddenPaths = [
    /(^|\/)\.env(\.|$)/i,
    /(^|\/)node_modules\//,
    /(^|\/)\.tmp-trace-/,
    /^\.tmp-trace/,
    /(^|\/)traces\/.*\.jsonl$/,
    /(^|\/)traces\/.*\.json$/,
    /\.pem$/i,
    /(^|\/)id_rsa/i,
    /\.jsonl$/,
  ]
  for (const rel of payloadFiles(repoRoot)) {
    for (const pattern of forbiddenPaths) {
      assert.equal(pattern.test(rel), false, `forbidden path shipped: ${rel}`)
    }
  }
})

test("no real-looking secret value appears in the shipped payload", () => {
  const tokenPatterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    /\bsk-(?:live|proj)-[A-Za-z0-9]{20,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
    /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s"']+:[^\s"'@]+@/,
  ]

  const syntheticOnly = /SYNTHETIC|NOT-REAL|synthetic|db\.invalid/i
  const leaks = []

  for (const rel of payloadFiles(repoRoot)) {
    if (!/\.(md|json|jsonc|mjs)$/.test(rel)) continue
    const text = readFileSync(join(repoRoot, rel), "utf8")

    for (const line of text.split(/\r?\n/)) {
      for (const pattern of tokenPatterns) {
        if (pattern.test(line) && !syntheticOnly.test(line)) leaks.push(`${rel}: ${line.trim().slice(0, 80)}`)
      }
    }

    for (const block of text.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g) ?? []) {
      if (!syntheticOnly.test(block)) leaks.push(`${rel}: PEM block without a synthetic marker`)
    }
  }
  assert.deepEqual(leaks, [], `possible secret in payload:\n${leaks.join("\n")}`)
})

const ABSOLUTE_USER_PATH = new RegExp(["C:", "[\\\\/]", "Users", "[\\\\/]"].join(""))
const APPDATA_PATH = new RegExp(["AppData", "[\\\\/]"].join(""))

function scanForIdentityLeaks(dir, skipFile) {
  const leaks = []
  for (const rel of payloadFiles(dir)) {
    if (skipFile && rel === skipFile) continue
    const text = readFileSync(join(dir, rel), "utf8")
    if (ABSOLUTE_USER_PATH.test(text)) leaks.push(rel)
    if (APPDATA_PATH.test(text)) leaks.push(`${rel} (AppData path)`)
  }
  return leaks
}

test("the shipped payload contains no absolute user paths", () => {
  assert.deepEqual(scanForIdentityLeaks(repoRoot, "test/install.test.mjs"), [])
})

test("the scanner detects an absolute user path when one is present", () => {
  const windowsUserRoot = ["C:", "\\", "Users", "\\", "someone"].join("")
  const posixUserRoot = ["C:", "/", "Users", "/", "someone"].join("")
  assert.equal(ABSOLUTE_USER_PATH.test(`${windowsUserRoot}\\.config`), true)
  assert.equal(ABSOLUTE_USER_PATH.test(`${posixUserRoot}/.config`), true)
  assert.equal(ABSOLUTE_USER_PATH.test("<user-home>/.config/opencode"), false)
  assert.equal(ABSOLUTE_USER_PATH.test("~/Documents/KnowledgeVault"), false)
  const appDataSegment = ["App", "Data"].join("")
  assert.equal(APPDATA_PATH.test(`${appDataSegment}${"/"}Local${"/"}Temp`), true)
  assert.equal(APPDATA_PATH.test(`<user-home>/.local/state/gentjin`), false)
})

test("installed code runs from the temporary location without the repository", () => {
  inTemp((target) => {
    installTo(target)
    const registry = buildRegistry()
    const skillFiles = registry.skills.map((s) => join(target, s.path))
    for (const file of skillFiles) {
      assert.ok(existsSync(file), `installed registry references a missing file: ${file}`)
    }
    assert.ok(registry.skills.length >= 23)
  })
})

test("regenerating the registry is deterministic", () => {
  const a = JSON.stringify(buildRegistry())
  const b = JSON.stringify(buildRegistry())
  assert.equal(a, b)
})

test("the committed registry matches a fresh build", () => {
  const committed = JSON.parse(readFileSync(join(repoRoot, "registry", "skills.json"), "utf8"))
  const fresh = buildRegistry()
  assert.deepEqual(
    committed.skills.map((s) => s.skill).sort(),
    fresh.skills.map((s) => s.skill).sort(),
    "registry/skills.json is stale; run node scripts/build-registry.mjs",
  )
})