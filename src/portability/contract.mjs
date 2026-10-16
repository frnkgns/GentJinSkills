/**
 * Portability contract.
 *
 * GENTJIN's payload is portable Markdown. This module is the single place that decides
 * which files belong to the portable core and which belong to an OpenCode adapter, so a
 * harness that is not OpenCode can take the core and skip the adapter without reading prose
 * to work out the difference.
 */

/** Directories and files any harness can consume as-is. */
export const PORTABLE_CORE_DIRECTORIES = ["command", "skills"]

export const PORTABLE_CORE_FILES = ["AGENTS.md"]

/**
 * Runtime and tooling that a foreign harness may skip. These are not instructions; they are
 * the enforcement, registry, and OpenCode-shaped parts of the tree.
 */
export const ADAPTER_DIRECTORIES = [
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

export const ADAPTER_FILES = ["package.json"]

/**
 * The neutral skill contract. This is the format GENTJIN already writes and the format most
 * agent harnesses read, so a foreign harness maps one file to one skill with no conversion.
 */
export const SKILL_FORMAT = {
  container: "one directory per skill",
  filename: "SKILL.md",
  frontmatter: ["name", "description"],
  requiredFrontmatter: ["name", "description"],
  descriptionRule:
    "name must equal the directory name; description must state what the skill does and when it materially helps",
  bodyRule: "Markdown body holds the workflow; no harness-specific syntax",
}

export const COMMAND_FORMAT = {
  filename: "<command-name>.md",
  frontmatter: ["description"],
  bodyRule: "Markdown body holds the workflow; no harness-specific syntax",
}

/** Capabilities a host must provide for the core to run. */
export const REQUIRED_HOST_CAPABILITIES = [
  { id: "file-read", reason: "skills inspect source before acting" },
  { id: "file-write", reason: "skills edit files in the working project" },
  { id: "shell", reason: "verification steps run the project's real commands" },
]

/** Capabilities that improve the experience but are not required for the core. */
export const OPTIONAL_HOST_CAPABILITIES = [
  { id: "network", reason: "documentation lookups and dependency audits" },
  { id: "obsidian-compatible-vault", reason: "opening Knowledge Vault notes" },
  { id: "git", reason: "branch-aware review and change descriptions" },
]

/**
 * Per-harness install targets, keyed by where each host looks for instructions, commands, and
 * skills. A host with no entry still installs the portable core; it only loses the wiring.
 *
 * `sharedWithOpenCode` marks a layout OpenCode v2 already discovers on its own. OpenCode reads
 * `.claude/skills` and `.agents/skills` as compatibility paths, so writing those once serves
 * Claude Code and OpenCode from a single copy of the skills.
 */
export const HARNESS_TARGETS = [
  {
    id: "opencode",
    label: "OpenCode",
    configRoot: "<user-home>/.config/opencode",
    layout: {
      instructions: "AGENTS.md",
      commands: "command/",
      skills: "skills/",
    },
    adapter: {
      required: ["opencode.jsonc KnowledgeVault external_directory permission"],
      optional: ["tui.json keybinds", "obsidian:// note links"],
    },
  },
  {
    id: "opencode-project",
    label: "OpenCode, project-local",
    configRoot: "<repository-root>/.opencode",
    layout: { commands: "command/", skills: "skills/" },
    adapter: {
      required: [],
      optional: ["plugins/, to dogfood a project-local plugin"],
      note:
        "Makes the clone self-contained: a fresh checkout works without a global install. The root-level AGENTS.md and skills/ already apply, so nothing else is generated here.",
    },
  },
  {
    id: "claude-code",
    label: "Claude Code",
    configRoot: "<repository-root>",
    layout: {
      instructions: "CLAUDE.md",
      commands: "command/",
      skills: "skills/",
    },
    adapter: {
      required: [],
      optional: ["~/.claude/settings.json permissions"],
      note: "Project-level CLAUDE.md imports AGENTS.md, so the rules are never duplicated",
    },
  },
  {
    id: "claude-skills",
    label: "Claude Code and OpenCode, shared skills",
    configRoot: "<repository-root>/.claude",
    layout: { skills: "skills/" },
    sharedWithOpenCode: true,
    adapter: {
      required: [],
      optional: [],
      note:
        "OpenCode v2 discovers .claude/skills as a compatibility path, so this one copy serves both hosts",
    },
  },
  {
    id: "codex",
    label: "Codex",
    configRoot: "<repository-root>",
    layout: { instructions: "AGENTS.md" },
    adapter: {
      required: [],
      optional: [],
      note: "Codex reads AGENTS.md; it has no command or skill directory convention",
    },
  },
  {
    id: "agents-md",
    label: "Any host that reads AGENTS.md",
    configRoot: "<repository-root>",
    layout: { instructions: "AGENTS.md" },
    adapter: { required: [], optional: ["commands/, if the harness supports command files"] },
  },
  {
    id: "cursor",
    label: "Cursor",
    configRoot: "<repository-root>/.cursor",
    layout: { instructions: "rules/gentjin.mdc", commands: "commands/" },
    adapter: {
      required: ["description and alwaysApply frontmatter on the rules file"],
      optional: [],
    },
  },
  {
    id: "windsurf",
    label: "Windsurf",
    configRoot: "<repository-root>/.windsurf",
    layout: { instructions: "rules/gentjin.md", commands: "workflows/", skills: "skills/" },
    adapter: {
      required: ["activation: always on the rules file"],
      optional: [],
    },
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    configRoot: "<repository-root>/.gemini",
    layout: { instructions: "GEMINI.md", commands: "commands/", skills: "skills/" },
    adapter: { required: [], optional: [] },
  },
  {
    id: "github-copilot",
    label: "GitHub Copilot",
    configRoot: "<repository-root>/.github",
    layout: { instructions: "copilot-instructions.md" },
    adapter: { required: [], optional: ["prompts/, if custom prompts are wanted"] },
  },
  {
    id: "cline",
    label: "Cline and Roo Code",
    configRoot: "<repository-root>",
    layout: { instructions: ".clinerules/gentjin.md" },
    adapter: { required: [], optional: ["workflows/, if the host supports them"] },
  },
  {
    id: "aider",
    label: "Aider",
    configRoot: "<repository-root>",
    layout: { instructions: "CONVENTIONS.md" },
    adapter: { required: [], optional: [] },
  },
  {
    id: "agent-skills",
    configRoot: "<harness-config-root>",
    layout: {
      skills: "skills/",
    },
    adapter: {
      required: [],
      optional: ["commands/, if the harness supports command files"],
      note: "SKILL.md with name+description frontmatter is the shared contract; commands are optional",
    },
  },
  {
    id: "generic-markdown",
    configRoot: "<any writable directory>",
    layout: {
      instructions: "AGENTS.md",
      commands: "command/",
      skills: "skills/",
    },
    adapter: {
      required: [],
      optional: [],
      note: "Concatenate or mount the files per the host's own conventions",
    },
  },
]

/** Returns true when a payload-relative path belongs to the portable core. */
export function isPortableCore(relativePath) {
  const path = String(relativePath).replace(/\\/g, "/")
  const head = path.split("/")[0]
  if (PORTABLE_CORE_FILES.includes(path)) return true
  return PORTABLE_CORE_DIRECTORIES.includes(head)
}

/** Returns true when a payload-relative path belongs to the OpenCode adapter. */
export function isAdapter(relativePath) {
  const path = String(relativePath).replace(/\\/g, "/")
  const head = path.split("/")[0]
  if (ADAPTER_FILES.includes(path)) return true
  return ADAPTER_DIRECTORIES.includes(head)
}

export function describeContract() {
  return {
    core: { directories: PORTABLE_CORE_DIRECTORIES, files: PORTABLE_CORE_FILES },
    adapter: { directories: ADAPTER_DIRECTORIES, files: ADAPTER_FILES },
    skillFormat: SKILL_FORMAT,
    commandFormat: COMMAND_FORMAT,
    requiredHostCapabilities: REQUIRED_HOST_CAPABILITIES,
    optionalHostCapabilities: OPTIONAL_HOST_CAPABILITIES,
    harnessTargets: HARNESS_TARGETS,
  }
}