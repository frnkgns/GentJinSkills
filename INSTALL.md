# Overgeared Skills Agent-Assisted Installation

Use this runbook when the user says:

```text
Install Overgeared Skills by following INSTALL.md
```

Perform the installation with OpenCode's available file tools and platform APIs.
Do not create or execute `install.ps1`, `install.sh`, or another traditional
installer script.

## Architecture

Overgeared Skills installs directly into OpenCode's native runtime directories. It never
keeps a second copy of itself inside the OpenCode configuration directory.

```text
<source-root>       Cloned or temporary Overgeared Skills source
<opencode-root>     <user-home>/.config/opencode
<metadata-root>     <opencode-root>/.overgeared-skills
```

Installation direction:

```text
<source-root>/AGENTS.md    -> <opencode-root>/AGENTS.md
<source-root>/command/**   -> <opencode-root>/command/**
<source-root>/skills/**    -> <opencode-root>/skills/**
<source-root>/schemas/**   -> <opencode-root>/schemas/**
<source-root>/src/**       -> <opencode-root>/src/**
<source-root>/plugins/** -> <opencode-root>/plugins/**
<source-root>/package.json -> <opencode-root>/package.json
<source-root>/registry/**  -> <opencode-root>/registry/**
<source-root>/plugins/**   -> <opencode-root>/plugins/**
<source-root>/evals/**     -> <opencode-root>/evals/**
<source-root>/scripts/**   -> <opencode-root>/scripts/**
<source-root>/guardrails/** -> <opencode-root>/guardrails/**  (inert source; only /setup-git-guardrails places it into plugins/)
<source-root>/docs/**      -> <opencode-root>/docs/**
<source-root>/test/**      -> <opencode-root>/test/**
installation metadata      -> <metadata-root>/manifest.json
                             <metadata-root>/version.json
```

`test/` ships as part of the payload so the executable checks can run from the
installation without the repository. `evals/` ships for the same reason. Neither
contains generated output; traces are written outside the installation.

Expected end state of an installation:

```text
<opencode-root>/
├── AGENTS.md
├── command/
├── skills/
├── schemas/
├── src/
├── registry/
├── plugins/
├── evals/
├── scripts/
├── docs/
├── test/
├── opencode.jsonc
└── .overgeared-skills/
    ├── manifest.json
    └── version.json
```

```md
Do not create or retain a full Overgeared Skills source copy inside the OpenCode config
directory.
```

`<opencode-root>/GentJin/` is retired. When it exists, migrate it as described in
step 9 and then remove it.

The repository is the source of truth. After installation the clone may be
deleted. `README.md` and `INSTALL.md` are reference documents that live in the
repository only; they are not installed.

## Resolve paths

Detect the current operating system at runtime. Resolve the current user's home
directory without using a username or a path from the cloned repository:

- Windows: use `$env:USERPROFILE`, or the platform user-profile API when it is
  unavailable.
- macOS/Linux: use `$HOME`, or the operating system's operating-system API when
  it is unavailable.
- If the home directory cannot be resolved confidently, stop and ask the user
  without changing files.

Resolve:

```text
<opencode-root> = <user-home>/.config/opencode
<metadata-root> = <opencode-root>/.overgeared-skills
```

Use the platform's native path separator. If `OPENCODE_CONFIG` or another
setting points to a nonstandard configuration, report it and ask before using
that location. Never install into a project-local configuration by accident.

If any destination exists as a file instead of a directory, stop and report the
conflict.

## Resolve the source

Prefer an existing Overgeared Skills checkout:

1. The current working directory, when it is an Overgeared Skills source.
2. The nearest ancestor directory containing `AGENTS.md`, `command/`, and
   `skills/`.
3. An Overgeared Skills checkout the user names.

If none is available, create a temporary shallow checkout of the branch recorded
in `<metadata-root>/manifest.json`, or the default branch when no metadata
exists, inside a temporary directory. Remove that temporary checkout when the run
finishes. Never keep it, and never place it inside `<opencode-root>`.

Stop if the source is ambiguous or incomplete.

The installable payload is:

```text
AGENTS.md
command/
skills/
```

