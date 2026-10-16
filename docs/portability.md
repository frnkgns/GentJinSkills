# Portability

GENTJIN's instructions are plain Markdown. The runtime and tooling around them are not, so this
document defines exactly where that line sits, and how a harness that is not OpenCode installs the
portable half.

## Core and adapter

```text
PORTABLE CORE                    OPENCODE ADAPTER
AGENTS.md                        src/
command/*.md                     registry/
skills/*/SKILL.md                plugins/
                                 evals/
                                 scripts/
                                 docs/
                                 test/
                                 schemas/
                                 guardrails/
                                 package.json
```

The core is instructions: rules, skills, and commands. The adapter is enforcement, generation,
tests, and OpenCode-shaped configuration. A foreign harness installs the core and skips the adapter
without losing any behavior, because no skill depends on the adapter to be understood.

The authoritative classification is `src/portability/contract.mjs`, not this document. `isPortableCore`
and `isAdapter` are mutually exclusive and cover every payload file.

## Skill format

The shared contract, and what GENTJIN already writes:

```text
skills/<name>/SKILL.md
```

with YAML frontmatter carrying exactly two fields:

```yaml
---
name: <must equal the directory name>
description: What the skill does, and when it materially helps.
---
```

The body is Markdown instructions with no harness-specific syntax. Commands follow the same shape:
`command/<name>.md` with a `description` in frontmatter.

This is the format most agent harnesses already read, so a foreign harness maps one file to one
skill with no conversion step.

## Host capabilities

Required, or the core cannot function:

| Capability | Why |
| --- | --- |
| `file-read` | Skills inspect source before acting. |
| `file-write` | Skills edit files in the working project. |
| `shell` | Verification runs the project's real commands. |

Optional, and improving the experience:

| Capability | Why |
| --- | --- |
| `network` | Documentation lookups and dependency audits. |
| `obsidian-compatible-vault` | Opening Knowledge Vault notes. |
| `git` | Branch-aware review and change descriptions. |

## Install targets

| Harness | Config root | Instructions | Commands | Skills | Adapter required |
| --- | --- | --- | --- | --- | --- |
| `opencode` | `<user-home>/.config/opencode` | `AGENTS.md` | `command/` | `skills/` | KnowledgeVault permission in `opencode.jsonc` |
| `agent-skills` | `<harness-config-root>` | harness-specific | optional | `skills/` | none |
| `generic-markdown` | any writable directory | `AGENTS.md` | `command/` | `skills/` | none |

A host with no entry still installs the core. It only loses OpenCode-specific wiring.

## Export

```bash
npm run export:portable            # writes ./.gentjin-portable/
node scripts/export-portable.mjs <dir>
```

The export produces:

```text
.gentjin-portable/
├── AGENTS.md
├── command/
├── skills/
├── capabilities.json      # machine-readable catalog for the host
└── INTEGRATION.md         # generated per-harness steps
```

`capabilities.json` lists every skill and command with its description, path, and prerequisites,
along with the contract and host capabilities. A host can therefore decide what to surface without
executing any of GENTJIN's own tooling.

The export never deletes anything in its destination and refuses to write into a non-empty directory
without `--force`. It writes only core files, so adapter code cannot leak into a foreign install.

## Verifying a payload is portable

`test/portability.test.mjs` asserts that the core and adapter never overlap, that every shipped skill
already satisfies the frontmatter contract, that the manifest describes only real files, and that an
export contains no adapter paths.

```bash
node --test test/portability.test.mjs
```