---
description: Install, verify, or remove the Overgeared Skills git guardrail that blocks destructive git commands through the OpenCode tool.execute.before hook. Use when the user asks to add git safety guardrails, block dangerous git commands, verify the guardrail is active, or remove it.
---

Install the Overgeared Skills git guardrail. This is an explicitly invoked capability. Never install it as a side effect of ordinary coding work, and never install it without the user asking.

## What it blocks

| Rule | Command |
| --- | --- |
| `push` | `git push` including all variants |
| `push-force` | `git push --force`, `--force-with-lease`, `-f` |
| `reset-hard` | `git reset --hard` |
| `clean` | `git clean -f`, `-fd`, `-fx` |
| `branch-delete-force` | `git branch -D` |
| `checkout-dot` | `git checkout .` |
| `restore-dot` | `git restore .` |

Plain `git branch -d` is allowed. `git status`, `git diff`, `git log`, `git add`, `git commit`, and `git checkout <branch>` are allowed.

## Resolve paths

- Source: `<source-root>/guardrails/overgeared-skills-guardrails.js`
- Target: `<opencode-root>/plugins/overgeared-skills-guardrails.js`

where `<opencode-root>` is `<user-home>/.config/opencode` unless overridden.

## Install

1. Confirm the source file exists.
2. Confirm the target directory exists. Create `<opencode-root>/plugins/` only if the user asked for installation.
3. Copy the file. Report the exact source and target paths.
4. Tell the user the guardrail is active only after OpenCode restarts.

## Verify

After the user restarts OpenCode, confirm enforcement rather than inferring it from the filesystem:

1. Confirm the guardrail appears among loaded plugins.
2. Run a dry check and report the result: a harmless command such as `git status` must be allowed.
3. Confirm a blocked command is refused. Do not actually execute a destructive command. Verify the rule set with the project's own tests instead:

```text
node --test test/guardrails.test.mjs
```

Report which rules matched. Never claim the guardrail works because the file is present.

## Per-session override

`OVERGEARED_SKILLS_ALLOW_GIT` accepts a comma-separated list of rule ids to permit for one session, for example `OVERGEARED_SKILLS_ALLOW_GIT=push`. It overrides only the named rules and nothing else.

Tell the user to prefer requesting explicit authorization over setting the variable.

## Remove

1. Delete `<opencode-root>/plugins/overgeared-skills-guardrails.js`.
2. Confirm it is gone.
3. Tell the user enforcement ends after OpenCode restarts.

## Boundaries

This guardrail blocks commands executed by the agent through OpenCode. It does not protect a human running Git in their own terminal, and it does not replace server-side branch protection.

Never install hook tooling into an unrelated project. Never change remote branch rules. Never commit or push as part of this setup.

## Report

State whether the guardrail was installed, verified, or removed; the exact file paths involved; the rules now active; the override mechanism; and that a restart is required.