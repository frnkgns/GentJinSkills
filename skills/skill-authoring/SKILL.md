---
name: skill-authoring
description: Author, extend, or retire a skill in Overgeared Skills safely. Use when creating a new skill, changing an existing skill's triggers or scope, deciding whether a new skill is justified, or auditing skills for overlapping triggers, contradictory rules, broken references, or recursive delegation.
---
# Skill Authoring

## Decide whether a skill is justified

A new skill is permanent maintenance surface: it must stay consistent with the other skills, the router catalog, the documentation, and the installed payload. Adding one is not free.

Create a new skill only when all of these hold:

- No existing skill owns the concern.
- The concern recurs, so it will be needed again.
- It is coherent on its own rather than being two workflows stapled together.

Extend an existing skill instead when the concern is adjacent, shares the same trigger conditions, or would need to defer to the same neighbors. Most proposed skills are a specific workflow assembled from existing ones, and that assembly belongs in the caller's instructions.

When a new skill overlaps an existing one, merge it in and delete the weaker trigger. Two skills that both answer the same request make routing a coin flip.

## Required content

A new skill defines:

- **Purpose** — the one thing it exists to do.
- **Triggers** — the specific phrasings and situations that should load it, and what must not.
- **Inputs and preconditions** — what must be true before it runs.
- **Workflow** — ordered steps, each ending on a checkable completion condition.
- **Permissions** — what it may read, change, and request authorization for.
- **Outputs** — what it produces and where it lands.
- **Fallbacks** — what to do when a tool, environment, or permission is missing.
- **Examples** — at least one request that should load it and one that should not.

## Exclusions belong in the body

Name what this skill does not own, and point to the owner. Exclusions are what keep triggers from overlapping, and they matter more than the trigger list itself.

```text
Keep X here. Use `other-skill` for Y. Do not use this skill for Z.
```

## Keep triggers narrow

A trigger that fires on unrelated work costs context and misroutes the request. Prefer a small set of distinct conditions over a broad description. When two phrasings describe the same case, keep one.

Do not write a trigger that only a human would notice. It has to be recognizable from the request alone.

## Structure the body

Order content by how immediately it is needed:

1. Steps the agent performs, in order.
2. Rules consulted while working.
3. Reference material read only when it applies.

Push optional detail into a separate file and reference it, so the always-read portion stays short. Move a rule down only when some branches never need it.

Keep a concept's definition, its rules, and its caveats together rather than scattering them. When a concept is referenced in three places, define it once and link the others.

Keep each meaning in one authoritative place. Restating a rule in three files means it will drift.

## Prefer positive instruction

State the behavior you want rather than the behavior you are forbidding. A prohibition pulls the forbidden action into context and tends to make it more available, not less.

Write a prohibition only for a hard guardrail you cannot phrase positively, and pair it with the positive target so attention lands on what to do.

## Audit before registering

Check every new or changed skill for:

- Overlapping triggers with an existing skill.
- Contradictory rules between skills.
- References to files or skills that do not exist.
- Delegation that loops back to itself.
- A description that promises more than the body delivers.

## Verify before registering

Do not consider a skill done until:

- Its frontmatter parses and its name matches its directory.
- It is discoverable in the installed skills list after a restart.
- A request matching its trigger loads it.
- A near-miss request does not.
- Existing skills still route correctly.

Run the catalog checks after any skill change:

```text
node --test test/skill-catalog.test.mjs
node scripts/build-registry.mjs
```

## Boundaries

Changing shared skills is authorized only by work on skills. Finding a pattern during an unrelated task does not authorize rewriting global behavior. Report it and let the user decide.

Never build a self-modifying agent, and never let a skill edit its own definition at runtime.

Record the change and its rationale through `knowledge-vault`.

## Reporting

State the skill's owner, its triggers and exclusions, how it was verified, what overlapping skills it replaced or merged with, and whether the registry was regenerated.