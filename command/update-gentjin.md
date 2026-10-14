---
description: Update the GENTJIN installation from the current repository using the ownership manifest, retiring any legacy install, with prompts for unsafe files and verification.
---

Update GENTJIN by following `INSTALL.md` in the current repository.

Use `<opencode-root>/.gentjin/manifest.json` as the ownership record. Update manifest-managed files whose recorded hash matches the installed hash, and ask before replacing any file that is locally modified, unmanaged, or ambiguous. Keep no backup or snapshot copies of anything. Preserve every file under `<opencode-root>/command/` and `<opencode-root>/skills/` that the manifest does not claim.

Run the full sequence:

1. Detect a legacy installation at `<opencode-root>/GentJin/`.
2. Retrieve the current GENTJIN source: prefer an existing GENTJIN checkout, otherwise use a temporary shallow checkout of the recorded branch and remove it when the run finishes. Never keep a permanent copy and never recreate `<opencode-root>/GentJin/`.
3. Reconcile the complete payload in `<opencode-root>/` - `AGENTS.md`, `tsconfig.json`, `command/`, `skills/`, `schemas/`, `registry/`, `src/`, `plugins/`, `evals/`, `scripts/`, `guardrails/`, `docs/`, and `test/` - updating only GENTJIN-owned files. `plugins/` and `src/` are load-bearing: OpenCode discovers a global plugin from `<opencode-root>/plugins/` and each plugin imports its supporting modules from `<opencode-root>/src/`. Updating only `AGENTS.md`, `command/`, and `skills/` leaves every runtime tool, hook, and gate unregistered.
4. Remove stale GENTJIN-owned files that the previous manifest recorded and the current payload no longer contains.
5. Re-run the additive global `opencode.jsonc` permission check and report whether it was `added` or `already present`. Skip the vault migration when `<user-home>/Documents/KnowledgeVault` already exists, and never merge vault directories.
6. Verify both the runtime files and the metadata.
7. Write `<opencode-root>/.gentjin/manifest.json` and `version.json` last.
8. Only after verification succeeds, migrate any remaining legacy metadata and remove `<opencode-root>/GentJin/` completely. If verification fails, leave it in place so the migration can be retried, and report the failure clearly.

This command must support both legacy installations and metadata-only installations. Report the installed skill and command counts, legacy migration state, vault state, permission state, and any skipped unsafe conflicts, then remind the user to restart OpenCode.

## Confirm Activation

An update writes files; it does not teach the running session. OpenCode reads `AGENTS.md` in full at startup, reads only the `name` and `description` of each skill, and loads no command at all until the user invokes it. So an updated install is not an active install until OpenCode restarts.

After the user restarts, verify the update actually took effect before claiming it is live:

1. Confirm the expected commands appear in the `/` list, including `/install-gentjin` and `/update-gentjin`.
2. Confirm the expected skill count is present in the available skills list, and that newly added skills appear while skills removed upstream are gone.
3. Confirm the global `AGENTS.md` rules are loaded — the tell is that the new capture, report, or pre-push rules are already in effect without being re-read.
4. Confirm `<opencode-root>/plugins/` and `<opencode-root>/src/` exist and are non-empty, and that the server log records no `failed to load plugin` line for a GENTJIN plugin. A missing or empty `plugins/` directory means the runtime layer is not installed, regardless of what the skill and command checks showed.
5. If a command, skill, or plugin is missing or stale, name the specific file and directory that disagrees with the manifest. Do not report success from the filesystem alone.

When the user asks whether GENTJIN is installed, updated, or active, run this check rather than inferring it from the repository. Use `/learn-skills` when they want the full skill contents in context rather than only the descriptions.
