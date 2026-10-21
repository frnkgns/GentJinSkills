---
description: Commit and push the current changes on a new branch, detecting the repository's branch naming format first, proposing a name, deriving the Jira backlog title, and asking for approval (with the option to type your own).
---

Run the guarded push workflow for the current repository's pending changes, following the `## GitHub Pushes` rule in the global instructions.

1. Inspect the current state first: `git status`, the relevant `git diff` (staged and unstaged), and recent commit style so the branch name and commit message match repository conventions.

2. Check the current branch. If it is `main`, `development`, `production`, or another protected/shared branch, do not push there directly; create a new branch first.

3. Detect the repository's branch naming format before naming anything. List the existing branches (`git branch -a` or `git for-each-ref`) and look for a pattern such as `GJ-01-<description>`, `ABC-123-<description>`, or `feature/<name>`. If the repository has its own format, follow it and derive the next name (for example, increment the next free number).

4. If the repository has no recognisable branch format, propose the default `<project-initials>-<zero-padded-increment>-<description>` using initials derived from the project name and a zero-padded sequence (for example Overgeared Skills → `OS-01-changes-in-here`, `OS-02-changes-in-here`). Increment beyond the highest existing number, if any.

5. Show the user the exact branch name you plan to create and ask for explicit approval before creating it, committing on it, or pushing. If the user does not want the proposed name, let them type their own preferred branch name and use that instead.

6. After approval, create the branch, stage only the files that belong to the logical change, and make one focused commit per logical unit. Never stage secrets, credentials, environment files, or generated artifacts. Before staging, run the Pre-Push Cleanup Gate below: any seed, test fixture, or QA scaffolding that was created only to exercise the change must be removed or converted into a real test before it is staged. Nothing meant only for automatic QA may be pushed.

7. Prepare the commit subject and the concise numbered body from the final logical change, and check both against the Change Description Contract below. Fix anything verbose before it becomes history. Write a multiline message through a temporary file outside the repository and commit with `git commit -F`, never an inline shell string. Then confirm what was actually recorded with `git show -s --format=%B HEAD`.

8. Push with upstream tracking (`git push -u origin <branch>`).

9. Report, in this order and clearly separated: the branch name, the derived Jira backlog title, the commit reference, the cleanup result, the verification result, a pull-request link when the remote provides one, and the required `Notes`. After that, print the ready-to-paste PR title and concise numbered body in its own block, outside the report.

10. After the report, decide the release-notes offer with `decideOffer` in `src/release/offer.mjs` so the skip conditions are verifiable rather than improvised, then act on it: offer exactly one short question, run the workflow, or offer nothing.

    - Offer nothing when the push did not succeed.
    - Offer nothing when there are no eligible changes, so no empty release is proposed.
    - Honour an already explicit request without asking again.
    - Do not ask again after a decline for the same push. A later successful push may offer again.

    The offer text is exactly: “Would you like paste-ready release notes for the changes since the previous release?” Preparing notes never changes the completed push, creates a pull request, or modifies remote releases or tags; run `/release-notes` for the full workflow.

Push authorization is not PR authorization. Creating or updating a pull request requires separate authorization; see Manual Pull Request Behavior below.

## Pre-Push Cleanup Gate

This is a non-negotiable rule. On every push, inspect `git status` for staged, unstaged, and untracked files, inspect the complete diff, and compare it against the active WIP's Temporary Artifact Ledger. Anything created solely to support automatic QA of the change — QA, TEST, DEBUG, SEEDING, mocks, fixtures, temporary local verification, or development investigation — must not be pushed unless the user explicitly requires it as permanent.

Watch for:

- Seed files and seed scripts (for example `seed.*`, `seeds/`, `*.seed.*`, database reset scripts) created to populate local test data.
- Temporary test scaffolding created to exercise the change by hand and then forgotten: throwaway fixtures, sample payloads, scratch test routes, and one-off scripts.
- Mock or stub data, fixtures, or fake services added only for local QA of the change.
- Ad-hoc verification scripts that were not added to the project's real test suite or documented as tests.
- Large generated artifacts, snapshot dumps, or output files produced while testing.

Inside modified production files, also look for temporary development code introduced only for this task: `console.log`/`console.debug`, temporary print statements, temporary debug panels, hardcoded IDs or users, temporary mock responses, bypassed authentication or authorization, disabled validation, temporary feature flags, forced success responses, temporary routes, commented-out replacement logic, TODO/FIXME notes added only for the session, local-only URLs or localhost overrides, temporary database values, temporary API keys or tokens, artificial delays, debug UI labels, test buttons, manually injected QA data.

Decision rule for each match: did this exist before the current task, and was it created solely to help QA, TEST, DEBUG, SEED, mock, or investigate? If yes, remove it or revert it before staging. If it is part of the project's permanent test or seed infrastructure, keep it and say so explicitly. Never delete pre-existing permanent tests, tracked fixtures, required migrations, or application seed infrastructure just because the filename contains `test`, `seed`, or `debug`. When unsure, ask the user rather than guessing.

Cleanup procedure, in order:

1. Inspect `git status` and the full diff.
2. Compare the diff against the WIP Temporary Artifact Ledger.
3. Remove task-created temporary artifacts from the working tree and untrack them.
4. Revert temporary modifications made only for testing or debugging inside production files.
5. Run the appropriate build, typecheck, lint, and verification AFTER cleanup, not before.
6. Re-inspect `git status` and the final diff to confirm nothing temporary remains and no permanent behavior was altered by the cleanup.
7. Update the change audit's Temporary Development Artifacts and Cleanup Result sections with what was removed.
8. If cleanup changed production behavior or verification now fails, STOP. Do not push. Investigate first.

Report what was removed, what was retained and why, the verification result after cleanup, and the change audit path. Do not silently remove files.

This gate never grades on a filename pattern alone. It is task-aware and provenance-aware.

## Derive the Jira Backlog Title

Once the branch name is approved, derive the Jira backlog title from it so the ticket can be created or linked without retyping.

Rule:

1. Match the branch against `^[A-Z]+-\d+-(.+)$`. The part after the number is the description.
2. Split the description on `-`.
3. For each word: if it is two characters or fewer, uppercase it; otherwise capitalize the first letter and lowercase the rest.
4. Join the words with single spaces.

Example:

```text
GX-33-be-fix-sales-journey-medicare-admission-count
  → BE Fix Sales Journey Medicare Admission Count
```

If the branch does not match the pattern, say so and do not invent a title. Never derive a title from a protected branch name such as `main` or `development`.

Show the derived title in the report and ask the user to confirm or correct it before it is used anywhere.

## Change Description Contract

This single contract governs three outputs. Do not invent a separate style for any of them:

1. The body of a commit made by this workflow.
2. A proposed or explicitly authorized PR description.
3. The ready-to-paste description supplied when the user will create the PR by hand.

Format:

```text
<One short sentence summarizing the change, if useful.>

1. <Concrete change and observable outcome.>
2. <Another distinct change.>
3. <Another distinct change.>
```

Rules:

- Use a numbered list, 3–10 items for a substantial change. Use fewer when only one or two meaningful changes exist. Never invent filler to reach a count.
- One outcome per item, usually one sentence. Aim for roughly 15–30 words rather than a rigid truncation limit.
- Use everyday language, naming the affected feature, page, or skill when useful. Readers of Overgeared Skills are developers, so meaningful developer-facing improvements count.
- Group related internal edits by their outcome.
- Exclude file paths, symbol names, loader mechanics, stack traces, investigation narratives, and test inventories by default.
- Avoid sections such as Root Cause, Implementation, Testing, Notes, or Documentation in the default body.
- Include a short material limitation when omitting it would mislead. Never hide genuine unresolved risk for brevity, and never claim tests, installation, or live behavior passed without observed evidence.
- Derive the items from the final branch diff plus the relevant task and audit evidence, not from the most recent commit or memory.
- A detailed description remains available when the user explicitly requests one or repository policy mandates it. Otherwise this concise format wins.

The detailed technical record lives in the durable change audit and the vault, not in the commit or PR body.

### Prepare and validate before committing

Before committing, prepare the subject and the concise numbered body, then check it against this contract. Fix verbose output while it is still a draft, not after it is already history.

Write a multiline message through a message file rather than inline shell text so real newlines survive and nothing is interpolated:

```text
write the subject and body to a temporary file outside the repository
git commit -F <that file>
remove the file
```

Never embed a multiline commit message in a shell string.

Keep separate logical commits separate. Do not squash or rewrite history to influence what GitHub prefills.

Before a requested push, inspect what was actually written:

```text
git show -s --format=%B HEAD
```

If the body is verbose, say so and offer a corrected commit or a concise PR body. Never silently amend or rewrite an existing shared commit.

## Manual Pull Request Behavior

A push does not create or update a pull request. Push authorization is not PR authorization, and never create a PR as a side effect of a push.

After preparing or pushing a branch, print a clearly separated, ready-to-paste block containing:

1. The PR title.
2. The concise numbered body.

Keep it visually separate from the console report. The console report keeps the branch name, commit reference, test results, cleanup detail, and the required `Notes` section outside the copyable block, so the reader never copies audit output into the PR by accident.

GitHub suggests a PR title and body from the commit subject and body when the comparison contains a single commit. With multiple commits, a template, or another prefill source, do not promise that the prepared text will appear automatically. Give the user the exact text to paste or to replace the suggestion.

When the user separately authorizes PR creation or an update, pass the prepared description explicitly:

- With `gh`, write the body to a file and pass `--body-file`, never an inline interpolated string.
- Never substitute the detailed console report or the vault audit as the PR body.

### What the format checks do and do not prove

The change-description evaluator is deterministic. It inspects produced text and confirms the shape of the output: that a numbered list is present, that no file paths, test inventories, or audit sections leaked in, and that a long paragraph did not follow the list.

It does not observe a model choosing to follow the contract, and it does not observe the GitHub UI. The claim that GitHub prefills a single-commit PR from the commit subject and body comes from GitHub's own documentation, not from a verified UI session in this repository. State that distinction when reporting.

Never present a passing format check as proof that the live agent, or GitHub, behaved as the contract expects.

Stop and wait whenever the push target is unclear, the scope is ambiguous, the branch naming convention is uncertain, or a new file would expose sensitive information. Never rewrite history, force-push, or remove files while doing this.