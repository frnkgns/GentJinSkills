import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { routeForRequest } from "../src/routing/route.mjs"
import { buildRegistry } from "./build-registry.mjs"
import { buildCapabilityRegistry } from "../src/capabilities/registry.mjs"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

const REPRESENTATIVE_TASKS = [
  { id: "one-line-bug-fix", request: "fix the failing test in the discovery suite" },
  { id: "small-ui-fix", request: "the button has no loading state, add one" },
  { id: "reuse-existing-utility", request: "add a debounce helper to the search input" },
  { id: "cross-module-feature", request: "add pagination to the reports endpoint and the list view" },
  { id: "security-sensitive", request: "add rate limiting to the login endpoint and check it for injection" },
  { id: "vault-retrieval", request: "what did we decide about the knowledge root override" },
]

function linesOf(file) {
  return existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/).length : 0
}

function bytesOf(file) {
  return existsSync(file) ? readFileSync(file).length : 0
}

const skills = readdirSync(join(repoRoot, "skills"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => {
    const file = join(repoRoot, "skills", e.name, "SKILL.md")
    return { skill: e.name, lines: linesOf(file), bytes: bytesOf(file) }
  })
  .sort((a, b) => b.lines - a.lines)

const registry = buildRegistry()
const capabilityRegistry = buildCapabilityRegistry(repoRoot)

const routing = REPRESENTATIVE_TASKS.map((task) => {
  const decision = routeForRequest(registry, task.request)
  const selected = decision.skills.map((s) => s.skill)
  const loadedLines = skills.filter((s) => selected.includes(s.skill)).reduce((n, s) => n + s.lines, 0)
  return {
    id: task.id,
    request: task.request,
    selected,
    selected_count: selected.length,
    loaded_skill_lines: loadedLines,
    loaded_skill_bytes: skills.filter((s) => selected.includes(s.skill)).reduce((n, s) => n + s.bytes, 0),
  }
})

const report = {
  measured_at: new Date().toISOString(),
  note: "Token usage is not exposed by the harness. Recorded as unavailable rather than estimated, per TODO.md line 29.",
  unavailable_metrics: ["prompt_tokens", "completion_tokens", "cost", "elapsed_ms"],
  always_loaded: {
    file: "AGENTS.md",
    lines: linesOf(join(repoRoot, "AGENTS.md")),
    bytes: bytesOf(join(repoRoot, "AGENTS.md")),
  },
  skill_bodies: {
    count: skills.length,
    total_lines: skills.reduce((n, s) => n + s.lines, 0),
    total_bytes: skills.reduce((n, s) => n + s.bytes, 0),
    largest: skills.slice(0, 5),
    largest_share_of_lines: Number(
      ((skills[0].lines / skills.reduce((n, s) => n + s.lines, 0)) * 100).toFixed(1),
    ),
    reference_directories: skills.filter((s) =>
      existsSync(join(repoRoot, "skills", s.skill, "references")),
    ).length,
  },
  capability_registry: {
    capabilities: capabilityRegistry.capabilities.length,
    kinds: capabilityRegistry.kinds,
  },
  routing,
  routing_totals: {
    mean_selected_per_task: Number(
      (routing.reduce((n, r) => n + r.selected_count, 0) / routing.length).toFixed(2),
    ),
    mean_loaded_skill_lines: Math.round(
      routing.reduce((n, r) => n + r.loaded_skill_lines, 0) / routing.length,
    ),
    max_loaded_skill_lines: Math.max(...routing.map((r) => r.loaded_skill_lines)),
  },
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
