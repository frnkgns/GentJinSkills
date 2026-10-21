---
name: work-in-progress
description: Preserve and resume unfinished development work. MUST be used when the user pauses, holds, stops for now, or asks to continue previous work, and at meaningful milestones during substantial unfinished work, even without an explicit request. Use when work spans sessions, is blocked, or meaningful implementation remains. This is a core Overgeared Skills system, not an optional extra: keep the active state current rather than reconstructing it later. Maintains WIP state, decisions, rejected approaches, blockers, testing status, files, and one clear next action.
---
# Work in Progress

## Create or Update WIP
Use `work-in-progress/WIP-short-topic.md` for meaningful unfinished work. Search for an existing related WIP first.

Include when applicable:
- Goal
- Current State
- Work Completed
- Remaining Work
- Current Approach
- Important Findings
- Discussion Context
- Decisions Made
- Rejected Approaches
- Files Being Worked On
- Problems / Blockers
- Testing / Verification
- Next Action
- Related Knowledge
- Change Audit (link to `changes/<note>.md` once written)
- Temporary Artifact Ledger (see below)

Preserve conclusions and reasoning, not chat transcripts. Update on meaningful progress, not every small edit.

## Temporary Artifact Ledger

Track temporary development artifacts at the moment they are created, not by guessing at push time. Maintain this table in the active WIP note, and reflect it in the durable change audit.

```markdown
## Temporary Artifact Ledger

| File | Type | Purpose | Remove Before Push | Cleanup Status |
|---|---|---|---|---|
| scripts/debug-api.ts | DEBUG | Inspect API response | Yes | Removed / Retained / Pending |
| db/seed-qa.ts | SEED | Create local QA records | Yes | Removed / Retained / Pending |
```

Types: TEST, QA, DEBUG, SEED, MOCK, FIXTURE, TEMP, LOCAL-ONLY.

This ledger follows the task until completion or push. When a temporary artifact is removed, update its Cleanup Status to `Removed`. When the change audit is written, mirror the Removal status into its Temporary Development Artifacts section.

## Current Resume State

Maintain `work-in-progress/current.md` as the single canonical answer to "what were we doing, where did we stop, what is next?". Keep it small:

- Objective
- Current Status
- Completed
- In Progress
- Remaining
- Blockers
- Relevant Files
- Relevant Memory
- Next Recommended Step

Topic WIP notes may continue alongside it when several workstreams run in parallel; `current.md` links to them. When the work is finished, clear or archive the active state rather than leaving a misleading resume point.

`current.md` and the daily session note together must contain enough state to resume after an interruption or a compaction without the previous conversation.

Cooperation: WIP owns unfinished state and the next action. When context grows large, `compaction` condenses the thread and hands unfinished work here and durable findings to `knowledge-vault`; it never replaces this note. On resume, rebuild from this note plus relevant vault notes plus current source rather than trusting an old compacted summary.

## Pause
When the user says pause, save where we are, continue later/tomorrow/next time, or equivalent:
1. Find/create the relevant WIP.
2. Record current state, completed and remaining work.
3. Preserve meaningful decisions, rejected approaches, blockers, and actual verification status.
4. Set one specific immediate `Next Action`.
5. Refresh `work-in-progress/current.md` so the resume point is current.
6. Link relevant permanent knowledge.
7. Save worthwhile unresolved investigations under `questions/`.
8. Append the day's continuity entry to `sessions/YYYY-MM-DD.md`.

## Resume
When the user says continue, resume, revisit, or finish previous work:
1. Find the matching WIP, and read `work-in-progress/current.md` when it exists.
2. Read Goal, Current State, Completed, Remaining, Discussion Context, Decisions, Rejected Approaches, Blockers, Testing, related questions/knowledge, and Next Action.
3. Inspect current source code and verify the WIP still matches reality.
4. Continue from the documented stopping point instead of restarting investigation.
5. Update WIP as meaningful progress occurs.

## Complete
When WIP is finished:
1. Verify remaining work and testing.
2. Promote reusable findings to permanent knowledge.
3. Update architecture/ADRs/questions where needed.
4. Move unresolved follow-up into another WIP.
5. Clear or archive `work-in-progress/current.md` so no stale resume point remains.
6. Remove the WIP from active state; archive as `Status: Completed` with date/outcome if historically useful, otherwise delete after knowledge extraction.
7. Update the day's session note with the outcome.