Preserve relative paths and additional files inside `command/` or `skills/`. Do
not install `.git/`, `node_modules/`, package metadata, temporary files,
credentials, `.env` files, generated caches, `README.md`, or `INSTALL.md`.

Never copy the source `opencode.jsonc` into the destination. It is user
configuration, not an Overgeared Skills payload. Preserve all providers, plugins, settings,
permissions, MCP configuration, authentication data, and unrelated files in the
user's global `opencode.jsonc`, except for the additive permission change defined
below.

## Add the required global permission

Overgeared Skills needs one explicit OpenCode permission so it can read and write the
Knowledge Vault outside the active project:

```jsonc
{
  "permission": {
    "external_directory": {
      "~/Documents/KnowledgeVault/**": "allow"
    }
  }
}
```

Apply this rule only to `<opencode-root>/opencode.jsonc`:

- If `~/Documents/KnowledgeVault/**` already maps to `allow`, keep the file
  unchanged.
- If the path is missing and `permission.external_directory` already exists as
  an object, append the rule without changing any existing entry, pattern, or
  order.
- If `permission` or `permission.external_directory` is missing, add only the
  required structure around the existing configuration.
- If the path exists with a different action, or the addition would require
  replacing, removing, reordering, or weakening any existing entry, stop and
  ask the user for explicit approval in one concise request.
- Never delete, disable, replace, reorder, or downgrade existing configuration
  without explicit user approval. Never copy the source `opencode.jsonc` over
  the global file.
- If the global file is missing, stop and ask before creating it.
- Read only the structure needed for this merge. Never print, copy, log, or
  record secrets, tokens, credentials, or unrelated configuration values.
- Do not add `opencode.jsonc` to the manifest; it remains user-owned. Record any
  Overgeared Skills-required configuration state in `<metadata-root>/manifest.json` if it is
  needed for a later update or uninstall.

The addition must be idempotent. A repeated install or update must not create
duplicate rules, reformat unrelated content, or rewrite the file when the
permission already exists.

## Use the metadata for ownership

`<metadata-root>/manifest.json` is the Overgeared Skills ownership record. Create or
update it after each successful installation or update. `<metadata-root>` holds
metadata only; it must never contain `AGENTS.md`, `command/`, `skills/`,
`README.md`, `INSTALL.md`, or any source checkout.

Recommended shape:

```json
{
  "formatVersion": 1,
  "repository": "https://github.com/<owner>/<repo>",
  "branch": "<branch>",
  "installedCommit": "<commit>",
  "installedAt": "<timestamp>",
  "updatedAt": "<timestamp>",
  "managedFiles": [
    { "path": "AGENTS.md", "sha256": "<hash>" }
  ]
}
```

`<metadata-root>/version.json` records the installed version:

```json
{
  "version": "<version or commit>",
  "branch": "<branch>",
  "installedAt": "<timestamp>"
}
```

`managedFiles` uses paths relative to `<opencode-root>` with forward slashes. Do
not record credentials, repository-owner paths, machine names, usernames, or
absolute user-profile paths. Refer to machine-specific locations with
placeholders such as `<user-name>`, `<user-home>`, `<opencode-root>`, and
`<project-root>`, or with `~/`. The user's own `opencode.jsonc` is never copied,
so any real path inside it stays only in the user's file.

Do not remove useful existing ownership or hashing safeguards when adopting this
shape.

Ownership rules:

- A file listed in `managedFiles` is Overgeared Skills-owned.
- A file under `command/` or `skills/` that is not listed is user-owned or
  third-party. Never modify or delete it.
- `AGENTS.md` is Overgeared Skills-managed when the manifest records it. When Overgeared Skills owns
  the whole file, update it directly. When it merges into a user-authored file,
  preserve the existing merge boundaries or markers and update only the
  Overgeared Skills-owned section. Never create `.overgeared-skills/AGENTS.md` or
  `GentJin/AGENTS.md`; the active runtime file is always
  `<opencode-root>/AGENTS.md`.
- A file recorded as managed in a previous manifest but absent from the current
  payload is a stale Overgeared Skills-owned file. Remove it only after the rules below
  allow it, and never remove a similarly named file that the manifest does not
  claim.

