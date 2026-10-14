import { createHash } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"

export const PAYLOAD_DIRECTORIES = [
  "command",
  "skills",
  "src",
  "registry",
  "plugins",
  "evals",
  "scripts",
  "docs",
  "test",
  "schemas",
  "guardrails",
]
/**
 * `package.json` is deliberately excluded: <opencode-root> owns its own, and it carries the user's
 * installed plugin dependencies. Copying the repository manifest over it breaks every package the
 * runtime resolves from that directory. `tsconfig.json` does ship, because without it the installed
 * tree's typecheck script silently passes without checking anything.
 */
export const PAYLOAD_FILES = ["AGENTS.md", "tsconfig.json"]

export function sha256OfFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function listFiles(root, prefix, out = []) {
  const dir = join(root, prefix)
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`
    if (entry.isDirectory()) listFiles(root, relative, out)
    else out.push(relative)
  }
  return out
}

export function payloadFiles(payloadRoot) {
  const found = [...PAYLOAD_FILES, ...PAYLOAD_DIRECTORIES.flatMap((d) => listFiles(payloadRoot, d))]
  return [...new Set(found.filter((p) => existsSync(join(payloadRoot, p))))].sort()
}

/**
 * Refuses to touch an installation unless the payload looks like a real GENTJIN tree. A stale,
 * truncated, or wrong-directory payload must never be able to delete a working installation.
 */
export function preflightPayload(payloadRoot) {
  if (!payloadRoot) return { ok: false, reason: "no payload root was supplied" }
  if (!existsSync(payloadRoot)) return { ok: false, reason: `payload root does not exist: ${payloadRoot}` }

  const isDir = existsSync(join(payloadRoot, "command")) && existsSync(join(payloadRoot, "skills"))
  if (!isDir) {
    return { ok: false, reason: "payload does not contain both command/ and skills/, so it is not a GENTJIN tree" }
  }

  const commands = listFiles(payloadRoot, "command").filter((p) => p.endsWith(".md"))
  const skills = listFiles(payloadRoot, "skills").filter((p) => p.endsWith("SKILL.md"))
  if (commands.length === 0) return { ok: false, reason: "payload contains no command markdown files" }
  if (skills.length === 0) return { ok: false, reason: "payload contains no skill files" }
  if (!existsSync(join(payloadRoot, "AGENTS.md"))) {
    return { ok: false, reason: "payload has no AGENTS.md, so it is incomplete" }
  }

  return { ok: true, reason: null, commands: commands.length, skills: skills.length }
}

/**
 * Applies a validated payload. Nothing is removed unless the payload passed preflight, and a
 * locally modified managed file is never replaced. Metadata is written last.
 */
export function applyPayload({ root, payloadRoot, manifest, branch, commit }) {
  const preflight = preflightPayload(payloadRoot)
  if (!preflight.ok) {
    return {
      applied: false,
      refused: true,
      reason: preflight.reason,
      replaced: [],
      skippedLineEndingOnly: [],
      staleRemoved: [],
      installed: [],
    }
  }

  const wanted = payloadFiles(payloadRoot)
  const previousByPath = new Map((manifest?.managedFiles ?? []).map((f) => [f.path, f]))

  const replaced = []
  const skippedLineEndingOnly = []
  const refusedLocal = []
  const managedFiles = []

  const normalize = (b) => b.toString("binary").replace(/\r\n/g, "\n")

  for (const relative of wanted) {
    const installedPath = join(root, relative)
    const payloadPath = join(payloadRoot, relative)
    const previous = previousByPath.get(relative)

    if (existsSync(installedPath) && previous && sha256OfFile(installedPath) !== previous.sha256) {
      refusedLocal.push(relative)
      managedFiles.push(previous)
      continue
    }

    if (!existsSync(installedPath)) {
      mkdirSync(dirname(installedPath), { recursive: true })
      copyFileSync(payloadPath, installedPath)
      managedFiles.push({ path: relative, sha256: sha256OfFile(installedPath) })
      replaced.push(relative)
      continue
    }

    if (sha256OfFile(installedPath) === sha256OfFile(payloadPath)) {
      managedFiles.push({ path: relative, sha256: sha256OfFile(installedPath) })
      continue
    }

    if (normalize(readFileSync(installedPath)) === normalize(readFileSync(payloadPath))) {
      skippedLineEndingOnly.push(relative)
      managedFiles.push({ path: relative, sha256: sha256OfFile(installedPath) })
      continue
    }

    copyFileSync(payloadPath, installedPath)
    managedFiles.push({ path: relative, sha256: sha256OfFile(installedPath) })
    replaced.push(relative)
  }

  const staleRemoved = []
  for (const entry of manifest?.managedFiles ?? []) {
    if (wanted.includes(entry.path)) continue
    const installedPath = join(root, entry.path)
    if (!existsSync(installedPath)) continue
    if (sha256OfFile(installedPath) !== entry.sha256) {
      refusedLocal.push(entry.path)
      continue
    }
    rmSync(installedPath, { force: true })
    staleRemoved.push(entry.path)
  }

  const next = {
    ...(manifest ?? {}),
    branch,
    installedCommit: commit,
    updatedAt: new Date().toISOString(),
    managedFiles: managedFiles.sort((a, b) => a.path.localeCompare(b.path)),
  }

  mkdirSync(join(root, ".gentjin"), { recursive: true })
  writeFileSync(join(root, ".gentjin", "manifest.json"), `${JSON.stringify(next, null, 2)}\n`)
  writeFileSync(
    join(root, ".gentjin", "version.json"),
    `${JSON.stringify({ version: commit, branch }, null, 2)}\n`,
  )

  return {
    applied: true,
    refused: false,
    reason: null,
    replaced,
    skippedLineEndingOnly,
    staleRemoved,
    refusedLocal,
    installed: managedFiles.length,
    preflight,
  }
}
