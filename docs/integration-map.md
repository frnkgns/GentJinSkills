# Integration Map

Maps each capability proposed in `todo.md` to its existing Overgeared Skills owner and the reference it was adapted from.

Date: 2026-10-05
Reference inspected: `https://github.com/mattpocock/skills` at commit `f3fc5632f401156837ee3872f14fe33ccf1024ea` (2026-10-07), 38 skills across `engineering/`, `productivity/`, `in-progress/`, `misc/`.

## Attribution

The reference repository is MIT licensed, `Copyright (c) 2026 Matt Pocock`. No reference text is copied verbatim. The adaptations below are original Overgeared Skills instructions written against concepts, matching this repository's existing prose style. Attribution is recorded here and in `README.md`.

## Ownership principle adopted from the reference

The reference repository rejects new skills when the behavior composes from existing ones:

> New skill proposals and contributions are closed. If you can compose the behaviour from existing skills, it does not get a new one.

Its stated reason is maintenance cost: every skill must stay in step with the others, the docs, the router map, and the plugin manifest. Overgeared Skills already follows this rule through its `Search Before Create` instruction in `project-conventions`, so the roadmap's "enhance or add" split resolves toward enhance wherever an owner exists.

## The map

| Proposed capability | Existing Overgeared Skills owner | Action | Verified reference |
| --- | --- | --- | --- |
| Routing | `AGENTS.md` Pre-Task Capability Assessment, and the 23-skill catalog | Enhance: add on-ramp/main-flow structure, smallest-sufficient-workflow rule, phase-boundary choice | `skills/engineering/ask-matt/SKILL.md` |
| Evidence-based bug triage | `skills/systematic-debugging/SKILL.md` | Enhance: require one red-capable feedback command before hypothesising; 3 ranked hypotheses instead of 1; tagged debug logs | `skills/engineering/diagnosing-bugs/SKILL.md` |
| Issue triage against a tracker | none. Overgeared Skills has no tracker integration and `todo.md` requires working without one | Defer the state-machine and label mechanics. Adopt only the two portable parts: redundancy check by domain concept, and verify the claim before planning | `skills/engineering/triage/SKILL.md` |
| Specification and task planning | `skills/requirements-review/SKILL.md`, with `architecture-review` for structure | Enhance `requirements-review` with a spec shape, explicit non-goals, and tracer-bullet task breakdown with blocking edges | `skills/engineering/to-spec/SKILL.md`, `skills/engineering/to-tickets/SKILL.md` |
| TDD | `skills/test-strategy/SKILL.md` | Enhance: named seams confirmed before writing, tautological-test anti-pattern, vertical slices over horizontal | `skills/engineering/tdd/SKILL.md` |
| Active knowledge capture | `skills/knowledge-vault/SKILL.md`, `skills/reporting/SKILL.md` | Enhance: add inline capture moments and the three-condition test for raising an ADR | `skills/engineering/domain-modeling/SKILL.md` |
| Domain and architecture knowledge | `skills/knowledge-vault/SKILL.md` glossary and architecture routing | Enhance: challenge terms against the glossary, cross-check stated behavior against code | `skills/engineering/domain-modeling/SKILL.md`, `skills/engineering/codebase-design/SKILL.md` |
| Git safeguards | `skills/git-workflow/SKILL.md`, `command/git-push.md` | Enhance instructions and add real enforcement through the existing `tool.execute.before` plugin hook | `skills/misc/git-guardrails-claude-code/SKILL.md` |
| Optional pre-commit setup | none | Add, as an explicitly invoked capability. Node-based, not Husky, because Overgeared Skills carries zero runtime dependencies and the repository has no package manager | `skills/misc/setup-pre-commit/SKILL.md` |
| Skill authoring | none | Add. This is the only capability with no existing owner in any form | `skills/productivity/writing-for-agents/SKILL.md` |

## Why two new skills and eight enhancements

Skill authoring has no equivalent anywhere in the 23 existing skills, and no combination of them produces it; a gap table for a new skill cannot be written using skills that do not exist.

Pre-commit setup is absent, but it is adjacent to the existing verification layer, so it is added as a thin explicit-invocation wrapper over commands the repository already has rather than as new machinery.

The other eight all have a real owner. Adding a parallel skill for any of them would duplicate an established workflow and create a second thing to keep in step, which is exactly the maintenance cost the reference project rejects.

## Concepts deliberately not adopted

| Concept | Reason |
| --- | --- |
| Issue-tracker state machine and label vocabulary | `todo.md` forbids a mandatory tracker, and Overgeared Skills has none |
| Subagent-driven parallel implementation | `todo.md` forbids parallel agents and worktree orchestration |
| Prototype detour with a throwaway branch | Out of scope for this roadmap |
| Husky, lint-staged, Prettier | Overgeared Skills carries zero runtime dependencies and has no package manager |
| Claude Code `PreToolUse` settings | Harness-specific. Overgeared Skills targets OpenCode, whose equivalent is the `tool.execute.before` hook already verified in `plugins/overgeared-skills-trace.js` |
| `disable-model-invocation` frontmatter | A Claude Code convention, not an OpenCode one |
| The full reference suite | `todo.md` forbids copying it; only named concepts were read |

## Overlap resolution

`diagnosing-bugs` and `triage` overlap in Overgeared Skills's existing `systematic-debugging`. Resolution: `systematic-debugging` remains the single owner. Triage's tracker mechanics are deferred; its two portable checks are folded into the debugging workflow rather than given a separate skill.

`to-spec` and `to-tickets` overlap `requirements-review` and `refactoring-migration`. Resolution: `requirements-review` owns specification and decomposition. `refactoring-migration` keeps ownership of staged execution, which is the behavior the reference's expand-contract pattern already shares.

`writing-for-agents` overlaps Overgeared Skills's `project-conventions` comment and structure rules. Resolution: `project-conventions` keeps ownership of matching an existing codebase. The new skill-authoring skill covers authoring a new skill, which is a different task with no existing owner.