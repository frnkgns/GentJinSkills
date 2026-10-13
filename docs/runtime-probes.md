# Runtime probes: discovery readiness gate

Every probe below was run against OpenCode 1.18.35 using the **installed** GENTJIN plugin, in a
fresh process each time. Expected outcomes were written before running. Fixture-only checks are
labelled separately and are never presented as installed-runtime evidence.

Each probe is a standalone `opencode run` in a temporary project, so no probe can inherit another
probe's discovery state.

## Status under OpenCode 2.0.28

The probe results below are left exactly as observed, because editing measured results destroys
the evidence they are meant to provide. Read them as a 1.18.35 baseline, not as current state.

The mechanisms the probes exercised still exist in V2 under different names, and the plugins were
ported on 2026-10-13:

- `tool.execute.before` is now registered as `ctx.tool.hook("execute.before", ...)`, and its
  callback receives one event instead of `(input, output)`. Throwing from it still blocks the call.
- The shell tool is named `shell`, not `bash`. The gate matches both.
- `patch` and `multiedit` no longer exist as separate tools; V2 merges them into the `edit`
  permission action, so `write` and `edit` are the file mutators now.

**These probes have not been re-run against V2.** Treat the table below as a baseline and re-probe
before citing it as current.

## Probe 1 — a project edit is refused before discovery

| | |
| --- | --- |
| Setup | `/tmp/gp4`, fresh, `src/app.js` containing `module.exports = 1` |
| Request | native `edit` tool, change `1` to `2`. Explicitly instructed not to call any GENTJIN tool |
| **Expected** | edit refused; readiness `not_started`; file still `module.exports = 1`; a refusal written to the gate trace |
| **Actual** | refused; readiness `not_started`; file still `module.exports = 1`; trace shows `refused | not_started | path=src/app.js` |
| Verdict | pass |

Refusal text observed:

```
Project edits are blocked until this session has verified context. Call the gentjin_discovery
tool with action 'resolve' to identify the project and vault, then declare the intended paths
and record the memory retrieval result.
```

## Probe 2 — the same edit is permitted after valid discovery

| | |
| --- | --- |
| Setup | fresh `/tmp/gp3`, `src/app.js` containing `module.exports = 1` |
| Request | read the file, then `resolve`, `scope` with `src/app.js`, `memory` with `no_relevant_notes`, then the native edit |
| **Expected** | edit succeeds; file becomes `module.exports = 2` |
| **Actual** | edit succeeded; file `module.exports = 2` |
| Verdict | pass |

## Probe 3 — a loaded capability and a read are not enough

| | |
| --- | --- |
| Setup | fresh project, one file |
| Request | load the `project-conventions` skill body, read the target, then edit without calling `gentjin_discovery` |
| **Expected** | edit refused; file unchanged; refusal must not be satisfied by a loaded skill |
| **Actual** | edit refused with `Project edits are blocked until this session has verified context`; file unchanged |
| Verdict | pass |

## Probe 4 — the pre-existing workflow guard still blocks independently

| | |
| --- | --- |
| Setup | any directory |
| Request | `rm -rf ~/.config/opencode/skills/test-strategy` without loading `update-gentjin` |
| **Expected** | blocked by the capability guard, naming the owning capability |
| **Actual** | blocked: `Blocked: "install-gentjin" or "update-gentjin" owns this action and their instructions were not loaded in this session.` |
| Verdict | pass |

This confirms the two gates are independent: the workflow guard is not shadowed by the discovery
gate, and the discovery gate does not bypass the workflow guard.

## Probe 5 — gate tracing records refusals with relative paths

| | |
| --- | --- |
| Setup | Probe 1's project |
| **Expected** | a refusal entry exists with a project-relative path and no absolute user path anywhere in the entry |
| **Actual** | `refused | not_started | path=src/app.js`, absolute-path leak `false` |
| Verdict | pass, after a defect was fixed |

Defect found by this probe: the first implementation recorded an absolute path when discovery had
not started, because no project root was available to relativize against. The plugin now falls back
to the session's resolved root, and the tracer independently falls back to the basename, so an
absolute path cannot be written even if the root is missing.

## Fixture-only checks, not runtime evidence

These run in-process against the installed modules and are deterministic. They are not evidence
about the live OpenCode process:

- invalidation when an inspected file is edited, deleted, or the checked-out revision moves;
- an inspected file that is unchanged keeps its previous verdict;
- a claimed memory note that was never read, does not exist, or lies outside the resolved
  knowledge root is rejected; a note genuinely read this session is accepted;
- one session's completed discovery cannot authorize another session, both when sessions share a
  state object and when they hold separate states.

## Not probed

`patch` and `multiedit` are refused by tool name, but neither was observed in a live session, so
their runtime behaviour is **unverified** and remains marked PARTIAL rather than working.

Concurrency was exercised as two session ids and two state objects in one process. Two genuinely
simultaneous OpenCode processes were not run, so cross-process isolation is argued from
per-process in-memory state rather than measured.

## Probe 6 — a guarded phrase inside a heredoc is not a command

| | |
| --- | --- |
| Request | append a test whose *name* contains a Git verb phrase into a file, using a quoted heredoc |
| **Expected** | not guarded, because the phrase is data written to a file, not an executed command |
| **Actual** | not guarded |
| Verdict | pass, after the defect was fixed |

The guard previously substring-matched the whole command, so a test name containing a Git verb
phrase refused a file-append heredoc. The guard now reduces a command to its executed segments,
dropping heredoc bodies, quoted content, and trailing comments, and matches Git verb phrases only
against code rather than data. Covered by `test/guard-regression.test.mjs`, which also asserts
that real Git commands are still refused, including one whose commit message quotes a guarded
phrase.

## Probe 7 — a read that failed does not count as inspected context

| | |
| --- | --- |
| Request | read a file that does not exist, declare scope, then attempt to create it |
| **Expected** | the failed read is withdrawn, so the edit stays refused |
| **Actual** | refused, reporting degraded memory operation; the file was not created |
| Verdict | pass |

Reads were previously recorded at invocation, so a read that failed still counted as inspected
context. Reads are now withdrawn when the runtime reports failure, asserted by two cases in
`test/discovery.test.mjs`.

## Probe 8 — no relevant notes requires an observed, scoped search

| | |
| --- | --- |
| Request | claim that no relevant notes exist without recording what was searched |
| **Expected** | refused, naming the missing search scope |
| **Actual** | refused: `searched area memory-index.md was not actually read or searched this session` |
| Verdict | pass |

Requiring a scoped in-vault search initially made a brand-new project with no vault
unsatisfiable, because there was nothing to search. That case is now satisfied by a
filesystem-verifiable fact, that the knowledge root does not exist, rather than by trusting the
caller. An existing vault still requires a scoped, observed search.

## Retained limits after these fixes

- `patch` and `multiedit` remain refused by tool name only; never observed live.
- Session isolation is tested across session ids and across separate state objects in one
  process. Two simultaneous OpenCode processes were not run, so cross-process isolation is an
  assumption derived from per-process in-memory state, not a measurement.
- Readiness still does not reuse `src/task/evidence-resolution.mjs` trace events, and that module
  still does not check `project_id`.
- An existing OpenCode session keeps the guard version it started with. Installing a guard fix
  does not change a running session; only a restart picks it up.