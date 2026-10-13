import type { ReleasePackage } from "./render.d.mts"

export interface SaveReleaseNoteResult {
  ok: boolean
  path?: string
  updated?: boolean
  error?: string
}

export interface SaveReleaseNoteInput {
  knowledgeRoot?: string | null
  pkg: ReleasePackage
  body?: string
}

export function releaseSlug(pkg: ReleasePackage): string

export function releaseNotePath(knowledgeRoot: string, pkg: ReleasePackage): string

export function renderMetadata(pkg: ReleasePackage): string

export function saveReleaseNote(input: SaveReleaseNoteInput): SaveReleaseNoteResult