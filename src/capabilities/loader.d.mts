export type CapabilityKind = "command" | "skill" | "reference"

export interface Capability {
  id: string
  kind: CapabilityKind
  name: string
  path: string
  description?: string
  intent?: string[]
  aliases?: string[]
  exclusions?: string[]
  references?: string[]
  parent?: string
  guarded?: boolean
}

export interface CapabilityRegistry {
  schema_version: number
  capabilities: Capability[]
}

export interface LoadResult {
  ok: boolean
  reason?: string
  id?: string
  kind?: CapabilityKind
  path?: string
  bytes?: number
  revision?: string | null
  instructions?: string
  cached?: boolean
  exclusions?: string[]
  references?: string[]
  required_preconditions?: string[]
}

export interface AdherenceState {
  id: string
  selected: boolean
  instructions_loaded: boolean
  required_steps_performed: boolean
  outcome_verified: boolean
}

export interface CompletionFindings {
  ok: boolean
  reasons: string[]
  adherence?: AdherenceState
}

export interface GuardVerdict {
  guarded: boolean
  reason?: string
  owners?: { capability: Capability; matched: string }[]
  capability?: Capability
  matched?: string
}

export interface CompletionReport {
  checked_at: string
  findings: {
    id: string
    kind: CapabilityKind | null
    loaded: boolean
    performed: boolean
    verified: boolean
    reasons: string[]
  }[]
}

export interface CapabilityLoader {
  registry: CapabilityRegistry
  readonly opencodeRoot: string
  load(id?: string, kind?: string): LoadResult
  isLoaded(id: string): boolean
  checkCommand(command: string): GuardVerdict
  compliance(id: string): CompletionFindings
  completionReport(): CompletionReport
  requireLoaded(id: string): unknown
}

export function createLoader(options?: { opencodeRoot?: string; repoRoot?: string; registry?: CapabilityRegistry }): CapabilityLoader