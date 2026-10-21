import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { validate } from "../schema/validate.mjs"

export const KINDS = ["skill", "command", "reference"]

export const GUARDED_COMMANDS = {
  "update-overgeared-skills": {
    guarded: true,
    reason: "mutates the installed Overgeared Skills payload and metadata",
    preconditions: ["payload reconciled", "conflicts reviewed", "metadata written last"],
  },
  "install-overgeared-skills": {
    guarded: true,
    reason: "mutates the installed Overgeared Skills payload and metadata",
    preconditions: ["source resolved", "payload installed", "verification passed"],
  },
  "git-push": {
    guarded: true,
    reason: "creates branches, commits, and pushes to a remote",
    preconditions: ["branch approved", "cleanup gate passed", "commit body checked"],
  },
}

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

export function parseFrontmatter(text) {
  if (!text.startsWith("---")) return {}
  const end = text.indexOf("\n---", 3)
  if (end === -1) return {}
  const result = {}
  for (const line of text.slice(3, end).split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim())
    if (match) result[match[1]] = match[2].replace(/^["']|["']$/g, "").trim()
  }
  return result
}

export function parseWaivableSteps(text) {
  const section = /^##\s+Waivable steps\s*$([\s\S]*?)(?=^##\s|\Z)/m.exec(text)
  if (!section) return []

  const steps = []
  for (const line of section[1].split(/\r?\n/)) {
    const match = /^\s*-\s*(.+?)\s*:\s*(.+?)\s*$/.exec(line)
    if (match) steps.push({ step: match[1].trim(), reason: match[2].trim() })
  }
  return steps
}

const SKILL_TRIGGERS = {
  "database-review": ["sql", "schema", "query", "migration", "index", "data integrity"],
  "security-review": ["auth", "secret", "token", "credential", "injection", "pii", "permission"],
  "deployment-readiness": ["deploy", "release", "production", "rollback", "readiness"],
  "incident-response": ["outage", "incident", "down", "latency spike", "error rate"],
  "frontend-review": ["ui", "responsive", "accessibility", "render", "layout", "css"],
  "backend-review": ["handler", "service", "job", "webhook", "queue", "retry", "idempotency"],
  "api-design": ["endpoint", "contract", "pagination", "response shape", "versioning"],
  "integration-review": ["seam", "cross-layer", "integration defect"],
  "performance-review": ["slow", "latency", "throughput", "n+1", "memory leak", "optimize"],
  "test-strategy": ["test coverage", "what to test", "regression test"],
  "systematic-debugging": [
    "bug",
    "broken",
    "regression",
    "not working",
    "why is this happening",
    "fails",
    "investigate why",
    "why is this table is empty",
    "data is returned but",
    "renders no rows",
    "no table rows appear",
    "why is it empty",
    "this is empty",
    "diagnose",
    "debug this",
    "something is broken",
    "throws",
    "unexpected behavior",
  ],
  "requirements-review": ["ambiguous", "acceptance criteria", "conflicting rules"],
  "architecture-review": ["architecture", "subsystem", "migration path", "redesign", "scaffold"],
  "refactoring-migration": ["refactor", "migrate", "dual-write", "backfill", "deprecate"],
  "project-conventions": ["existing codebase", "match conventions", "reuse existing"],
  "knowledge-vault": ["remember", "knowledge vault", "what did we decide", "prior session"],
  "work-in-progress": ["pause", "stop for now", "continue later", "resume", "unfinished work"],
  "compaction": ["context too large", "condense context", "topic drift"],
  "reporting": ["write a report", "change summary", "document the changes"],
  "git-workflow": ["commit", "branch", "push", "merge", "git status", "git diff"],
  "cleanup": ["clean up", "before merge", "production ready", "leftover debug"],
  "review-orchestrator": ["full review", "whole project", "comprehensive review"],
  "dependency-review": ["add a package", "upgrade dependency", "replace library", "audit finding"],
  "skill-authoring": ["new skill", "author a skill", "skill triggers", "merge two skills"],
}

const COMMAND_INTENTS = {
  "update-overgeared-skills": [
    "update overgeared-skills",
    "update overgeared skills",
    "update the overgeared-skills",
    "update the overgeared skills",
    "refresh my overgeared-skills installation",
    "refresh my overgeared skills installation",
    "upgrade overgeared-skills",
    "upgrade overgeared skills",
    "sync overgeared-skills",
    "sync overgeared skills",
    "bring overgeared-skills up to date",
    "bring overgeared skills up to date",
    "update gentjin",
    "update the gentjin",
    "refresh my gentjin installation",
    "update the genthin",
    "upgrade gentjin",
    "sync gentjin",
    "bring gentjin up to date",
  ],
  "install-overgeared-skills": [
    "install overgeared-skills",
    "install overgeared skills",
    "set up overgeared-skills",
    "set up overgeared skills",
    "first time install overgeared-skills",
    "first time install overgeared skills",
    "install gentjin",
    "set up gentjin",
    "first time install gentjin",
  ],
  "git-push": ["push my changes", "commit and push", "prepare my changes for push", "push this branch"],
  "changes-review": ["review what i changed", "review my changes", "review my recent diff", "review the diff"],
  "project-review": ["review the whole project", "full project review"],
  "report": ["make a report", "report of what changed", "write up the changes"],
  "pause": ["pause here", "save our progress", "continue later", "stop for now"],
  "resume": ["continue where we left off", "resume", "continue previous work", "where we stopped"],
  "learn-skills": ["learn the skills", "load all skills", "read all skills", "what skills do you have"],
  "setup-git-guardrails": ["add git guardrails", "block dangerous git commands", "git safety hooks"],
  "cleanup": ["clean up the code", "before merge cleanup"],
  "status": ["what is the status", "current status"],
  "task": ["start a task", "track this task"],
  "deployment-check": ["deployment readiness", "ready to deploy"],
}

const EXCLUSIONS = {
  "update-overgeared-skills": [
    'explaining what "/update-overgeared-skills" does is not an update',
    '"do not update overgeared-skills, explain the steps" performs no update',
    "a quoted transcript containing the phrase does not trigger it",
    'updating an application dependency is not an Overgeared Skills update',
    'editing Overgeared Skills source documentation is not an installation update',
  ],
  "install-overgeared-skills": ["re-running install when an installation already exists is an update, not a first install"],
  "changes-review": ['"review only, do not edit" keeps the workflow read-only'],
  "project-review": ["reports findings without applying fixes"],
}

/**
 * Reference files are a skill's deferred detail. They are registered as their own capability so a
 * session pays for them only when the active workflow actually needs that section, and the parent
 * skill advertises them by id so the model knows they exist before deciding to load one.
 */
function buildReferences(repoRoot, skillName) {
  const dir = join(repoRoot, "skills", skillName, "references")
  if (!existsSync(dir)) return []
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue
    const base = entry.name.replace(/\.md$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    if (!base) continue
    const relative = `skills/${skillName}/references/${entry.name}`
    const body = readFileSync(join(repoRoot, relative), "utf8")
    const front = parseFrontmatter(body)
    const heading = /^#\s+(.+)$/m.exec(body)
    found.push({
      id: `${skillName}-${base}`,
      kind: "reference",
      path: relative,
      parent: skillName,
      description: front.description ?? heading?.[1]?.trim() ?? `${base} reference material for ${skillName}`,
      intent: [],
      aliases: [],
      prerequisites: [],
      scope: "reference_material",
      grants_code_change_authority: false,
      review_only: false,
      guarded: false,
      allowed_actions: ["read"],
      exclusions: [],
      waivable_steps: [],
    })
  }
  return found.sort((a, b) => a.id.localeCompare(b.id))
}

export function buildCapabilityRegistry(repoRoot) {
  const capabilities = []

  const skillsDir = join(repoRoot, "skills")
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!name.isDirectory()) continue
      const file = join(skillsDir, name.name, "SKILL.md")
      if (!existsSync(file)) continue
      const body = readFileSync(file, "utf8")
      const front = parseFrontmatter(body)
      const waivable = parseWaivableSteps(body)
      const reviewOnly = REVIEW_ONLY_SKILLS.has(name.name)
      const references = buildReferences(repoRoot, name.name)
      capabilities.push({
        id: name.name,
        kind: "skill",
        path: `skills/${name.name}/SKILL.md`,
        description: front.description ?? "",
        intent: SKILL_TRIGGERS[name.name] ?? [],
        aliases: [],
        prerequisites: [],
        references: references.map((r) => r.id),
        scope: reviewOnly ? "review_and_report" : "implement_and_verify",
        grants_code_change_authority: false,
        review_only: reviewOnly,
        guarded: false,
        allowed_actions: reviewOnly
          ? ["read", "search", "diff_inspection", "reporting"]
          : ["read/search", "diff_inspection", "local edits", "verification commands", "reporting"],
        exclusions: [],
        waivable_steps: waivable,
      })
      capabilities.push(...references)
    }
  }

  const commandDir = join(repoRoot, "command")
  if (existsSync(commandDir)) {
    for (const file of readdirSync(commandDir)) {
      if (!file.endsWith(".md")) continue
      const id = file.replace(/\.md$/, "")
      const front = parseFrontmatter(readFileSync(join(commandDir, file), "utf8"))
      const guard = GUARDED_COMMANDS[id]
      const waivable = parseWaivableSteps(readFileSync(join(commandDir, file), "utf8"))
      capabilities.push({
        id,
        kind: "command",
        path: `command/${file}`,
        description: front.description ?? "",
        intent: COMMAND_INTENTS[id] ?? [],
        aliases: [`/${id}`],
        prerequisites: [],
        scope: guard?.guarded ? "mutating_workflow" : "assisted_workflow",
        grants_code_change_authority: Boolean(guard?.guarded),
        review_only: false,
        guarded: Boolean(guard?.guarded),
        guarded_reason: guard?.reason ?? null,
        required_preconditions: guard?.preconditions ?? [],
        allowed_actions: guard?.guarded
          ? ["read", "local edits to the installation", "version control", "reporting"]
          : ["read", "reporting"],
        exclusions: EXCLUSIONS[id] ?? [],
        waivable_steps: waivable,
      })
    }
  }

  capabilities.sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)))

  return {
    schema_version: 1,
    generated_from: "skills/*/SKILL.md and command/*.md frontmatter",
    generated_by: "scripts/build-capabilities.mjs",
    kinds: KINDS,
    loading: {
      mechanism:
        "A capability is selected first, then its canonical file body is read before any action it governs.",
      note:
        "Selection alone is not loading, and loading is not following. Each is recorded separately in the adherence state.",
    },
    capabilities,
  }
}

