import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "..")
const skillsDir = join(repoRoot, "skills")
const outFile = join(repoRoot, "registry", "skills.json")

export const REVIEW_ONLY_SKILLS = new Set([
  "api-design",
  "architecture-review",
  "database-review",
  "dependency-review",
  "deployment-readiness",
  "frontend-review",
  "integration-review",
  "performance-review",
  "requirements-review",
  "security-review",
  "test-strategy",
  "review-orchestrator",
])

export const CAPABILITY_CONTRACTS = {
  "read/search": {
    tools: ["read", "glob", "grep"],
    mutating: false,
    requires_approval: false,
    records: "action.executed",
  },
  "diff inspection": {
    tools: ["bash"],
    mutating: false,
    requires_approval: false,
    records: "action.executed",
    note: "Read-only git commands only. Any mutating git command is out of contract.",
  },
  "local edits": {
    tools: ["edit", "write"],
    mutating: true,
    requires_approval: false,
    records: "file.changed",
    note: "Scoped to task.scope.allowed_paths.",
  },
  "verification commands": {
    tools: ["bash"],
    mutating: false,
    requires_approval: false,
    records: "verification.evidence",
    note: "Exit code is the evidence. Never assert a result without one.",
  },
  "read-only database inspection": {
    tools: ["bash"],
    mutating: false,
    requires_approval: false,
    records: "action.executed",
    note: "SELECT only. Any mutation verb is a scope violation.",
  },
  reporting: {
    tools: ["edit", "write"],
    mutating: true,
    requires_approval: false,
    records: "task.finished",
  },
}

export const FORBIDDEN_CAPABILITIES = [
  { capability: "external write", reason: "Not part of any Overgeared Skills contract. Requires separate authorization." },
  { capability: "destructive filesystem operation", reason: "Never authorized by a skill selection." },
  { capability: "database mutation", reason: "Read-only by default. Requires explicit authorization." },
  { capability: "git push or history rewrite", reason: "Requires explicit user request." },
  { capability: "deployment", reason: "Requires explicit authorization." },
  { capability: "credential read", reason: "Secrets are never read into context or traces." },
]

export function parseFrontmatter(text) {
  if (!text.startsWith("---")) return {}
  const end = text.indexOf("\n---", 3)
  if (end === -1) return {}
  const block = text.slice(3, end)
  const result = {}
  for (const line of block.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim())
    if (!match) continue
    result[match[1]] = match[2].replace(/^["']|["']$/g, "").trim()
  }
  return result
}

export function inferTriggers(name, description) {
  const triggers = []
  const text = `${name} ${description}`.toLowerCase()
  const table = {
    "database-review": ["sql", "schema", "query", "migration", "index", "data integrity"],
    "security-review": ["auth", "authz", "secret", "token", "credential", "injection", "pii", "permission"],
    "deployment-readiness": ["deploy", "release", "production", "rollout", "rollback", "go live", "readiness"],
    "incident-response": ["outage", "incident", "down", "production broken", "latency spike", "error rate"],
    "frontend-review": ["ui", "responsive", "accessibility", "a11y", "render", "layout", "component", "css"],
    "backend-review": ["handler", "service", "job", "worker", "webhook", "queue", "retry", "idempotency"],
    "api-design": ["endpoint", "contract", "pagination", "request shape", "response shape", "versioning"],
    "integration-review": ["boundary", "integration", "cross-layer", "api to db", "webhook to"],
    "performance-review": ["slow", "latency", "throughput", "n+1", "memory leak", "optimize", "benchmark"],
    "test-strategy": ["test coverage", "what to test", "regression test", "test level"],
    "systematic-debugging": ["bug", "broken", "regression", "not working", "why is this happening", "fails"],
    "requirements-review": ["ambiguous", "unclear requirement", "acceptance criteria", "conflicting"],
    "architecture-review": ["architecture", "subsystem", "migration path", "redesign", "scaffold", "module ownership"],
    "refactoring-migration": ["refactor", "migrate", "expand-contract", "dual-write", "backfill", "deprecate"],
    "project-conventions": ["existing codebase", "match conventions", "reuse existing", "codebase learning"],
    "knowledge-vault": ["remember", "knowledge", "vault", "note", "what did we decide", "prior session"],
    "work-in-progress": ["pause", "stop for now", "continue later", "resume", "checkpoint", "unfinished"],
    "compaction": ["context too large", "condense", "summarize context", "topic drift"],
    "reporting": ["report", "write up", "change summary", "document changes"],
    "git-workflow": ["commit", "branch", "push", "merge", "git status", "diff review"],
    "cleanup": ["clean up", "before merge", "production ready", "dead code", "leftover debug"],
    "incident-handling": [],
    "review-orchestrator": ["full review", "whole codebase", "comprehensive review", "changes review"],
"skill-authoring": ["new skill", "write a skill", "edit a skill", "author a skill", "skill triggers", "merge two skills"],
    "dependency-review": ["add a package", "upgrade dependency", "replace library", "audit finding", "npm audit"],
  }
  triggers.push(...(table[name] ?? []))
  if (triggers.length === 0) {
    const firstClause = description.split(/[.,;]/)[0].toLowerCase()
    if (firstClause) triggers.push(firstClause)
  }
  return [...new Set(triggers)].filter((t) => t && text.includes(t.split(" ")[0]) || t)
}

export function buildRegistry() {
  const entries = []
  for (const name of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    const skillFile = join(skillsDir, name.name, "SKILL.md")
    if (!existsSync(skillFile)) continue

    const raw = readFileSync(skillFile, "utf8")
    const front = parseFrontmatter(raw)
    const description = front.description ?? ""
    const reviewOnly = REVIEW_ONLY_SKILLS.has(name.name)

    entries.push({
      skill: name.name,
      version: 1,
      description,
      triggers: inferTriggers(name.name, description),
      prerequisites: [],
      scope: reviewOnly ? "review_and_report" : "implement_and_verify",
      allowed_actions: reviewOnly ? ["read", "search", "diff_inspection", "reporting"] : [
        "read/search",
        "diff inspection",
        "local edits",
        "verification commands",
        "reporting",
      ],
      required_verification: reviewOnly
        ? ["review findings reference concrete files and lines"]
        : ["a verification command was actually executed", "its exit code is recorded as observed evidence"],
      review_only: reviewOnly,
      grants_code_change_authority: false,
      path: `skills/${name.name}/SKILL.md`,
      has_description: description.length > 0,
    })
  }

  entries.sort((a, b) => a.skill.localeCompare(b.skill))
  return {
    schema_version: 1,
    generated_from: "skills/*/SKILL.md frontmatter",
    generated_by: "scripts/build-registry.mjs",
    routing_observability: {
      basis: "inferred",
      reason:
        "Skill selection fires no OpenCode hook. Routing is inferred from which SKILL.md files are read via read tool calls and must never be reported as observed.",
    },
    capabilities: CAPABILITY_CONTRACTS,
    forbidden: FORBIDDEN_CAPABILITIES,
    skills: entries,
  }
}

if (process.argv[1] && process.argv[1].endsWith("build-registry.mjs")) {
  const registry = buildRegistry()
  writeFileSync(outFile, `${JSON.stringify(registry, null, 2)}\n`, "utf8")
  const missing = registry.skills.filter((s) => !s.has_description)
  console.log(`wrote ${registry.skills.length} skills to registry/skills.json`)
  if (missing.length > 0) {
    console.log(`WARNING: ${missing.length} skill(s) lack a frontmatter description:`)
    for (const s of missing) console.log(`  - ${s.skill}`)
    process.exitCode = 1
  }
}