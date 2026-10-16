import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const skill = readFileSync(
  join(process.cwd(), "skills", "project-conventions", "SKILL.md"),
  "utf8",
)
const agents = readFileSync(join(process.cwd(), "AGENTS.md"), "utf8")

/**
 * The smallest-complete-change ladder was added after an audit found the rungs already scattered
 * across AGENTS.md and this skill, but never ordered. Each rung existed; the order did not, so an
 * agent could satisfy "reuse" and still add a dependency. These tests hold the order, because an
 * unordered ladder is indistinguishable from having no ladder.
 */

const LADDER = "## The Smallest Complete Change"

test("the ladder exists in the skill that governs implementation choices", () => {
  assert.ok(skill.includes(LADDER), `${LADDER} is missing from project-conventions`)
})

test("the ladder keeps its rungs in order and stops at the minimum that works", () => {
  const rungs = [
    "Does it need to exist?",
    "Is it already in this project?",
    "Does the language or runtime already do it?",
    "Is it already installed?",
    "Is it one line a reader gets at a glance?",
    "Otherwise: the minimum that works.",
  ]
  const positions = rungs.map((rung) => skill.indexOf(rung))
  for (const [index, position] of positions.entries()) {
    assert.notEqual(position, -1, `rung ${index + 1} is missing: ${rungs[index]}`)
  }
  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(
      positions[i] > positions[i - 1],
      `rung ${i + 1} ("${rungs[i]}") appears before rung ${i} ("${rungs[i - 1]}")`,
    )
  }
})

test("the ladder forbids the shortcuts that make small code incorrect", () => {
  const mustState = [
    "Never add a dependency for a few lines of code",
    "A one-liner that needs decoding is not short",
    "Lazy about the solution, never about the change itself",
  ]
  for (const phrase of mustState) {
    assert.ok(skill.includes(phrase), `missing from the ladder: ${phrase}`)
  }
})

test("the ladder never cuts a correctness or safety boundary", () => {
  const neverCut = [
    "validation at trust boundaries",
    "error handling that prevents data loss",
    "authorization",
    "security",
    "accessibility",
    "required logging",
  ]
  const block = skill.slice(skill.indexOf(LADDER), skill.indexOf("## Comments"))
  for (const item of neverCut) {
    assert.ok(block.includes(item), `never-cut list is missing: ${item}`)
  }
})

test("the ladder resolves the four decisions that are easy to get wrong", () => {
  const decisions = ["Reuse wins.", "A new helper is justified.", "Shorter would introduce a defect.", "Doing nothing is correct."]
  for (const decision of decisions) {
    assert.ok(skill.includes(decision), `worked decision missing: ${decision}`)
  }
})

test("AGENTS.md carries the ladder so it applies without loading the skill", () => {
  // The skill only loads when relevant. The rule has to survive in the always-loaded file too.
  assert.match(agents, /smallest change that fully solves the task/)
  assert.match(agents, /only then new code/)
  assert.match(agents, /Name what you skipped/)
})

test("AGENTS.md and the skill never disagree about the dependency rule", () => {
  // A second wording of "avoid unnecessary dependencies" already existed; the ladder must extend it
  // rather than quietly replace it with a weaker rule.
  assert.match(agents, /Do not introduce unnecessary dependencies/)
  assert.match(skill, /Never add a dependency for a few lines of code/)
})
