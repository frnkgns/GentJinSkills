import test from "node:test"
import assert from "node:assert/strict"
import {
  checkChangeDescription,
  convertNarrativeToConcise,
  renderChangeDescription,
  renderManualPrBlock,
  extractCopyablePrBlock,
  reportKeepsAuditOutsideBlock,
  splitBody,
} from "../src/reporting/change-description.mjs"

const USER_STYLE = `Improves tracing, optional Git safeguards, and engineering workflows.

1. Fixed tracing so OpenCode sessions can record activity.
2. Added optional Git safeguards that block restricted commands after setup.
3. Improved bug investigation so fixes start from observed evidence.
4. Strengthened testing guidance to check meaningful behavior.
5. Improved feature planning with clear requirements and implementation tasks.
6. Improved knowledge capture for bugs, terms, and important decisions.
7. Added guidance for creating and maintaining skills.`

const VERBOSE_NEGATIVE = `The trace plugin had never run once. Two separate defects, both verified
against the installed binary:

- Only .js and .ts are auto-discovered. A .mjs file in plugins/ is ignored
  silently, with no log line.
- Only an inline export default is invoked. A named export referenced as the
  default is imported and then discarded, which contradicts the documentation.

The plugin now ships as plugins/overgeared-skills-trace.js exporting only its default,
with its implementation moved to src/trace/plugin-body.mjs so tests can import
it without adding exports the loader would choke on. A live session now writes
schema-valid traces; previously it wrote nothing.

Verification: 117 tests, 11 evaluation scenarios, 8 negative controls.`

test("the user's own style is a positive example", () => {
  const result = checkChangeDescription(USER_STYLE)
  assert.equal(result.ok, true, result.findings.join("; "))
  assert.equal(result.items, 7)
})

test("the long plugin narrative is a negative example for the default body", () => {
  const result = checkChangeDescription(VERBOSE_NEGATIVE)
  assert.equal(result.ok, false)
  assert.equal(result.items, 0)
})

test("a numbered list followed by long technical paragraphs fails", () => {
  const mixed = `Summary line here.

1. Fixed the tracing plugin so sessions record activity.

Root Cause:
The loader only discovers .js files in plugins/, so the .mjs entry was silently
ignored by the plugin loader at startup, which meant no trace events were ever
written during any session and the coverage report always showed zero observed
hooks for the duration of the investigation period.`

  const result = checkChangeDescription(mixed)
  assert.equal(result.ok, false)
  assert.ok(result.findings.some((f) => /paragraph|section/i.test(f)))
  assert.ok(result.longestParagraph > 45)
})

test("a one-change branch produces one honest item rather than padding", () => {
  const single = `Updates the branch description rule.

1. Added the ready-to-paste manual pull request block.`
  const result = checkChangeDescription(single)
  assert.equal(result.ok, true, result.findings.join("; "))
  assert.equal(result.items, 1)
})

test("file paths and extensions fail the default body", () => {
  const withPaths = `Changes the loader.

1. Updated src/trace/plugin-body.mjs to export the trace writer.
2. Adjusted the config in opencode.jsonc.`
  const result = checkChangeDescription(withPaths)
  assert.equal(result.ok, false)
  assert.ok(result.findings.some((f) => /file path|extension/.test(f)))
})

test("a test inventory fails unless the caller explicitly allows it", () => {
  const withCounts = `Improves the workflow.

1. Added coverage for the new contract across 117 tests.
2. Improved the routing rules.`

  assert.equal(checkChangeDescription(withCounts).ok, false)
  assert.equal(checkChangeDescription(withCounts, { allowTestCounts: true }).ok, true)
})

test("a material limitation is retained concisely and does not fail the format", () => {
  const withLimitation = `Improves tracing and safeguards.

1. Fixed tracing so OpenCode sessions can record activity.
2. Added optional Git safeguards that block restricted commands after setup.
3. Live model runs are still pending because they need credentials.`
  const result = checkChangeDescription(withLimitation)
  assert.equal(result.ok, true, result.findings.join("; "))
})

test("an unverified universal success claim is rejected", () => {
  const overclaim = `Improves verification.

1. All 117 tests pass.
2. Improved routing.`
  assert.equal(checkChangeDescription(overclaim).ok, false)
  assert.equal(checkChangeDescription(overclaim, { evidenceProvided: true }).ok, true)
})

