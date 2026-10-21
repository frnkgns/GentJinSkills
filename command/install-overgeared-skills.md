---
description: Install Overgeared Skills directly into OpenCode's native runtime directories, with metadata-only tracking, guarded vault migration, and verification.
---

Perform a first-time installation of Overgeared Skills by following `INSTALL.md` in the current repository.

Resolve the source repository, `<opencode-root>` (`<user-home>/.config/opencode`), and `<metadata-root>` (`<opencode-root>/.overgeared-skills`) exactly as the runbook specifies, then execute every step in order: preflight, keep-no-copies, install runtime files directly, remove stale Overgeared Skills-owned files, guarded legacy Knowledge Vault migration, additive global permission, verification, metadata written last, and retirement of any legacy `<opencode-root>/GentJin/` directory.

Overgeared Skills installs into `<opencode-root>/AGENTS.md`, `<opencode-root>/command/`, and `<opencode-root>/skills/`. It keeps only installation metadata under `<opencode-root>/.overgeared-skills/`. Never create `<opencode-root>/GentJin/` and never retain a full Overgeared Skills source copy inside the OpenCode configuration directory. Keep no backup or snapshot copies of anything. When the run finishes, only the runtime files, `<opencode-root>/.overgeared-skills/`, and the user's own configuration should exist.

If an Overgeared Skills installation already exists, use `/update-overgeared-skills` instead of restarting the architecture.

Print the runbook's final summary, including the OpenCode root, metadata root, installed skill and command counts, legacy migration state, vault state, permission state, and skipped conflicts, then remind the user to restart OpenCode. Tell the user that the cloned repository can be deleted after a successful installation.

## Confirm Activation

Installation writes files; it does not teach the running session. OpenCode reads `AGENTS.md` in full at startup, reads only the `name` and `description` of each skill, and loads no command at all until the user invokes it. So a successful install is not an active install until OpenCode restarts.

After the user restarts, verify the installation actually took effect before claiming it is live:

1. Confirm the expected commands appear in the `/` list, including `/install-overgeared-skills` and `/update-overgeared-skills`.
2. Confirm the expected skill count is present in the available skills list, with every `name` and `description` intact.
3. Confirm the global `AGENTS.md` rules are loaded — the tell is that the capture rules and report format are already in effect without being re-read.
4. If a command or skill is missing, name the specific file and directory that is short. Do not report success from the filesystem alone.

When the user asks whether Overgeared Skills is installed, updated, or active, run this check rather than inferring it from the repository. Use `/learn-skills` when they want the full skill contents in context rather than only the descriptions.
