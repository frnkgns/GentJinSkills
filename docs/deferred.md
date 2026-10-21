# Deferred work

Recorded so it is not mistaken for implemented. Nothing here is available today.

## Phase 6 — optional extensions, not started

All four Phase 6 items are deferred by design. The roadmap gates them on measured need, and no measurement has been taken yet.

### Local read-only dashboard

Not implemented. CLI reports exist and cover the current need. A dashboard becomes justified only if task history, trace browsing, or evaluation comparison becomes a measured problem. Starting with CLI output was the correct order.

### Semantic retrieval

Not implemented. `retrieveRelevantFailures` uses keyword matching, which is sufficient and deterministic. Embeddings or a vector store would add a dependency and lose reproducibility. Only a benchmark showing keyword retrieval misses relevant notes would justify it.

### Model routing and external observability

Not implemented. No measured requirement exists, and both would need separate approval for new dependencies or services.

## Live evaluation runs

The live mode path exists and is wired to `opencode run`, but it has never been executed. It requires provider credentials and incurs real model cost, so it was not run without explicit authorization.

This means there is no measured live success rate for Overgeared Skills. Any claim about how the agent performs in a live session is currently unsupported. The implementation is complete and validated by contract tests; live validation is pending.

Consequence: the roadmap's own bar applies. Report this as implementation complete with live validation pending, never as evaluated end to end.

## Coverage gaps in the enforcement layer

These are real and worth naming.

The completion gate runs when invoked, not automatically at session end. There is no hook that fires on a model claiming completion, because no such event exists. Enforcement currently depends on something calling `assertCompleted`.

Skill routing is inferred, not enforced. The router can recommend, and the completion gate can flag an over-broad scope, but it cannot force the correct skill to be chosen.

Model reasoning cannot be graded. No hook exposes it.

Cost and token data require a separate `opencode stats` or export call rather than arriving in the hook payload.

## Suggested future work, unprioritized

- Wire the completion gate into `tool.execute.after` so a completion claim is checked as the session runs rather than only on demand.
- Add a trace-to-vault bridge so completed task traces become retrievable project memory without manual copying.
- Add repeat support to the live runner with a documented aggregate formula. The metric definitions exist; the aggregator does not.
- Split `skills/knowledge-vault/SKILL.md`. At 1,271 lines it is 48 percent of the skill corpus and the default router for unknown context. Blocked on the unresolved question of whether OpenCode matches a skill's whole description or only its first sentence, because the answer decides how the trigger should be worded.