test("stack-trace-like content fails the format", () => {
  const withTrace = `Fixes the failure.

1. Reproduced the fault at src/trace/writer.mjs:88:12 in the writer path.
2. Corrected the span lookup.`
  assert.equal(checkChangeDescription(withTrace).ok, false)
})

test("a verbose narrative is converted into concise numbered outcomes", () => {
  const narrative = `The trace plugin had never run once. Two separate defects were verified
against the installed binary.

- The loader ignores files it does not recognize, so the trace plugin never started.
- Only an inline default export is invoked, which is why the old shape was dropped.

Live sessions now record activity that users can inspect afterward. Git
safeguards can be installed on request to block restricted commands. Bug
investigation now starts from observed evidence rather than a guess.

Verification: 117 tests, 11 evaluation scenarios, 8 negative controls.`

  const items = convertNarrativeToConcise(narrative)
  assert.ok(items.length >= 3, `expected several outcomes, got ${items.length}`)
  const rendered = renderChangeDescription(items, "Improves tracing, safeguards, and workflows.")
  const result = checkChangeDescription(rendered)
  assert.equal(result.ok, true, result.findings.join("; "))
  assert.ok(items.some((i) => /record activity/i.test(i)), "the user-facing outcome must survive")
  assert.equal(items.some((i) => /117 tests|verification/i.test(i)), false, "inventories must not survive")
})

test("conversion drops limit and defect meta-sections", () => {
  const items = convertNarrativeToConcise(`Not verified: live runs remain pending.

${VERBOSE_NEGATIVE}`)
  assert.equal(items.some((i) => /^Not verified/i.test(i)), false)
})

test("multi-commit work produces a summary of the whole final branch", () => {
  const branchSummary = renderChangeDescription(
    convertNarrativeToConcise(`${USER_STYLE}\n\n${VERBOSE_NEGATIVE}`),
    "Improves tracing, optional Git safeguards, and engineering workflows.",
  )
  const result = checkChangeDescription(branchSummary)
  assert.equal(result.ok, true, result.findings.join("; "))
  assert.ok(result.items >= 3)
})

test("splitBody separates the list from surrounding prose", () => {
  const { numbered, prose } = splitBody(USER_STYLE)
  assert.equal(numbered.length, 7)
  assert.equal(prose.length, 1)
  assert.match(prose[0], /Improves tracing/)
})

test("the ready-to-paste block is separate from the console report", () => {
  const body = renderChangeDescription(convertNarrativeToConcise(USER_STYLE), "Improves the workflow.")
  const report = [
    "Branch: GJ-16-example",
    "Jira: Example Change",
    "Commit: abc1234",
    "",
    "Notes",
    "1. Recorded the change description contract",
    "",
    "Documentation",
    "1. Change audit: vault/changes/example.md",
    "",
    renderManualPrBlock("Example Change", body),
    "",
    "RESULT: done",
  ].join("\n")

  const copyable = extractCopyablePrBlock(report)
  assert.ok(copyable, "a copyable block must be extractable")
  assert.equal(reportKeepsAuditOutsideBlock(report).ok, true)
  assert.equal(/Notes/.test(copyable.slice(copyable.indexOf("Title:"))), false)
})

test("a report with Notes inside the copyable block is detected", () => {
  const bad = ["--- ready-to-paste pull request ---", "Title:", "T", "", "Description:", "1. Did a thing.", "Notes", "1. leaked", "--- end ---"].join("\n")
  const check = reportKeepsAuditOutsideBlock(bad)
  assert.equal(check.ok, false)
  assert.match(check.reason, /leaked/)
})

test("a missing gh tool does not prevent producing the manual block", () => {
  const body = renderChangeDescription(["Fixed tracing so sessions record activity."], "Improves tracing.")
  const block = renderManualPrBlock("Improve Tracing", body)
  assert.ok(block.includes("Title:"))
  assert.ok(block.includes("Description:"))
  assert.equal(block.includes("--body-file"), false)
})

test("multiline bodies survive rendering without shell interpolation", () => {
  const items = [
    "Improved `git push` so it prints a ready-to-paste body.",
    "Kept $VAR and `backticks` and $(subshell) literal.",
  ]
  const rendered = renderChangeDescription(items, "Improves push reporting.")
  assert.equal(rendered.split("\n").filter((l) => l.trim()).length, 3)
  assert.ok(rendered.includes("$(subshell)"))
  assert.equal(checkChangeDescription(rendered).ok, true)
})