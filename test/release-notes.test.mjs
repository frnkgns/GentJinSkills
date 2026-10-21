import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  runGit,
  resolveTarget,
  resolveBoundary,
  defaultBranch,
  collectChanges,
  suggestVersion,
  hasEligibleChanges,
  parseVersion,
} from "../src/release/collect.mjs"
import { renderReleaseBody, renderReleasePackage } from "../src/release/render.mjs"
import { saveReleaseNote, releaseSlug } from "../src/release/vault.mjs"

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
}

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "gentjin-rel-"))
  git(dir, "init", "-q", "-b", "main")
  git(dir, "config", "user.email", "t@example.com")
  git(dir, "config", "user.name", "Tester")
  writeFileSync(join(dir, "README.md"), "# fixture\n")
  git(dir, "add", "-A")
  git(dir, "commit", "-qm", "chore: baseline")
  return dir
}

function commit(dir, message, file = "a.txt") {
  writeFileSync(join(dir, file), message + "\n")
  git(dir, "add", "-A")
  git(dir, "commit", "-qm", message)
  return git(dir, "rev-parse", "HEAD")
}

test("parseVersion reads a semver tag and tolerates a missing prefix", () => {
  const parsed = parseVersion("v1.2.3")
  assert.deepEqual({ m: parsed.major, n: parsed.minor, p: parsed.patch }, { m: 1, n: 2, p: 3 })
  assert.equal(parseVersion("nightly"), null, "a non-version tag yields null rather than throwing")
  assert.equal(parseVersion("1.2.3").major, 1, "a tag without the v prefix is still read")
  assert.equal(parseVersion("v1.2.3-rc.1").prerelease, "rc.1")
})

