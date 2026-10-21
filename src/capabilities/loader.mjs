import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  completionFindings,
  createSessionState,
  isGuardedAction,
  loadCapabilityBody,
  markLoaded,
  markSelected,
} from "./adherence.mjs"
import { buildCapabilityRegistry } from "./registry.mjs"
import { findCapability, findCapabilityOfKind } from "./resolve.mjs"

export const PLUGIN_NAME = "overgeared-skills-capabilities"

function currentRevision(opencodeRoot) {
  try {
    return readFileSync(join(opencodeRoot, ".overgeared-skills", "version.json"), "utf8").trim()
  } catch {
    return null
  }
}

export function createLoader(options = {}) {
  const opencodeRoot =
    options.opencodeRoot ?? process.env.OVERGEARED_SKILLS_ROOT ?? process.env.GENTJIN_ROOT
  const registry = options.registry ?? buildCapabilityRegistry(options.repoRoot ?? opencodeRoot)
  const state = createSessionState()
  const loaded = new Map()

  function resolve(id, kind) {
    return kind ? findCapabilityOfKind(registry, id, kind) : findCapability(registry, id)
  }

  return {
    registry,
    state,
    get opencodeRoot() {
      return opencodeRoot
    },

    load(id, kind) {
      const found = resolve(id, kind)
      if (!found.found) return { ok: false, reason: found.reason }

      const capability = found.capability
      const revision = currentRevision(opencodeRoot)

      const cached = loaded.get(id)
      if (cached) {
        if (cached.revision !== revision) {
          loaded.delete(id)
        } else {
          markSelected(state, capability, { source: "reuse" })
          return {
            ok: true,
            cached: true,
            id,
            kind: capability.kind,
            path: cached.path,
            bytes: cached.bytes,
            instructions: cached.body,
            revision: cached.revision,
            exclusions: capability.exclusions ?? [],
            references: capability.references ?? [],
            required_preconditions: capability.required_preconditions ?? [],
          }
        }
      }

      const read = loadCapabilityBody(registry, capability, opencodeRoot)
      if (!read.ok) return { ok: false, id, kind: capability.kind, reason: read.reason }

      loaded.set(id, { ...read, revision })
      markSelected(state, capability, { source: "explicit", at: new Date().toISOString() })
      markLoaded(state, capability, { path: read.path, bytes: read.bytes, revision })

      return {
        ok: true,
        id,
        kind: capability.kind,
        path: read.path,
        bytes: read.bytes,
        revision,
        instructions: read.body,
        exclusions: capability.exclusions ?? [],
        references: capability.references ?? [],
        required_preconditions: capability.required_preconditions ?? [],
      }
    },

    isLoaded(id) {
      return loaded.has(id)
    },

    checkCommand(command) {
      return isGuardedAction(command, registry)
    },

    compliance(id) {
      return completionFindings(state, id)
    },

    completionReport() {
      const findings = []
      for (const [id, entry] of state.capabilities) {
        if (!entry.instructions_loaded) continue
        const result = completionFindings(state, id)
        if (result.ok) continue
        findings.push({
          id,
          kind: entry.kind ?? null,
          loaded: true,
          performed: entry.required_steps_performed,
          verified: entry.outcome_verified,
          reasons: result.reasons,
        })
      }
      return { checked_at: new Date().toISOString(), findings }
    },

    requireLoaded(id) {
      if (!loaded.has(id)) {
        throw new Error(
          `"${id}" owns this action but its instructions were not loaded in this session. ` +
            `Call the overgeared_skills_capability tool with id "${id}" first, then follow those instructions.`,
        )
      }
      return loaded.get(id)
    },
  }
}
