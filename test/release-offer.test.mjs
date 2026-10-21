import test from "node:test"
import assert from "node:assert/strict"
import { decideOffer, OFFER_TEXT } from "../src/release/offer.mjs"

test("the offer is one short question", () => {
  assert.match(OFFER_TEXT, /^Would you like paste-ready release notes for the changes since the previous release\?$/)
  assert.equal(OFFER_TEXT.includes("\n"), false)
})

test("no offer when the push did not succeed", () => {
  const d = decideOffer({ pushSucceeded: false, eligibleChanges: 5 })
  assert.equal(d.offer, false)
  assert.equal(d.run, false)
  assert.match(d.reason, /did not succeed/)
})

test("a successful push with eligible changes offers exactly once", () => {
  const d = decideOffer({ pushSucceeded: true, eligibleChanges: 3 })
  assert.equal(d.offer, true)
  assert.equal(d.run, false)
  assert.equal(d.text, OFFER_TEXT)
})

test("declining does not loop on the same push", () => {
  const first = decideOffer({ pushSucceeded: true, eligibleChanges: 3, declinedThisPush: true })
  assert.equal(first.offer, false)
  assert.match(first.reason, /do not loop/)

  const again = decideOffer({ pushSucceeded: true, eligibleChanges: 3, offeredThisPush: true })
  assert.equal(again.offer, false)
  assert.match(again.reason, /already offered/)
})

test("a later push may offer again after an earlier decline", () => {
  const declined = decideOffer({ pushSucceeded: true, eligibleChanges: 3, declinedThisPush: true })
  assert.equal(declined.offer, false)

  const later = decideOffer({ pushSucceeded: true, eligibleChanges: 3 })
  assert.equal(later.offer, true, "decline is scoped to one push, not the branch forever")
})

test("an already explicit request is honoured without asking again", () => {
  const d = decideOffer({ pushSucceeded: true, eligibleChanges: 3, userRequested: true })
  assert.equal(d.offer, false)
  assert.equal(d.run, true)
  assert.match(d.reason, /already asked/)
})

test("no empty release is offered when nothing is eligible", () => {
  for (const n of [0, undefined]) {
    const d = decideOffer({ pushSucceeded: true, eligibleChanges: n })
    assert.equal(d.offer, false)
    assert.match(d.reason, /no eligible changes/)
  }
})

test("declining leaves the changes eligible for a future release", () => {
  const d = decideOffer({ pushSucceeded: true, eligibleChanges: 4, declinedThisPush: true })
  assert.equal(d.released, undefined)
  assert.equal(d.run, false)
  assert.equal(d.offer, false)
})
import { readFileSync } from "node:fs"
import { join } from "node:path"

test("the release workflow is reachable through a plugin-owned tool, not an external path", () => {
  const source = readFileSync(join(process.cwd(), "plugins", "overgeared-skills-capabilities.ts"), "utf8")

  assert.match(source, /name: "gentjin_release_notes"/, "the plugin must own the release-notes tool")
  assert.match(source, /action === "collect"|args\?\.action === "collect"/)
  assert.match(source, /renderReleasePackage/)
  assert.match(source, /saveReleaseNote/)
  assert.match(
    source,
    /from "\.\.\/src\/release\/collect\.mjs"/,
    "the plugin imports the modules directly, so no external-directory permission is needed",
  )
})

test("the release tool never claims to publish or create a tag", () => {
  const source = readFileSync(join(process.cwd(), "plugins", "overgeared-skills-capabilities.ts"), "utf8")
  const block = source.slice(
    source.indexOf('name: "gentjin_release_notes"'),
    source.indexOf('name: "gentjin_discovery"'),
  )
  assert.match(block, /boundary_advanced: pkg\.boundaryAdvanced/)
  assert.match(block, /created_tag: pkg\.createsTag/)
  assert.match(block, /published: pkg\.published/)
  assert.equal(/gh release create|git tag -a|git push --tags/.test(block), false)
})
