/**
 * Portable export.
 *
 * Produces a harness-neutral copy of the Overgeared Skills core plus the metadata a foreign host needs
 * to detect and install it. The export never touches a destination; it only writes into a
 * staging directory the caller chooses, so it is safe to run for inspection.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { describeContract, isPortableCore, PORTABLE_CORE_DIRECTORIES } from "./contract.mjs"

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

/** Every portable-core file in a payload tree, repo-relative and forward-slashed. */
export function portableFiles(payloadRoot) {
  const found = []
  const agents = join(payloadRoot, "AGENTS.md")
  if (existsSync(agents)) found.push("AGENTS.md")
  for (const directory of PORTABLE_CORE_DIRECTORIES) {
    found.push(...listFiles(payloadRoot, directory))
  }
  return [...new Set(found.filter((p) => isPortableCore(p)))].sort()
}

/**
 * Capability manifest for a host that cannot run Overgeared Skills tooling. Prefers the generated
 * registry when present, and falls back to parsing the payload frontmatter so a plain clone is
 * still describable.
 */
function skillsFromFrontmatter(payloadRoot) {
  const skills = []
  for (const relative of portableFiles(payloadRoot)) {
    if (!relative.endsWith("/SKILL.md")) continue
    const text = readFileSync(join(payloadRoot, relative), "utf-8")
    const name = /^---\r?\nname:\s*(.+?)\r?\n/.exec(text)?.[1]?.trim()
    const description = /^---\r?\nname:.*\r?\ndescription:\s*(.+?)\r?\n---/.exec(text)?.[1]?.trim()
    if (name) skills.push({ id: name, description: description ?? null, path: relative, prerequisites: [] })
  }
  return skills
}

export function buildCapabilityManifest(payloadRoot) {
  const registryPath = join(payloadRoot, "registry", "capabilities.json")
  let skills = []

  if (existsSync(registryPath)) {
    try {
      const registry = JSON.parse(readFileSync(registryPath, "utf-8"))
      for (const entry of registry.capabilities ?? []) {
        if (entry.kind === "skill") {
          skills.push({
            id: entry.id,
            description: entry.description,
            path: entry.path,
            prerequisites: entry.prerequisites ?? [],
          })
        }
      }
    } catch {
      // A truncated or hand-edited registry must not silently describe an empty catalog.
      skills = []
    }
  }

  // A missing, unreadable, or empty registry falls back to the payload's own frontmatter, so a
  // plain clone is still describable and a stale registry can never hide real skills.
  if (skills.length === 0) skills = skillsFromFrontmatter(payloadRoot)

  skills.sort((a, b) => a.id.localeCompare(b.id))

  const commands = portableFiles(payloadRoot)
    .filter((p) => p.startsWith("command/") && p.endsWith(".md"))
    .map((p) => p.slice("command/".length, -".md".length))
    .sort()

  const contract = describeContract()
  return {
    schema_version: 1,
    name: "overgeared-skills",
    kind: "agent-orchestration-layer",
    generated_from: "repository payload frontmatter",
    core: contract.core,
    adapter: contract.adapter,
    skill_format: contract.skillFormat,
    command_format: contract.commandFormat,
    required_host_capabilities: contract.requiredHostCapabilities,
    optional_host_capabilities: contract.optionalHostCapabilities,
    harness_targets: contract.harnessTargets,
    capabilities: { kind: "skill", count: skills.length, list: skills },
    commands: { kind: "command", count: commands.length, list: commands },
  }
}

function renderIntegrationGuide(manifest) {
  const targets = manifest.harness_targets
    .map((target) => {
      const layout = Object.entries(target.layout)
        .map(([key, value]) => `  - ${key}: \`${value}\``)
        .join("\n")
      const required = target.adapter.required.length
        ? target.adapter.required.map((r) => `  - ${r}`).join("\n")
        : "  - none"
      return [
        `### ${target.id}`,
        "",
        `Config root: \`${target.configRoot}\``,
        "",
        "Layout:",
        layout,
        "",
        "Adapter (OpenCode-specific) requirements:",
        required,
        target.adapter.note ? `\n${target.adapter.note}` : "",
        "",
      ].join("\n")
    })
    .join("\n")

  return `# Overgeared Skills Integration

Portable core. \`${manifest.capabilities.count}\` skills and \`${manifest.commands.count}\` commands, plain Markdown.

## Skill format

- One directory per skill, containing \`${manifest.skill_format.filename}\`.
- Frontmatter: \`${manifest.skill_format.frontmatter.join("`, `")}\`.
- ${manifest.skill_format.descriptionRule}.
- ${manifest.skill_format.bodyRule}.

## Host capabilities required

${manifest.required_host_capabilities.map((c) => `- \`${c.id}\` — ${c.reason}`).join("\n")}

Optional: ${manifest.optional_host_capabilities.map((c) => `\`${c.id}\``).join(", ")}.

## Install targets

${targets}
## Reading the capabilities

\`capabilities.json\` lists every skill with its description, path, and prerequisites, so a
host can decide what to surface without executing Overgeared Skills scripts.
`
}

/**
 * Writes the portable core plus generated metadata into `exportDir`. Returns what was written.
 * Refuses to write outside the given directory and never deletes anything in the destination.
 */
export function exportPortable({ payloadRoot, exportDir }) {
  if (!payloadRoot || !exportDir) throw new Error("payloadRoot and exportDir are required")
  if (!existsSync(payloadRoot)) throw new Error(`payload root does not exist: ${payloadRoot}`)

  const manifest = buildCapabilityManifest(payloadRoot)
  const copied = []

  for (const relative of portableFiles(payloadRoot)) {
    const target = join(exportDir, relative)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(payloadRoot, relative), target)
    copied.push(relative)
  }

  mkdirSync(exportDir, { recursive: true })
  writeFileSync(join(exportDir, "capabilities.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8")
  writeFileSync(join(exportDir, "INTEGRATION.md"), renderIntegrationGuide(manifest), "utf-8")

  return {
    exportDir,
    coreFiles: copied,
    skills: manifest.capabilities.count,
    commands: manifest.commands.count,
    metadata: ["capabilities.json", "INTEGRATION.md"],
  }
}