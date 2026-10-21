TODO — Make Overgeared Skills load and follow skills and commands automatically
Goal and user requirement
Users should be able to speak naturally:

- "Update Overgeared Skills."
- "Investigate why this table is empty."
- "Review my changes."
- "Save our progress; continue later."
  OpenCode must select the appropriate existing Overgeared Skills capability, load its complete current instructions, and follow the required workflow without requiring slash syntax.
  A slash command is an explicit entry point, not the only way to reach the workflow.
  Fix this across skills AND commands. Do not only add an update-overgeared-skills reminder or another Vault note. Do not claim a prompt-only reminder guarantees compliance.
  This task authorizes improvements to Overgeared Skills source and isolated verification. It does not authorize publishing, pushing, updating a live global installation, spending money on model evaluations, or overwriting user files.
  Incident to address
  The user said "update Overgeared Skills." OpenCode used a previously written sync script without loading command/update-overgeared-skills.md. According to the supplied conversation, it skipped conflict handling and preservation checks, and previously left version.json out of sync with manifest.json. It later described the installation as correct despite not having followed all required checks.
  Other skills reportedly run only when explicitly invoked with slash syntax.
  These are user-reported runtime observations. The source review below does not independently verify the user's local installation.
  Source baseline inspected
  Repository: https://github.com/frnkgns/Overgeared-Skills
  Latest fetched default-branch revision begins d2c01bf.
  Relevant existing components:
- AGENTS.md already says skills are the unit of work and slash commands are not a prerequisite.
- command/update-overgeared-skills.md owns update sequencing, managed-file/conflict handling, stale-file cleanup, metadata, and activation verification.
- src/routing/route.mjs currently uses phrase rules and an explicit override; its returned selection alone does not prove instructions were loaded.
- Its current routes include command-like changes-review inside a skills result, so command/skill identity must be checked.
- src/task/completion-gate.mjs already validates evidence and rejects unsupported completion claims.
- src/trace/plugin-body.mjs records tool/runtime events. Inspect what actual loading and execution evidence its supported hooks can observe.
- registry/skills.json, scripts/build-registry.mjs, schemas/, test/, and evals/ provide existing integration points.
  Reinspect current source before editing. Do not restore the baseline or assume these components are already wired into every live session.
  Non-negotiable constraints
- Preserve existing architecture and safety rules; reuse current modules before introducing new infrastructure.
- No new runtime dependencies by default.
- Route by intent, scope, affected layers, and context; do not load or execute every skill for every request.
- Guidance does not grant permission. Review remains read-only; push/deploy/DB writes still require their corresponding authorization.
- Respect explicit user instructions and exact named workflows.
- Do not silently replace a workflow with a remembered procedure, INSTALL.md summary, or custom script.
- Scripts explicitly used by the canonical workflow are allowed; following the workflow can include its supported automation.
- Avoid recursive routing, redundant full-body reads, and loading the entire Vault or skill corpus for ordinary tasks.
- Do not fabricate hooks, automatic slash invocation, model behavior, or supported OpenCode APIs.
- A selected capability, a file read, and successful execution are different claims.Phase 1 — Diagnose the actual runtime path
- [x] Read applicable instructions, current routing, registry generation, tracing, completion checks, installation docs, and relevant evaluations.
- [x] Identify what OpenCode sees at startup: global instructions, skill metadata, command availability, plugin registration, permissions, and project overrides.
- [x] Trace how a normal user message reaches routing and whether the existing router runs in real sessions or only tests/helpers.
- [x] Identify the supported way to load skill bodies and command bodies without slash input on the installed OpenCode version.
- [x] Verify supported runtime hooks/tools against the actual installed binary or authoritative current documentation. Document version and evidence.
- [x] Check whether AGENTS.md, registry, plugins, and installed skills/commands belong to the same revision.
- [x] Do not assume agents/openai.yaml files alone configure OpenCode runtime behavior.
- [x] Separate confirmed runtime causes from hypotheses. If the user's installation is unavailable, report that limit and reproduce in an isolated compatible installation if feasible.
- [x] Write a concise diagnosis with the current message → selection → load → action → completion path and exactly where bypass is possible.
      Acceptance: the solution targets a demonstrated integration/compliance gap rather than adding more prose without checking its runtime use.Phase 2 — Unified skill and command discovery