const capabilitySchema = {
  type: "object",
  required: ["schema_version", "kinds", "capabilities"],
  properties: {
    schema_version: { const: 1 },
    kinds: { type: "array", minItems: 2, items: { enum: KINDS } },
    loading: { type: "object" },
    capabilities: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "path", "description", "intent", "scope", "grants_code_change_authority", "guarded"],
        properties: {
          id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" },
          kind: { enum: KINDS },
          path: { type: "string" },
          description: { type: "string", minLength: 1 },
          intent: { type: "array", items: { type: "string" } },
          aliases: { type: "array", items: { type: "string" } },
          prerequisites: { type: "array", items: { type: "string" } },
          references: { type: "array", items: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" } },
          parent: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" },
          scope: { type: "string", minLength: 1 },
          grants_code_change_authority: { type: "boolean" },
          review_only: { type: "boolean" },
          guarded: { type: "boolean" },
          guarded_reason: { type: ["string", "null"] },
          required_preconditions: { type: "array", items: { type: "string" } },
          allowed_actions: { type: "array", items: { type: "string" } },
          exclusions: { type: "array", items: { type: "string" } },
          waivable_steps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["step", "reason"],
              properties: { step: { type: "string", minLength: 1 }, reason: { type: "string", minLength: 1 } },
            },
          },
        },
      },
    },
  },
}

export function validateCapabilityRegistry(registry) {
  return validate(registry, capabilitySchema)
}