Classify every destination file with this table:

| Destination state | Action |
| --- | --- |
| Missing expected Overgeared Skills file | Install automatically; no prompt |
| Manifest-managed and hash matches the recorded hash | Update automatically; no prompt |
| Manifest-managed and hash differs | Treat as locally modified; ask before replacing |
| Previously managed, no longer in the payload | Stale Overgeared Skills-owned file; remove when the table above allows |
| Existing but not manifest-managed and byte-identical to source | Adopt as managed; no prompt |
| Existing but not manifest-managed and different | Treat as user-owned or ambiguous; ask before replacing |
| Invalid metadata, unreadable file, or file/directory type mismatch | Stop that path and ask |

Batch all required confirmations into one concise request. Never prompt for
missing files or unchanged manifest-managed files during a normal install or
update.

## Install safely

### 1. Preflight

Before writing anything:

1. Resolve `<source-root>`, `<opencode-root>`, and `<metadata-root>`.
2. Read `<metadata-root>/manifest.json` and `version.json` if present.
3. Detect a legacy installation at `<opencode-root>/GentJin/`.
4. Enumerate the source payload directly.
5. Compare source files directly with their runtime destinations.
6. Inspect only the minimum structure of `<opencode-root>/opencode.jsonc` needed
   to determine whether the required permission is present, conflicting, or
   missing.
7. Detect whether `<user-home>/Documents/ObsidianVault/` exists and
   `<user-home>/Documents/KnowledgeVault/` is absent. Do not open, merge, or
   delete vault contents during detection.
8. Apply the classification table above.
9. Record unrelated existing files so they can be checked after installation.

Do not read or print credentials. Never print, copy, or log unrelated
configuration values; verify structure locally and report only the required
permission state.

### 2. Keep no copies

Do not create backup or snapshot directories. Do not copy any file before
replacing it. When the run finishes, the only things that exist are the runtime
files, `<metadata-root>`, and the user's own configuration.

Overgeared Skills payload files are always restorable from the source repository. For
`<opencode-root>/opencode.jsonc` and Obsidian's saved vault registry, rely on the
explicit approval step and the minimal targeted edit instead of a stored copy.
Verify the result after the change rather than keeping a copy beforehand.

This runbook keeps no backups. Any earlier instruction to preserve or relocate
backup storage is superseded.

### 3. Install runtime files directly

Copy the approved payload into OpenCode's native runtime paths:

```text
<source-root>/AGENTS.md    -> <opencode-root>/AGENTS.md
<source-root>/command/**   -> <opencode-root>/command/**
<source-root>/skills/**    -> <opencode-root>/skills/**
```

Install missing files automatically. Update unchanged manifest-managed files
automatically. Ask only for the unsafe cases in the classification table.

Preserve extra files in existing `command/` and `skills/` directories. Never
remove unrelated files, plugins, settings, or configuration. The global
`opencode.jsonc` is not part of the payload; change it only in step 6.

### 4. Remove stale Overgeared Skills-owned files

For each path recorded in a previous manifest that the current payload no longer
contains, remove it from the runtime only when it was manifest-managed with a
matching hash or the user approved the replacement. Never remove a file the
manifest does not claim, and never remove files outside the manifest.

### 5. Migrate the legacy Knowledge Vault path

When `<user-home>/Documents/ObsidianVault/` exists and
`<user-home>/Documents/KnowledgeVault/` does not, batch one explicit approval
request with the other install questions. Continue only after the user approves.

1. Verify the legacy path is a directory and the canonical path does not exist.
   If both paths exist, stop and ask. Never merge the two directories.
2. Verify Obsidian is closed. If it is running, stop and ask the user to close
   it before continuing so the application cannot rewrite its saved paths.
3. Record the vault entry count and confirm `.obsidian/` exists.
4. Rename only `<user-home>/Documents/ObsidianVault/` to
   `<user-home>/Documents/KnowledgeVault/`. Do not copy, merge, or delete vault
   content, and do not move individual notes.
