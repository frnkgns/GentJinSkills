# Gap assessment — KnowledgeVault retrieval before implementation

**Date:** 2026-10-14
**Scope:** where retrieval actually ran in code before this feature existed, versus where
it was only instructed in Markdown.

## Finding

**Retrieval was 100% instructed and 0% executed.**

No code path searched the vault. The only vault touchpoint in the entire runtime was
`knowledgeRootHasNotes()` in the discovery gate, which asks whether `memory-index.md`
exists. It performs no search and reads no note content.

Everything else lived in prose:

| Location | What it said | What it did |
| --- | --- | --- |
| `AGENTS.md` | "Search relevant project knowledge before acting" | nothing; a model may comply |
| `skills/knowledge-vault/SKILL.md` | note-first lookup, progressive retrieval | nothing; loads only when the model chooses |
| `src/discovery/` | `gentjin_discovery` validates a retrieval *claim* | verifies notes are inside the knowledge root and were read this session |

`verifyMemoryResult` is the closest thing to enforcement, and it is a **claim checker, not
a searcher**. It can confirm that notes you said you read are real and in-bounds. It cannot
tell you that you missed one, and it is session-scoped, so one retrieval could satisfy the
gate for the rest of the session regardless of topic.

`src/trace/plugin-support.mjs` also declared `chat.message` and `permission.ask` in
`required_hooks`, but `createTracePlugin` implemented neither. Claimed coverage that did
not exist.

## Why this was invisible

The runtime layer had never been installed. `INSTALL.md`'s executable step copied only
`AGENTS.md`, `command/`, and `skills/`, so `plugins/` and `src/` were never deployed. Both
plugins were also still V1, which OpenCode 2 cannot load at all. See
[[code-layer-never-installed]].

So there were two independent layers of failure stacked on top of each other: the
instructions were unenforced, *and* the enforcement code was not running.

## What changed

Per-request retrieval now executes in code, registered through the v2 prompt hook:

```
user turn -> ctx.session.hook("prompt")
          -> resolve this project's knowledge root
          -> retrieveRelevantKnowledge() in src/memory/retrieve.mjs
          -> render bounded, cited, untrusted-delimited context
          -> append to event.prompt.text before the model reasons
```

See `docs/per-request-retrieval.md` for settings, fallbacks, and limits.

## What remains instructional, and must stay honestly labelled

- **Skill selection** is not observable through any hook. Routing remains inferred.
- The prompt hook runs **once at admission**, not before every model call in a turn.
- Synthetic, shell, compaction, and move messages do not trigger retrieval.
- `gentjin_discovery` still only validates a claim; it does not search. The two are
  complementary and are not duplicated.

Nothing above claims guaranteed enforcement beyond what the runtime actually does.