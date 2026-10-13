import type { ChangeItem, ReleaseBoundary, ReleaseTarget, VersionSuggestion } from "./collect.d.mts"

export interface ReleaseItem {
  title?: string
  detail?: string
}

export interface ReleaseEvidence {
  kind: string
  reference: string
  subject?: string
}

export interface RenderReleaseOptions {
  project?: string
  theme?: string
  repository?: string
  projectContext?: string
  intro?: string[]
  items?: ReleaseItem[]
  why?: string
  limitations?: string[]
  breaking?: string[]
  target?: ReleaseTarget
  targetBranch?: string | null
  boundary?: Partial<ReleaseBoundary>
  tag?: string | null
  version?: VersionSuggestion | null
  evidence?: ReleaseEvidence[]
}

export interface ReleasePackage {
  repository: string | null
  title: string
  proposedTag: string | null
  provisionalVersion: boolean
  versionReason: string | null
  targetBranch: string | null
  targetSha: string | null
  previousBoundary: string | null
  previousBoundarySelected: boolean
  previousBoundaryVerified: boolean
  previousReleasePublished: boolean
  previousReleasePublicationState: string
  publicationNote: string | null
  boundaryWarning: string | null
  releaseUrl: string | null
  body: string
  status: string
  published: false
  boundaryAdvanced: false
  createsTag: false
  createsRelease: false
  evidence: ReleaseEvidence[]
}

export function sanitize(text: string): string

export function renderItems(items?: ReleaseItem[]): string

export function renderReleaseBody(options: RenderReleaseOptions): string

export function releaseUrl(input: { repository?: string | null; tag?: string | null }): string | null

export function renderReleasePackage(options: RenderReleaseOptions): ReleasePackage