5. With separate explicit approval, update only Obsidian's saved vault path.
   Never modify the Obsidian application installation or unrelated application
   folders.
6. Verify the canonical directory, the entry count, `.obsidian/`, and the saved
   Obsidian path after the rename.

If the user declines, leave the legacy path unchanged, record the migration as
`skipped`, and continue. Never retry a skipped migration automatically in the
same run.

### 6. Add the required global permission

After the runtime files are installed, update `<opencode-root>/opencode.jsonc`
only when the preflight check shows the required permission is missing and the
addition is safe under the rules above.

Use a minimal, targeted edit. Do not rewrite, reformat, or reserialize the whole
file. Do not add the file to the manifest. If the preflight check found a
conflict, stop and ask instead of editing.

### 7. Verify the installation

Verify every installed payload file against the source. At minimum, confirm:

```text
AGENTS.md
command/changes-review.md
command/cleanup.md
command/deployment-check.md
command/git-push.md
command/install-overgeared-skills.md
command/learn-skills.md
command/pause.md
command/project-review.md
command/report.md
command/setup-git-guardrails.md
command/resume.md
command/status.md
command/task.md
command/update-overgeared-skills.md
skills/api-design/SKILL.md
skills/architecture-review/SKILL.md
skills/backend-review/SKILL.md
skills/cleanup/SKILL.md
skills/compaction/SKILL.md
skills/database-review/SKILL.md
skills/dependency-review/SKILL.md
skills/deployment-readiness/SKILL.md
skills/frontend-review/SKILL.md
skills/git-workflow/SKILL.md
skills/incident-response/SKILL.md
skills/integration-review/SKILL.md
skills/knowledge-vault/SKILL.md
skills/performance-review/SKILL.md
skills/project-conventions/SKILL.md
skills/refactoring-migration/SKILL.md
skills/reporting/SKILL.md
skills/requirements-review/SKILL.md
skills/review-orchestrator/SKILL.md
skills/security-review/SKILL.md
skills/skill-authoring/SKILL.md
skills/systematic-debugging/SKILL.md
skills/test-strategy/SKILL.md
skills/work-in-progress/SKILL.md
schemas/task-record.schema.json
schemas/task-event.schema.json
src/schema/validate.mjs
src/task/record.mjs
src/task/completion-gate.mjs
src/routing/route.mjs
src/memory/failure-awareness.mjs
src/trace/writer.mjs
src/trace/ids.mjs
src/trace/plugin-body.mjs
src/trace/plugin-support.mjs
src/guardrails/git-guardrails.mjs
src/capabilities/registry.mjs
src/capabilities/resolve.mjs
src/capabilities/loader.mjs
src/capabilities/loader.d.mts
src/capabilities/adherence.mjs
registry/skills.json
registry/capabilities.json
plugins/overgeared-skills-trace.js
plugins/overgeared-skills-capabilities.ts
scripts/build-registry.mjs
scripts/build-capabilities.mjs
evals/run.mjs
evals/cases.mjs
evals/workflow-scenarios.mjs
evals/graders/index.mjs
evals/fixtures/unsafe-secrets.json
docs/architecture.md
docs/deferred.md
docs/integration-map.md
```

The payload is copied by directory, so new files are installed automatically.
Keep this list current: when a skill, command, or runtime file is added or
removed, update this minimum set in the same change so verification still
detects a missing install.

After copying, run the shipped executable checks from `<opencode-root>`:

```text
node --test "test/**/*.test.mjs"
node evals/run.mjs
```

Both must exit 0. If either fails, the install is incomplete; report the failing
test names rather than reporting success.

Also confirm:

- installed files match the source byte-for-byte;
- unrelated files recorded during preflight still exist;
- no unrelated skill, command, plugin, or configuration was removed;
- the source `opencode.jsonc` was not installed;
- the global `opencode.jsonc` contains the required permission, or was already
  correct and left unchanged;
- every pre-existing global configuration entry is still present, and nothing
  was removed, replaced, reordered, or downgraded;
- `opencode.jsonc` is not listed in the manifest;
- the legacy vault was renamed only when approved, and its entry count and
  `.obsidian/` metadata were preserved;