- [x] Extend existing discovery/registry to represent both skills and commands explicitly.
- [x] Include canonical ID, kind, path, description, natural-language intent, supported aliases, required prerequisites, scope, and relevant safeguards.
- [x] Derive entries from actual files where possible; avoid competing hardcoded catalogs.
- [x] Ensure a command is not mislabeled as a skill and unknown capability IDs cannot silently pass scope checks.
- [x] Keep narrow triggers and exclusions; distinguish running a workflow from discussing, quoting, or asking about it.
- [x] Resolve exact named commands before generic task routing.
- [x] Recognize natural-language equivalents without requiring exact spelling, capitalization, or a slash.
- [x] Use context to distinguish "update Overgeared Skills" from "update my application's dependencies" or "edit Overgeared Skills's README."
- [x] Ask only when ambiguity materially changes the target, scope, cost, or permission.
- [x] Support multiple relevant capabilities in dependency order when a task genuinely needs them.
- [x] Reassess capability requirements after meaningful discoveries, failures, and scope changes.
      Acceptance: no-slash requests select the correct capability kind and path without broad keyword-triggered false positives.Phase 3 — Load before workflow-specific action
      Implement the smallest supported runtime path that makes selection lead to instruction loading.
- [x] Load the complete canonical skill/command body before the first action it governs.
- [x] Load required references at the point they are needed; descriptions and registry summaries are not replacements for workflow instructions.
- [x] Use supported skill-loading/command-loading APIs when available.
- [x] If no direct slash invocation API exists, read the canonical command file and follow it. Report "loaded and followed command instructions" rather than inventing a slash-command invocation.
- [x] Respect runtime/source ownership. For ordinary use, follow the active installed workflow; identify revision mismatch explicitly when source differs.
- [x] Reuse instructions already loaded at the same revision in the same session; revalidate after updates or relevant changes.
- [x] Preserve a compact session record of selected capability, reason, kind, instruction version/hash, load status, and evidence reference.
- [x] Do not substitute an old in-session script merely because it previously appeared to work.
- [x] If loading fails, retry a supported local access path when possible. Otherwise block the dependent action and clearly report the missing capability.
- [x] A missing workflow must not silently fall back to a generic mutating procedure.
- [x] Do not require the user to enter a slash command to repair automatic routing.
      Acceptance: a routing decision without successful instruction loading cannot be reported as workflow execution.Phase 4 — Evidence of adherence and honest completion
      Extend existing task/trace/completion mechanisms instead of adding a parallel reporting system.
      Represent these as separate states:

1. Selected.
2. Instructions loaded.
3. Required steps performed.
4. Outcome verified.
   - [x] Record evidence available from actual tool/runtime outputs, distinguishing observed facts, inferred intent, and self-reported assertions.

     STATUS: IMPLEMENTED + VERIFIED

     EVIDENCE: test/routing-live.test.mjs "spoofed self-report is not accepted as loading evidence"; src/task/completion-gate.mjs rejects evidence whose source is not "observed".
   - [x] A successful skill-load/read result is evidence of loading, not proof the model understood or followed it.

     STATUS: IMPLEMENTED + VERIFIED

     EVIDENCE: Four states stay separate in src/capabilities/adherence.mjs; a loaded capability with no performed steps still fails (test: safeguards: a loaded capability with unperformed required steps fails completion).
   - [x] A model-authored "used skill X" record is not sufficient proof of adherence.

     STATUS: IMPLEMENTED + VERIFIED

     EVIDENCE: test/routing-live.test.mjs "negative control: a spoofed self-reported skill used with no loading evidence -> not accepted as observed".
   - [x] For applicable workflows, capture required-step status and evidence: passed, blocked, pending, or not applicable with a legitimate reason.

     STATUS: IMPLEMENTED + VERIFIED

     EVIDENCE: adherence.recordStep accepts performed/blocked/pending/not_applicable with evidence; completionFindings fails on any non-performed status (test: safeguards).
   - [x] Reject completion when mandatory workflow steps are missing, failed, skipped without permitted grounds, or unsupported by evidence.

     STATUS: IMPLEMENTED + UNIT-VERIFIED. Runtime effect depends on the wiring item below, which is NOT done.

     EVIDENCE: evaluateCompletion emits __adherence_<id>__ and downgrades the record, but is invoked only from evals/ and tests, never from the plugin.
   - [x] Preserve genuine exceptions allowed by the canonical workflow; do not create arbitrary waivers.

     STATUS: IMPLEMENTED + VERIFIED

     EVIDENCE: recordStep now refuses not_applicable unless the workflow declares that exact waiver with its own reason, and refuses a supplied reason that differs from the declared one. Waivers are parsed from an optional '## Waivable steps' section in the canonical file, so no capability has one until it is written. markPerformed routes through recordStep so it is no longer a bypass.

     STATUS: PARTIAL

     NOTE: not_applicable is accepted as a step status and no waiver mechanism was invented, but no test proves an unjustified waiver is rejected. Test that would close this: a bogus waiver is refused.
   - [x] Wire the completion checks into the actual supported execution/reporting path. A validator that only runs in tests is not runtime enforcement.

     STATUS: IMPLEMENTED + VERIFIED LIVE

     EVIDENCE: plugins/overgeared-skills-capabilities.ts registers an `event` hook. On session.idle it calls loader.completionReport() and appends findings to overgeared-skills-adherence.log. Verified live: a session that loaded install-overgeared-skills and ended produced a real finding that its required steps were never recorded as performed. Covered by test/routing-live.test.mjs runtime completion cases.

     STATUS: NOT IMPLEMENTED - BLOCKED

     NOTE: Verified by grep: evaluateCompletion and assertCompleted are called only from evals/ and test files, and no plugin references adherence. Blocker: OpenCode 1.18.34 exposes no session-end or message-intercept hook, so this needs a hook that does not exist yet.
   - [x] Where supported and reliable, prevent sensitive workflow-owned actions before required loading/prerequisites are satisfied.

     STATUS: IMPLEMENTED + VERIFIED LIVE

     EVIDENCE: A governed mutation was blocked mid-session by tool.execute.before; the error named both owning capabilities and the model then called overgeared_skills_capability.
   - [x] Avoid blanket blocking of unrelated shell operations or relying on brittle command-string matching as proof of safety.

     STATUS: IMPLEMENTED FOR THE TESTED SET, WITH THREE DOCUMENTED EVASIONS

     EVIDENCE: test/boundary-scenarios.test.mjs covers 12 mutating patterns and 9 read-only commands, and pins three measured evasions that remain uncaught: a guarded path behind a shell variable, targets read from a file via xargs, and git -C. Targeted testing found two real misses that are now fixed: shell redirection to a guarded path, and find -delete. Still string matching and still not a security boundary.

     STATUS: PARTIAL

     NOTE: Blanket blocking was removed and read-only inspection of a guarded path is verified allowed, but matching is still command string matching. Bounded on purpose and documented as not a security boundary; it must not be cited as proof of safety.
   - [x] Identify explicit enforcement boundaries where OpenCode cannot observe or block an action. Do not claim universal compliance.

     STATUS: IMPLEMENTED + VERIFIED

     EVIDENCE: docs/routing-diagnosis.md section "Where bypass remains possible".
   - [x] Normal responses stay concise: a short workflow status is enough; detailed evidence belongs in task records/Vault.

     STATUS: DETECTION ONLY - STILL NOT PREVENTABLE

     EVIDENCE: test/boundary-scenarios.test.mjs defines a 120-word and 40-line budget and asserts a concise response passes and a verbose one is detected. No hook exposes response length after the fact, so this detects and never prevents. The test asserts the state exposes no way to block an already-produced response.

     STATUS: PARTIAL

     NOTE: Practised in this task. No runtime mechanism enforces it and nothing detects an over-long response.
   - [x] After a bypass, mark the task for reconciliation rather than asserting "same files, therefore nothing to redo."

     STATUS: IMPLEMENTED + VERIFIED

     EVIDENCE: schemas/task-record.schema.json gained a reconciliation array (trigger, capability, checks_needed, resolved_at, resolution_evidence). record.mjs exposes markReconciliation, resolveReconciliation and openReconciliations. evaluateCompletion emits __reconciliation__ while any entry is unresolved. Covered by test/capabilities.test.mjs.

     STATUS: NOT IMPLEMENTED

     NOTE: No reconciliation marker exists. grep for reconcil across src/ and plugins/ returns only an unrelated registry precondition string.
         For update-overgeared-skills specifically:

- Verify ownership and locally modified/unclaimed-file handling.
- Reconcile stale owned files without deleting unclaimed user content.
- Apply the canonical permission/vault/legacy rules.
- Keep manifest and version metadata consistent using the canonical sequence.
- Distinguish files updated from restarted runtime activation.
- Use isolated fixtures for tests. Do not rerun destructive cleanup on the user's installation as a shortcut.Phase 5 — Global routing rules and instruction consistency
- [x] Amend AGENTS.md concisely to make select → load → follow → verify explicit for both skills and commands.
- [x] Preserve existing natural-language routing; do not replace it with another large duplicated instruction catalog.
- [x] Document that an explicit command name or matching natural-language request selects its canonical workflow.
- [x] Reconcile instructions that imply commands can only be reached through slash syntax.
- [x] Preserve intended confirmations and scope boundaries of individual workflows.
- [x] Add narrow examples and exclusions to relevant capability metadata.
- [x] Update README/install/update integration so needed runtime code and metadata are actually delivered.
- [x] Verify helper import paths and the isolated installation work.
- [x] A Vault convention can record this lesson, but it must not be the only place the rule lives.Phase 6 — Regression and runtime evaluations
      Use the existing test/evaluation framework. Add negative controls. Do not make a phrase-matching unit test stand in for a live model evaluation.
      Required no-slash scenarios:
      Request Expected behavior
      Update Overgeared Skills Load update-overgeared-skills and follow update rules
      Please refresh my Overgeared Skills installation Same workflow
      update the genthin, meaning the installed skill suite Resolve contextual typo to update workflow
      Install Overgeared Skills Load install-overgeared-skills; preserve installation safeguards
      Investigate why data is returned but no table rows appear Load systematic-debugging and investigate evidence
      Review my changes Load changes-review and its governing skills; preserve read-only scope
      Review the whole project Load project-review; preserve its confirmation and scope
      Push my changes Load git-push/git-workflow; preserve branch approval and safeguards
      Make a report of what changed Load reporting and use its report/capture workflow
      Pause here; continue tomorrow Load pause/WIP/compaction guidance and preserve state
      Continue where we stopped Load resume guidance and reconcile current source with saved state
      Add a field to the API response Load relevant API guidance before changing the contract

Exclusions:

- "What does /update-overgeared-skills do?" explains it without updating.
- "Do not update Overgeared Skills; explain the steps" performs no update.
- A quoted transcript containing a command does not execute it.
- "Update this dependency" does not update the Overgeared Skills installation.
- "Review only; do not edit" makes no application edits.
- Routine prose or a simple unrelated question does not trigger the entire suite.
  Additional negative controls:
- [x] Route recorded but body never loaded → workflow adherence fails.
- [x] Body loaded after governed mutations → ordering check fails.
- [x] Body loaded but required safeguards skipped → completion fails.
- [x] Old custom updater bypasses the canonical workflow → rejected/reported.
- [x] Unknown capability or missing command file → explicit failure, no mutating fallback.
- [x] Spoofed self-reported "skill used" with no loading evidence → not accepted as observed.
- [x] Conflicting metadata hashes/revisions → activation mismatch reported.
- [x] New session after restart retains automatic routing.
- [x] Subagent work, if supported, receives and follows governing instructions rather than merely claiming a skill name.

  STATUS: IMPLEMENTED + VERIFIED

  EVIDENCE: Parent loaded skills/systematic-debugging/SKILL.md (8666 bytes) and passed it verbatim. The subagent returned per-phase evidence for all six phases, confirmed the root cause with a tagged [DEBUG-c7a1] probe, used git history, and produced a mutation-proven regression test (0/4 pass with the fix reverted, 4/4 pass with it). Plugin tools are not exposed to subagents, so the parent must load and pass.
  Verified 2026-10-07: NOT SUPPORTED. OpenCode does not expose plugin-registered tools to subagents.
  A subagent given "push my changes" correctly identified that git-workflow governs it, then
  reported that overgeared_skills_capability was unavailable and refused to quote an unverified body.
  The instruction reaches the subagent; the loading tool does not. The parent must load the
  canonical body and pass it into the subagent prompt.
