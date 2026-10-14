---
description: Install GENTJIN directly into OpenCode's native runtime directories, with metadata-only tracking, guarded vault migration, and verification.
---

Perform a first-time installation of GENTJIN by following `INSTALL.md` in the current repository.

Resolve the source repository, `<opencode-root>` (`<user-home>/.config/opencode`), and `<metadata-root>` (`<opencode-root>/.gentjin`) exactly as the runbook specifies, then execute every step in order: preflight, keep-no-copies, install runtime files directly, remove stale GENTJIN-owned files, guarded legacy Knowledge Vault migration, additive global permission, verification, metadata written last, and retirement of any legacy `<opencode-root>/GentJin/` directory.

GENTJIN installs its complete payload. Copy every path below:

```text
<source-root>/AGENTS.md     -> <opencode-root>/AGENTS.md
<source-root>/tsconfig.json -> <opencode-root>/tsconfig.json
<source-root>/command/**    -> <opencode-root>/command/**
<source-root>/skills/**     -> <opencode-root>/skills/**
<source-root>/schemas/**    -> <opencode-root>/schemas/**
<source-root>/registry/**   -> <opencode-root>/registry/**
<source-root>/src/**        -> <opencode-root>/src/**
<source-root>/plugins/**    -> <opencode-root>/plugins/**
<source-root>/evals/**      -> <opencode-root>/evals/**
<source-root>/scripts/**    -> <opencode-root>/scripts/**
<source-root>/guardrails/** -> <opencode-root>/guardrails/**
<source-root>/docs/**       -> <opencode-root>/docs/**
<source-root>/test/**       -> <opencode-root>/test/**
```

Installation metadata is the only thing kept under `<opencode-root>/.gentjin/`. Never copy `<source-root>/package.json` over `<opencode-root>/package.json`; that file belongs to the runtime and carries the user's installed plugin dependencies. Never create `<opencode-root>/GentJin/` and never retain a full GENTJIN source copy inside the OpenCode configuration directory. Keep no backup or snapshot copies of anything. When the run finishes, only the runtime files, `<opencode-root>/.gentjin/`, and the user's own configuration should exist.

`plugins/` and `src/` are not optional. OpenCode discovers a global plugin from `<opencode-root>/plugins/`, and each plugin imports its supporting modules from `<opencode-root>/src/`. An installation that copies only `AGENTS.md`, `command/`, and `skills/` leaves every runtime tool, hook, and gate unregistered, so GENTJIN reports itself installed while nothing it describes as enforced is running. Verify these two directories explicitly in step 3.

If a GENTJIN installation already exists, use `/update-gentjin` instead of restarting the architecture.

Print the runbook's final summary, including the OpenCode root, metadata root, installed skill and command counts, legacy migration state, vault state, permission state, and skipped conflicts, then remind the user to restart OpenCode. Tell the user that the cloned repository can be deleted after a successful installation.

## Confirm Activation

Installation writes files; it does not teach the running session. OpenCode reads `AGENTS.md` in full at startup, reads only the `name` and `description` of each skill, and loads no command at all until the user invokes it. So a successful install is not an active install until OpenCode restarts.

After the user restarts, verify the installation actually took effect before claiming it is live:

1. Confirm the expected commands appear in the `/` list, including `/install-gentjin` and `/update-gentjin`.
2. Confirm the expected skill count is present in the available skills list, with every `name` and `description` intact.
3. Confirm the global `AGENTS.md` rules are loaded — the tell is that the capture rules and report format are already in effect without being re-read.
4. Confirm `<opencode-root>/plugins/` and `<opencode-root>/src/` exist and are non-empty, and that the server log records no `failed to load plugin` line for a GENTJIN plugin. A missing `plugins/` directory means the runtime layer was never installed, no matter what the filesystem check for skills and commands showed.
5. If a command, skill, or plugin is missing, name the specific file and directory that is short. Do not report success from the filesystem alone.

When the user asks whether GENTJIN is installed, updated, or active, run this check rather than inferring it from the repository. Use `/learn-skills` when they want the full skill contents in context rather than only the descriptions.