- Obsidian's saved path was updated only when approved, and the Obsidian
  application installation was not modified;
- no credentials or environment values were read, printed, or written;
- no temporary source checkout or staging file remains.

If verification fails, do not report success and do not remove a legacy
directory.

### 8. Write the metadata last

After the runtime files verify successfully, write
`<metadata-root>/manifest.json` and `<metadata-root>/version.json` with the final
hashes, managed paths, repository, branch, installed commit, and timestamps. The
metadata is finalized only after the runtime files have been verified. If
metadata creation fails, report the installation as incomplete.

When the source is a Git checkout, record the current commit. When it is a
temporary shallow checkout, record the resolved commit and the branch name.

### 9. Retire a legacy installation

Only after steps 1 through 8 succeed, and only when
`<opencode-root>/GentJin/` exists:

1. Inspect the legacy folder: its `install-manifest.json`, managed file
   ownership, hashes, and timestamps.
2. Confirm the active runtime already contains every required Overgeared Skills-managed
   file, and that each matches the verified source. If any runtime file is
   missing or stale, install it from the current source, verify it, and update
   the ownership metadata first.
3. Confirm no Overgeared Skills-managed runtime file is locally modified without the
   required approval, and that unrelated files under `command/` or `skills/` are
   untouched.
4. Preserve the required metadata. Ownership, hashes, and the installed commit
   are already in `<metadata-root>/manifest.json`; migrate anything still unique
   to the legacy manifest. Do not copy the duplicated payload into
   `<metadata-root>`.
5. Only then remove `<opencode-root>/GentJin/` completely.

Never recursively clean `<opencode-root>/skills/` or `<opencode-root>/command/`
beyond manifest-owned stale files. Never delete custom user skills,
third-party skills, custom commands, unrelated configuration, or unrelated
`AGENTS.md` content.

Report the legacy migration state as `retired` or `skipped`.

## Migration safety invariant

```md
Never delete the legacy `<opencode-root>/GentJin/` directory until the new
runtime state and metadata have both been successfully created and verified.
```

Deletion is the final migration step. If the run is interrupted before
verification, the legacy folder must still exist so the migration can be retried
safely, and the failure must be reported clearly.

## Keep the Knowledge Vault canonical

The `knowledge-vault` skill must resolve project knowledge from the current
user's home directory:

```text
<user-home>/Documents/KnowledgeVault/<project-identifier>/
```

Installation may rename the legacy `<user-home>/Documents/ObsidianVault/`
directory to that canonical location only when the legacy directory exists, the
canonical directory is absent, the user explicitly approves the rename, and
Obsidian is closed. Never merge directories, delete vault content, or modify the
Obsidian application installation. Update only Obsidian's saved vault path, and
only when explicitly approved.

Create or populate a project vault only when that project needs it and normal
permissions allow it. Granting the required OpenCode permission does not create,
move, migrate, or delete any vault.

## Future maintenance

`<metadata-root>/manifest.json` plus the repository source are sufficient for
later update, repair, and uninstall workflows. No permanent local copy of the
Overgeared Skills source is required or retained.

`/update-overgeared-skills` must be sufficient for normal updates: detect a legacy
installation, migrate metadata, reconcile runtime files, retire the legacy
folder, retrieve the current source, update only Overgeared Skills-owned files, remove
stale Overgeared Skills-owned files, preserve user-owned files, update
`<metadata-root>/manifest.json` and `version.json`, and verify the result.

Retrieve the current source from an existing Overgeared Skills checkout when one is
available, otherwise from a temporary shallow checkout that is removed when the
run finishes. Never require the user to keep a clone, and never recreate
`<opencode-root>/GentJin/`.

Re-run the additive global permission check on every update; the global
`opencode.jsonc` remains user-owned and is not represented in the manifest. The
vault migration is a one-time rename: after a successful migration, do not
attempt it again, and if both the legacy and canonical paths exist, stop and ask.
Do not implement maintenance workflows during an installation.

When testing this runbook, use a temporary source and a temporary OpenCode
configuration directory. Never test against the active user's global OpenCode
configuration.