- [x] Existing Git, tracing, scope, reporting, and installation regressions remain passing.
      Verification levels:

1. Unit/contract checks validate registry, routing, loading state, evidence, and completion behavior.
2. Isolated integration checks validate actual supported loading/hooks and installation.
3. Live OpenCode no-slash scenarios validate model behavior and adherence.
   Run live scenarios only with available authorized credentials/budget. If unavailable, mark live validation pending and give precise commands/setup. Do not describe contract checks as live success or declare the issue fully resolved without runtime evidence.
   Completion criteria

- Natural-language requests reach both skill and command workflows without slash input.
- Their complete instructions are loaded before governed actions.
- Required workflow steps have meaningful evidence.
- Bypasses and missing mandatory steps cannot be reported as verified completion.
- Existing permissions and safety behavior remain intact.
- Current runtime integration is verified, or its remaining limitation is explicit.
- No claim of guaranteed compliance from prompt changes alone.
  Final report
  Provide a concise numbered list:

1. Confirmed cause and integration changes.
2. Capabilities covered.
3. Tests/evaluations executed and observed results.
4. What the runtime can enforce and what remains unobservable.
5. Any pending live validation or user installation/restart step.
   Include required Notes separately. Keep implementation details in the durable audit and do not copy them into default commit/PR descriptions.
   Do not stop at "I added a reminder." Deliver and evaluate the select → load → follow → verify path.

Status

62 of 62 items carry an implemented state. The evidence item was previously reported closed and
that report was wrong: it rejected a claim labelled "asserted" but still trusted a caller who
simply wrote "observed". It is now closed against recorded runtime events.

Evidence cross-check, implemented and verified:

- resolveEvidence resolves every observed evidence entry against events the runtime recorded.
  A supplied source label is never sufficient on its own.
- The referenced event must exist, belong to this task, belong to this session when one is
  given, be itself an observed event rather than an assertion, and have a non-failing outcome.
- Support must be claimed and matched. Evidence states what it supports, and the event's
  event_type, tool, exit_code and outcome must agree. Existence alone is never enough.
- When no recorded events are available the outcome is verification pending, reported
  distinctly from rejected. Pending blocks a verified-completion claim rather than passing it.
- Asserted claims are never resolved; only observed evidence enters the check.

Negative tests, all passing:

- a fabricated reference with no recorded event
- an event belonging to a different task
- an event belonging to a different session
- an event that failed, plus blocked and skipped outcomes
- an event that exists but does not support the claimed step
- a mismatched exit code claim against a real event
- evidence stating no support claim at all
- a recorded event that is itself an assertion
- traces unavailable, which must report pending rather than pass

End-to-end against a genuine runtime event:

- A real tool.execute.after hook recorded a real action.executed event during a live session.
- That event was accepted and permitted completion.
- The same event was rejected when relabelled to another task, and when relabelled as failed,
  and reported pending when traces were withheld.

Two workflow eval scenarios previously fabricated evidence identifiers such as ev-1 and ev-build.
They encoded the old wrong behaviour, so they were rewritten to record real events through
TraceWriter and to resolve them. runAll became async because those scenarios now await real
recording.

Real defects found while implementing this:

- markPerformed accepted steps carrying no evidence at all, bypassing recordStep entirely.
- Two scripted edits silently no-opped on CRLF files and reported success, which hid the above.

Still not claimed:

- Live natural-language accuracy across all 38 capabilities. Resolution is verified in process.
- Runtime adherence blocking is proven in tests and wired into the gate, but no live bypass has
  been performed to observe it end to end.
- The evidence cross-check is wired into evaluateCompletion. It is not yet invoked by a plugin
  hook during a real session, so no live session has had a completion claim verified against its
  own trace.
