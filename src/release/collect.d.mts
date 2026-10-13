export interface ReleaseTag {
  tag: string
  sha: string
  date: string
  version: {
    tag: string
    major: number
    minor: number
    patch: number
    prerelease: string | null
  } | null
}

export interface ReleaseTarget {
  ref: string
  sha: string
  branch: string | null
}

export interface ReleaseBoundaryPublication {
  state: string
  verified: boolean
  note: string | null
}

export interface ReleaseBoundary {
  verified: boolean
  provisional: boolean
  tag: string | null
  sha: string | null
  line: string | null
  source: string
  selected?: boolean
  publication?: ReleaseBoundaryPublication
  warning: string | null
}

export interface ChangeItem {
  key: string
  pr: number | null
  subject: string
  commit_count: number
  reverts: number
  added: number
  merged_via_pr: boolean
  reverted: boolean
}

export interface VersionSuggestion {
  version: string | null
  kind?: string
  based_on?: string
  provisional?: boolean
  reason: string
}

export function runGit(cwd: string, args: string[]): string

export function gitAvailable(cwd: string): boolean

export function parseVersion(tag: string): ReleaseTag["version"]

export function listTags(cwd: string): ReleaseTag[]

export function isAncestor(cwd: string, ancestor: string, descendant: string): boolean

export function resolveTarget(cwd: string, ref?: string): ReleaseTarget

export function defaultBranch(cwd: string): string | null

export function resolveBoundary(
  cwd: string,
  target: ReleaseTarget,
  options?: { releaseLine?: string; explicitBoundary?: string },
): ReleaseBoundary

export function collectChanges(cwd: string, boundarySha: string, targetSha: string): ChangeItem[]

export function suggestVersion(cwd: string, items: ChangeItem[], tags?: ReleaseTag[]): VersionSuggestion

export function hasEligibleChanges(items: ChangeItem[]): boolean