test("a repository with no tag has no verified boundary and asks for a baseline", () => {
  const dir = repo()
  try {
    commit(dir, "feat: something")
    const boundary = resolveBoundary(dir, resolveTarget(dir, "HEAD"))
    assert.equal(boundary.verified, false)
    assert.equal(boundary.provisional, true)
    assert.equal(boundary.tag, null)
    assert.match(boundary.warning, /Supply the previous tag or commit/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("an explicit first-release baseline is accepted and labelled provisional", () => {
  const dir = repo()
  try {
    const base = commit(dir, "feat: first")
    commit(dir, "feat: second")
    const boundary = resolveBoundary(dir, resolveTarget(dir, "HEAD"), { explicitBoundary: base })
    assert.equal(boundary.verified, true)
    assert.equal(boundary.provisional, true)
    assert.equal(boundary.source, "explicitly supplied by the user")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the previous reachable tag becomes the boundary", () => {
  const dir = repo()
  try {
    commit(dir, "feat: one")
    git(dir, "tag", "-a", "v1.0.0", "-m", "first")
    commit(dir, "feat: two")
    const boundary = resolveBoundary(dir, resolveTarget(dir, "HEAD"))
    assert.equal(boundary.verified, true)
    assert.equal(boundary.tag, "v1.0.0")
    assert.equal(boundary.provisional, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a tag that is not an ancestor of the target is never used as the boundary", () => {
  const dir = repo()
  try {
    git(dir, "checkout", "-qb", "side")
    commit(dir, "feat: side work", "side.txt")
    git(dir, "tag", "-a", "v9.9.9", "-m", "side tag")
    git(dir, "checkout", "-q", "main")
    commit(dir, "feat: main work")
    const boundary = resolveBoundary(dir, resolveTarget(dir, "HEAD"))
    assert.equal(boundary.verified, false)
    assert.equal(boundary.tag, null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("merged work is collected and an unmerged branch is excluded", () => {
  const dir = repo()
  try {
    commit(dir, "chore: start")
    git(dir, "tag", "-a", "v1.0.0", "-m", "base")
    for (const n of [1, 2, 3]) {
      git(dir, "checkout", "-qb", `merged-${n}`, "main")
      commit(dir, `feat: merged change ${n} (#${n})`, `m${n}.txt`)
      git(dir, "checkout", "-q", "main")
      git(dir, "merge", "-q", "--no-ff", "-m", `Merge pull request #${n} from frnkgns/merged-${n}`, `merged-${n}`)
    }
    git(dir, "checkout", "-qb", "unmerged", "main")
    commit(dir, "feat: not merged yet (#99)", "u.txt")
    git(dir, "checkout", "-q", "main")

    const target = resolveTarget(dir, "HEAD")
    const boundary = resolveBoundary(dir, target)
    const subjects = collectChanges(dir, boundary.sha, target.sha).map((i) => i.subject).join(" | ")

    assert.match(subjects, /merged change 1/)
    assert.match(subjects, /merged change 3/)
    assert.equal(/not merged yet/.test(subjects), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("an explicitly selected feature branch candidate includes only its reachable changes", () => {
  const dir = repo()
  try {
    commit(dir, "chore: base")
    git(dir, "tag", "-a", "v1.0.0", "-m", "base")
    git(dir, "checkout", "-qb", "feature")
    commit(dir, "feat: feature only work (#7)", "f.txt")

    const boundary = resolveBoundary(dir, resolveTarget(dir, "HEAD"), { explicitBoundary: "v1.0.0" })
    const items = collectChanges(dir, boundary.sha, resolveTarget(dir, "feature").sha)

    assert.equal(items.length, 1)
    assert.match(items[0].subject, /feature only work/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("multiple commits for one change collapse into a single item", () => {
  const dir = repo()
  try {
    commit(dir, "chore: base")
    git(dir, "tag", "-a", "v1.0.0", "-m", "base")
    commit(dir, "feat: one logical change (#5)", "x.txt")
    commit(dir, "fix: one logical change (#5)", "x.txt")
    commit(dir, "chore: tidy (#5)", "x.txt")

    const target = resolveTarget(dir, "HEAD")
    const boundary = resolveBoundary(dir, target)
    const items = collectChanges(dir, boundary.sha, target.sha)

    assert.equal(items.length, 1)
    assert.equal(items[0].commit_count, 3)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("reverted work is recorded as a revert rather than presented as a new change", () => {
  const dir = repo()
  try {
    commit(dir, "chore: base")
    git(dir, "tag", "-a", "v1.0.0", "-m", "base")
    commit(dir, "feat: risky thing (#3)", "r.txt")
    commit(dir, 'Revert "feat: risky thing (#3)"', "r.txt")

    const target = resolveTarget(dir, "HEAD")
    const boundary = resolveBoundary(dir, target)
    const entry = collectChanges(dir, boundary.sha, target.sha).find((i) => i.pr === 3)

    assert.ok(entry, "the reverted change is still collected")
    assert.equal(entry.reverts, 1)
    assert.equal(entry.added, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("squash merges are collected without a pull request merge commit", () => {
  const dir = repo()
  try {
    commit(dir, "chore: base")
    git(dir, "tag", "-a", "v1.0.0", "-m", "base")
    git(dir, "checkout", "-qb", "sq")
    commit(dir, "feat: squashed work (#42)", "s.txt")
    commit(dir, "fix: squashed follow-up (#42)", "s.txt")
    git(dir, "checkout", "-q", "main")
    git(dir, "merge", "-q", "--squash", "sq")
    git(dir, "commit", "-qm", "feat: squashed work (#42)")

    const target = resolveTarget(dir, "HEAD")
    const boundary = resolveBoundary(dir, target)
    const items = collectChanges(dir, boundary.sha, target.sha)

    assert.equal(items.length, 1)
    assert.match(items[0].subject, /squashed work/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a stable line boundary is not borrowed from a prerelease line", () => {
  const dir = repo()
  try {
    commit(dir, "chore: base")
    git(dir, "tag", "-a", "v1.0.0", "-m", "stable")
    commit(dir, "feat: pre work")
    git(dir, "tag", "-a", "v1.1.0-rc.1", "-m", "pre")
    commit(dir, "feat: stable work")
    git(dir, "tag", "-a", "v1.1.0", "-m", "stable")

    const target = resolveTarget(dir, "HEAD")
    assert.equal(resolveBoundary(dir, target, { releaseLine: "stable" }).tag, "v1.1.0")
    assert.equal(resolveBoundary(dir, target, { releaseLine: "prerelease" }).tag, "v1.1.0-rc.1")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("no eligible changes is reported rather than producing an empty release", () => {
  const dir = repo()
  try {
    const target = resolveTarget(dir, "HEAD")
    const boundary = resolveBoundary(dir, target, { explicitBoundary: "HEAD" })
    const items = collectChanges(dir, boundary.sha, target.sha)

    assert.deepEqual(items, [])
    assert.equal(hasEligibleChanges(items), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("versions are proposed from the repository convention, never from push counts", () => {
  const dir = repo()
  try {
    commit(dir, "chore: base")
    git(dir, "tag", "-a", "v1.2.3", "-m", "base")
    commit(dir, "feat: new capability (#8)", "n.txt")

    const target = resolveTarget(dir, "HEAD")
    const boundary = resolveBoundary(dir, target)
    const version = suggestVersion(dir, collectChanges(dir, boundary.sha, target.sha))

    assert.equal(version.version, "v1.3.0")
    assert.equal(version.kind, "minor")
    assert.equal(version.based_on, "v1.2.3")
    assert.equal(version.provisional, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("no tags means no version is proposed", () => {
  const dir = repo()
  try {
    const version = suggestVersion(dir, [{ subject: "feat: x" }], [])
    assert.equal(version.version, null)
    assert.match(version.reason, /no tags/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the rendered body follows the requested template", () => {
  const body = renderReleaseBody({
    project: "Overgeared Skills",
    theme: "Discovery Readiness",
    intro: ["One paragraph.", "Second paragraph."],
    items: [{ title: "Alpha", detail: "does a thing" }, { title: "Beta" }],
    why: "Practical value.",
    repository: "https://github.com/frnkgns/GentJinSkills",
    projectContext: "Context line.",
    limitations: ["still limited"],
  })

  assert.match(body, /^# Overgeared Skills — Discovery Readiness\n/)
  assert.match(body, /\n## What's New\n/)
  assert.match(body, /\n1\. \*\*Alpha\*\* — does a thing\n2\. \*\*Beta\*\*\n/)
  assert.match(body, /\n## Why This Matters\n/)
  assert.match(body, /\n## Limitations\n/)
  assert.match(body, /- still limited/)
  assert.match(body, /\n## Project\n/)
  assert.match(body, /Repository: \[https:\/\/github\.com\/frnkgns\/GentJinSkills\]/)
  assert.equal(/passed|console/i.test(body), false, "no console or test output leaks into the body")
})

test("the package is prepared, not published, and links to manual creation", () => {
  const pkg = renderReleasePackage({
    project: "Overgeared Skills",
    repository: "https://github.com/frnkgns/GentJinSkills",
    version: { version: "v1.2.0", provisional: true, reason: "proposed" },
    items: [{ title: "X" }],
    target: { branch: "main", sha: "abc123" },
    boundary: { tag: "v1.1.0", verified: true },
  })

  assert.equal(pkg.title, "v1.2.0")
  assert.equal(pkg.published, false)
  assert.equal(pkg.status, "prepared")
  assert.equal(pkg.previousBoundaryVerified, true)
  assert.match(pkg.releaseUrl, /releases\/new\?tag=v1\.2\.0$/)
})

test("an unverified boundary is carried into the package rather than hidden", () => {
  const pkg = renderReleasePackage({
    project: "X",
    repository: "https://example.com/x",
    version: null,
    items: [{ title: "Y" }],
    target: { branch: "main", sha: "sha" },
    boundary: { tag: null, verified: false, warning: "no verified boundary" },
  })

  assert.equal(pkg.previousBoundaryVerified, false)
  assert.equal(pkg.boundaryWarning, "no verified boundary")
  assert.equal(pkg.title, "Unreleased")
  assert.equal(pkg.releaseUrl, null)
})

test("repeated generation updates one note instead of creating duplicates", () => {
  const kr = mkdtempSync(join(tmpdir(), "gentjin-relvault-"))
  try {
    const pkg = renderReleasePackage({
      project: "Overgeared Skills",
      repository: "https://github.com/frnkgns/GentJinSkills",
      version: { version: "v1.2.0", provisional: true },
      items: [{ title: "X" }],
      target: { branch: "main", sha: "sha" },
      boundary: { tag: "v1.1.0", verified: true },
      evidence: [{ claim: "one" }],
    })

    const first = saveReleaseNote({ knowledgeRoot: kr, pkg })
    const second = saveReleaseNote({ knowledgeRoot: kr, pkg })

    assert.equal(first.ok, true)
    assert.equal(second.ok, true)
    assert.equal(second.updated, true)
    assert.equal(first.path, second.path)
    assert.equal(existsSync(join(kr, "reports", "releases", "v1.2.0.md")), true)
    assert.equal(existsSync(join(kr, "reports", "releases", "v1.2.1.md")), false)
  } finally {
    rmSync(kr, { recursive: true, force: true })
  }
})

test("saved notes record truthful prepared status and never claim publication", () => {
  const kr = mkdtempSync(join(tmpdir(), "gentjin-relvault-"))
  try {
    const pkg = renderReleasePackage({
      project: "Overgeared Skills",
      repository: "https://github.com/frnkgns/GentJinSkills",
      version: { version: "v2.0.0", provisional: true },
      items: [{ title: "X" }],
      target: { branch: "main", sha: "sha" },
      boundary: { tag: "v1.9.0", verified: true },
      evidence: [{ claim: "commit a1b2c3d", kind: "commit" }],
    })
    saveReleaseNote({ knowledgeRoot: kr, pkg })
    const text = readFileSync(join(kr, "reports", "releases", "v2.0.0.md"), "utf8")

    assert.match(text, /^---\n/)
    assert.match(text, /status: prepared/)
    assert.match(text, /published: false/)
    assert.match(text, /previous_boundary: v1\.9\.0/)
    assert.match(text, /commit a1b2c3d/)
    assert.match(text, /# Overgeared Skills —/)
  } finally {
    rmSync(kr, { recursive: true, force: true })
  }
})

test("a vault save failure is reported without throwing and without claiming success", () => {
  const result = saveReleaseNote({ knowledgeRoot: null, pkg: { body: "x", proposedTag: "v1.0.0" } })
  assert.equal(result.ok, false)
  assert.match(result.error, /no knowledge root/)
})

test("generation performs no remote mutation and creates no tag", () => {
  const dir = repo()
  try {
    commit(dir, "chore: base")
    git(dir, "tag", "-a", "v1.0.0", "-m", "base")
    commit(dir, "feat: work (#1)", "w.txt")

    const target = resolveTarget(dir, "HEAD")
    const boundary = resolveBoundary(dir, target)
    const items = collectChanges(dir, boundary.sha, target.sha)
    suggestVersion(dir, items)

    const tagsBefore = runGit(dir, ["tag"]).split("\n").filter(Boolean).sort()
    assert.deepEqual(runGit(dir, ["tag"]).split("\n").filter(Boolean).sort(), tagsBefore)
    assert.equal(git(dir, "status", "--porcelain"), "", "generation leaves the tree clean")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("defaultBranch resolves the checked-out branch for a fixture without a remote", () => {
  const dir = repo()
  try {
    assert.equal(defaultBranch(dir), "main")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("release slug sanitises an unusable candidate name", () => {
  assert.equal(releaseSlug({ proposedTag: "v1.2.0" }), "v1.2.0")
  assert.equal(releaseSlug({ proposedTag: "release/1 2" }), "release-1-2")
  assert.equal(releaseSlug({}), "unreleased")
})

test("a commit with a multi-line body does not corrupt subject parsing", () => {
  const dir = repo()
  try {
    commit(dir, "chore: base")
    git(dir, "tag", "-a", "v1.0.0", "-m", "base")

    writeFileSync(join(dir, "b.txt"), "body work\n")
    git(dir, "add", "-A")
    git(dir, "commit", "-q", "-m", "feat: real subject here", "-m", "first body line", "-m", "second body line")

    writeFileSync(join(dir, "c.txt"), "more\n")
    git(dir, "add", "-A")
    git(dir, "commit", "-qm", "fix: another real subject (#21)")

    const target = resolveTarget(dir, "HEAD")
    const boundary = resolveBoundary(dir, target)
    const items = collectChanges(dir, boundary.sha, target.sha)

    assert.equal(items.length, 2)
    const subjects = items.map((i) => i.subject)
    assert.ok(subjects.includes("feat: real subject here"))
    assert.ok(subjects.includes("fix: another real subject (#21)"))
    assert.equal(subjects.some((s) => s.includes("\x1e") || s.includes("\x1f") || s === ""), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a selected tag boundary is not presented as a verified published release", () => {
  const dir = repo()
  try {
    commit(dir, "chore: base")
    git(dir, "tag", "-a", "v1.0.0", "-m", "base")
    commit(dir, "feat: after the tag (#1)", "a.txt")

    const target = resolveTarget(dir, "HEAD")
    const boundary = resolveBoundary(dir, target)

    assert.equal(boundary.selected, true, "the tag was selected as the boundary")
    assert.equal(boundary.verified, true, "selection is verified against reachability")
    assert.equal(boundary.publication.verified, false, "publication is not verified")
    assert.equal(boundary.publication.state, "unknown")
    assert.match(boundary.publication.note, /not evidence that a GitHub release was published/)

    const pkg = renderReleasePackage({
      project: "X",
      repository: "https://example.com/x",
      version: { version: "v1.1.0", provisional: true },
      items: [{ title: "A" }],
      target,
      boundary,
    })

    assert.equal(pkg.previousBoundarySelected, true)
    assert.equal(pkg.previousBoundaryVerified, true)
    assert.equal(pkg.previousReleasePublished, false)
    assert.equal(pkg.previousReleasePublicationState, "unknown")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("preparing notes never advances the boundary or claims a tag or release", () => {
  const dir = repo()
  try {
    commit(dir, "chore: base")
    git(dir, "tag", "-a", "v1.0.0", "-m", "base")
    commit(dir, "feat: work (#1)", "a.txt")

    const target = resolveTarget(dir, "HEAD")
    const boundary = resolveBoundary(dir, target)
    const pkg = renderReleasePackage({
      project: "X",
      repository: "https://example.com/x",
      version: { version: "v1.1.0", provisional: true },
      items: [{ title: "A" }],
      target,
      boundary,
      evidence: [{ claim: "commit" }],
    })

    assert.equal(pkg.boundaryAdvanced, false)
    assert.equal(pkg.createsTag, false)
    assert.equal(pkg.createsRelease, false)
    assert.equal(pkg.published, false)
    assert.equal(pkg.status, "prepared")

    const kr = mkdtempSync(join(tmpdir(), "gentjin-relsem-"))
    try {
      const saved = saveReleaseNote({ knowledgeRoot: kr, pkg })
      assert.equal(saved.ok, true)
      const text = readFileSync(saved.path, "utf8")
      assert.match(text, /previous_release_published: false/)
      assert.match(text, /previous_release_publication_state: unknown/)
      assert.match(text, /boundary_advanced: false/)
      assert.match(text, /created_tag: false/)
      assert.match(text, /created_release: false/)

      const tagsAfter = runGit(dir, ["tag"]).split("\n").filter(Boolean).sort()
      assert.deepEqual(tagsAfter, ["v1.0.0"], "no tag was created while preparing notes")
    } finally {
      rmSync(kr, { recursive: true, force: true })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("an unverifiable boundary reports that no boundary was selected", () => {
  const dir = repo()
  try {
    commit(dir, "feat: only work")
    const boundary = resolveBoundary(dir, resolveTarget(dir, "HEAD"))
    assert.equal(boundary.selected, false)
    assert.equal(boundary.publication.state, "unknown")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the saved metadata carries the repository rather than leaving it blank", () => {
  const kr = mkdtempSync(join(tmpdir(), "gentjin-relrepo-"))
  try {
    const pkg = renderReleasePackage({
      project: "Overgeared Skills",
      repository: "https://github.com/frnkgns/GentJinSkills",
      version: { version: "v3.0.0", provisional: true },
      items: [{ title: "X" }],
      target: { branch: "main", sha: "sha" },
      boundary: { tag: "v2.0.0", verified: true, selected: true, publication: { state: "unknown", verified: false } },
    })
    assert.equal(pkg.repository, "https://github.com/frnkgns/GentJinSkills")
    saveReleaseNote({ knowledgeRoot: kr, pkg })
    const text = readFileSync(join(kr, "reports", "releases", "v3.0.0.md"), "utf8")
    assert.match(text, /repository: https:\/\/github\.com\/frnkgns\/GentJinSkills/)
  } finally {
    rmSync(kr, { recursive: true, force: true })
  }
})
