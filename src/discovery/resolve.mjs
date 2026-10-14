import { existsSync, readFileSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path"

const IDENTITY_FILES = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "composer.json", "deno.json"]

export function normalizeIdentifier(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
}

function findGitRoot(start) {
  let current = resolve(start)
  for (;;) {
    if (existsSync(join(current, ".git"))) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function findNearestMarker(start, name) {
  let current = resolve(start)
  for (;;) {
    const candidate = join(current, name)
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function readOverride(file) {
  if (!file || !existsSync(file)) return null
  const text = readFileSync(file, "utf8")
  const values = {}

  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (frontmatter) {
    for (const line of frontmatter[1].split(/\r?\n/)) {
      const match = /^([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/.exec(line.trim())
      if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "").trim()
    }
  }

  // Accept the prose form people actually write (`- Knowledge root: ~/...`) as well as the
  // hyphenated key. A key silently ignored here points the session at a vault that does not
  // exist, and every note then reads as being outside the knowledge root.
  const key = "[A-Za-z][A-Za-z0-9 _-]*"
  for (const line of text.split(/\r?\n/)) {
    const match = new RegExp(`^[-*]?\\s*(${key})\\s*:\\s*(.+?)\\s*$`).exec(line.trim())
    if (!match) continue
    const name = match[1].trim().replace(/\s+/g, "_").toLowerCase()
    if (values[name] === undefined) {
      values[name] = match[2].replace(/^["'`]|["'`]$/g, "").trim()
    }
  }

  return Object.keys(values).length > 0 ? values : null
}

function identityFromManifest(root) {
  for (const file of IDENTITY_FILES) {
    const path = join(root, file)
    if (!existsSync(path)) continue
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"))
      const name = parsed?.name
      if (typeof name === "string" && name.trim()) return { raw: name, source: `${file}.name` }
    } catch {
      continue
    }
  }
  return null
}

/**
 * Resolves the project root, a normalized identity, and the knowledge root using the
 * precedence already documented in AGENTS.md and the knowledge-vault skill: git root first for
 * the root, `.project-agent.md` first for identity, with an explicit override honoured.
 */
export function resolveProject(startDir = process.cwd()) {
  const start = resolve(startDir)
  const gitRoot = findGitRoot(start)
  const markerFile = findNearestMarker(start, ".project-agent.md")

  const roots = []
  if (gitRoot) roots.push({ root: gitRoot, source: "git_root" })
  if (markerFile) {
    const metadataRoot = dirname(markerFile)
    if (!gitRoot || metadataRoot !== gitRoot) {
      roots.push({ root: metadataRoot, source: ".project-agent.md" })
    }
  }
  roots.push({ root: start, source: "working_directory" })

  const chosen = roots[0]
  const override = readOverride(markerFile)

  const candidates = []
  if (override) {
    for (const key of ["name", "project", "project_name", "id"]) {
      if (override[key]) {
        candidates.push({ raw: override[key], source: `.project-agent.md:${key}` })
        break
      }
    }
  }
  const manifestIdentity = identityFromManifest(chosen.root)
  if (manifestIdentity) candidates.push(manifestIdentity)
  candidates.push({ raw: basename(chosen.root), source: "root_directory_name" })

  const identity = candidates[0]
  const identifier = normalizeIdentifier(identity.raw)

  const overriddenKnowledge = override?.knowledge_root ?? override?.knowledgeRoot ?? override?.vault ?? null
  const knowledgeRoot = overriddenKnowledge
    ? expandHome(overriddenKnowledge)
    : join(homedir(), "Documents", "KnowledgeVault", identifier)

  return {
    project_root: chosen.root,
    root_source: chosen.source,
    identity: identity.raw,
    identity_source: identity.source,
    identifier,
    identity_candidates: candidates,
    knowledge_root: knowledgeRoot,
    knowledge_root_source: overriddenKnowledge ? "override" : "default",
    git_root: gitRoot,
    git: Boolean(gitRoot),
    override_file: markerFile,
    monorepo: declaresWorkspaces(chosen.root) || countPackageFiles(chosen.root) > 1,
  }
}

function countPackageFiles(root, depth = 0) {
  if (!existsSync(root) || depth > 2) return 0
  let count = 0
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && IDENTITY_FILES.includes(entry.name)) count += 1
    else if (entry.isDirectory() && count <= 1) {
      count += countPackageFiles(join(root, entry.name), depth + 1)
    }
    if (count > 1) return count
  }
  return count
}

function declaresWorkspaces(root) {
  const path = join(root, "package.json")
  if (!existsSync(path)) return false
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"))
    return Array.isArray(parsed?.workspaces)
  } catch {
    return false
  }
}

export function expandHome(path) {
  if (!isAbsolute(path) && /^[~]/.test(path)) {
    return join(homedir(), path.replace(/^~[\\/]?/, ""))
  }
  return resolve(path)
}

export function isWithin(candidate, root) {
  if (!root) return false
  const a = resolve(candidate).toLowerCase()
  const b = resolve(root).toLowerCase()
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep)
}