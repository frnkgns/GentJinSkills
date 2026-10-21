---
description: Load the full text of every installed skill into the current context so routing, skill boundaries, and skill contents are known rather than inferred from descriptions. Use when the user asks to learn the skills, load all skills, read all skills, explain what each skill does, or check for gaps or overlap between skills.
---

OpenCode normally sees only each skill's `name` and `description`. That is enough to route a task, but not enough to answer questions about what a skill actually contains, whether two skills overlap, or whether a rule is stated twice. This command puts the real bodies in context.

## When to Run It

- The user asks to learn, load, or read all the skills.
- The user asks what a skill does, or what is covered by the skill set.
- The user wants to audit the corpus for overlap, duplication, gaps, or dead weight.
- Before deciding whether to add a new skill, so the new one does not duplicate an existing owner.

Skip it for ordinary coding work. Routing from descriptions is sufficient and cheaper.

## Procedure

1. Resolve the installed skill root: `<opencode-root>/skills`, where `<opencode-root>` is `<user-home>/.config/opencode` unless overridden.
2. List every skill directory that contains a `SKILL.md`.
3. Read each `SKILL.md` in full. Do not summarize from the description, and do not stop after a few.
4. Read `AGENTS.md` if it is not already loaded, so the always-on rules and the skill catalog can be compared against the actual skills.

## Report

Give a compact inventory, not a transcription. For each skill: name, the trigger condition in a few words, and the one concern it uniquely owns.

Then answer the user's actual question with that inventory behind it. If the request was an audit, report:

- skills whose trigger conditions overlap, naming the overlapping phrase
- rules stated in more than one place
- skills whose description promises more than their body delivers
- genuine coverage gaps in the lifecycle
- any skill that is redundant with another

Never present a description as if it were the body. If a skill was not read, say so.

## Cost

The corpus is roughly 2,600 lines, dominated by one large skill. Say that before starting when the user has not asked for it, and note that the answer to most questions is available from the descriptions alone. Loading everything is worth it for corpus-level questions, not for a single skill lookup.