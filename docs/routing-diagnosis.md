# Diagnosis: natural-language routing to real instruction loading

## Status under OpenCode 2.0.28

The diagnosis and the fix it led to both stand. The three hooks it relies on still exist, and the
plugins now register them under their V2 names: a plugin-owned tool via `ctx.tool.transform`, and
`tool.execute.before` via `ctx.tool.hook("execute.before", ...)`. The version reference in the
section below is historical; the mechanism it describes is current.

## Message to action path, as observed

A plain user message with no slash prefix reaches the model with no enforced link to any
capability body. Skill and command *metadata* is visible as instructions text; the *body* is
not. Nothing in the runtime forced the body to be read before an action was taken. The result
was that a model holding a correct `AGENTS.md` could still bypass the canonical workflow by
running a plausible custom script, because the rule existed only as prose.

OpenCode `1.18.35` offers three hooks that close this gap. All three were confirmed by probe, not
by reading documentation:

- a plugin-registered tool, which the model may call like any other, and
- `tool.execute.before`, which can throw and prevent a tool call from running.

Both were confirmed live, not assumed:

```
tool.execute.before -> throws    : a mutating command was blocked mid-session
tool.execute.before -> allows    : read-only inspection of the same path proceeded
event session.idle    -> fires    : completion check ran and wrote its findings
```

The third was found only after an earlier claim that no completion hook existed proved wrong.
A model asked from memory reported that `session.idle` was the only viable signal; a probe then
confirmed it. The lesson generalises: the plugin API cannot be established from recall.

## Loading contract, empirically confirmed

Plugin autoload has three non-obvious requirements. Each was found by a failing probe, not by
documentation:

| Requirement | Failure mode when ignored |
| --- | --- |
| File extension must be `.js` or `.ts` | `.mjs` is silently ignored, with no error |
| Entry must be an inline `export default async (ctx) => {}` | A named alias imported via `export default P` loads but is never invoked |
| Plugin must export *only* the default | Additional named exports can prevent the entry from being recognized |

## Root cause of the original bypass

Not a missing instruction. The rule was present and correct in both the global and repository
`AGENTS.md`. The cause was that enforcement lived only in prose, so compliance depended on the
model's judgment at the moment it chose a shortcut. Runtime enforcement was required.

Three defects were found only by testing against the running binary:

1. `GENTJIN_ROOT` was unset, so registry construction threw inside the plugin factory and the
   plugin failed to register anything, silently. The guard appeared configured but was absent.
2. The guard matched on path alone, so a read-only `cat` of a manifest was blocked. Blocking
   reads trains the user to expect spurious refusals and teaches them to bypass.
3. `node sync.mjs ~/.config/opencode` was allowed. This is precisely the bypass case that
   motivated the work, and the original pattern missed it.

## Where bypass remains possible

Recorded plainly, because the guard is a workflow guard and not a security boundary:

- Command matching is string-based. An equivalent operation expressed outside the recognized
  patterns can evade it.
- Selection accuracy is verified in process, not as live model behavior. A model that never
  selects a capability is not caught by this layer.
- The guard protects the *installation payload*; it does not and cannot constrain arbitrary
  filesystem writes elsewhere.

## What closes the gap

`registry/capabilities.json` gives every capability one canonical identity and kind.
`src/capabilities/resolve.mjs` maps a request to exactly one of them, or explicitly to no
action. `gentjin_capability` serves the real body. `tool.execute.before` refuses a governed
mutation until that body is loaded, naming the owning capability and how to load it. Four
states remain distinct so that selecting a capability can never be reported as following it.

Deliberately unresolved: live natural-language routing accuracy across all capabilities needs
authorized credentials and is tracked separately. It is not claimed as verified.