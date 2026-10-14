import { isAbsolute, resolve } from "node:path"
import { isWithin } from "./resolve.mjs"

export const READINESS = {
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  READY: "ready",
  DEGRADED: "degraded",
  BLOCKED: "blocked",
}

export function createDiscoveryRecord(resolution) {
  return {
    schema_version: 1,
    status: READINESS.NOT_STARTED,
    project_root: resolution.project_root,
    root_source: resolution.root_source,
    identity: resolution.identity,
    identity_source: resolution.identity_source,
    identifier: resolution.identifier,
    knowledge_root: resolution.knowledge_root,
    knowledge_root_source: resolution.knowledge_root_source,
    git: resolution.git,
    monorepo: resolution.monorepo,
    override_file: resolution.override_file,
    manifests_inspected: [],
    source_areas: [],
    memory_retrieval: null,
    commands_discovered: [],
    commands_executed: [],
    unknowns: [],
    blockers: [],
    evidence: [],
  }
}

function covers(record, path) {
  return record.source_areas.some((area) => {
    const normalized = area.replace(/\\/g, "/").replace(/\/+$/, "")
    const target = path.replace(/\\/g, "/")
    return target === normalized || target.startsWith(`${normalized}/`)
  })
}

/**
 * Decides whether enough inspected context exists for the intended change. Deliberately narrow:
 * this asserts sufficient context for this task, never complete understanding of the project.
 * A missing vault or absent notes is a valid retrieval result, not a failure.
 */
export function evaluateReadiness(record, { intendedPaths = [], reads = [], memoryResult = null, memoryCheck = null } = {}) {
  const reasons = []

  if (!record.project_root || !record.identifier) {
    return {
      status: READINESS.BLOCKED,
      reasons: ["project identity could not be resolved"],
    }
  }

  if (!intendedPaths.length) {
    return {
      status: READINESS.IN_PROGRESS,
      reasons: ["no intended path recorded yet, so relevance cannot be judged"],
    }
  }

  const outside = intendedPaths.filter((p) => !isWithin(p, record.project_root))
  if (outside.length > 0) {
    return {
      status: READINESS.BLOCKED,
      reasons: [`intended path is outside the resolved project root: ${outside.join(", ")}`],
    }
  }

  const unread = intendedPaths.filter((p) => !covers(record, p))
  if (unread.length > 0) {
    reasons.push(`no inspected source area covers ${unread.join(", ")}`)
  }

  // Both sides are normalized against the project root first. An agent that read `src/app.ts` and
  // an agent that read the same file by absolute path have both inspected it, and readiness must not
  // depend on which form the runtime happened to report.
  const observedReads = new Set(reads.map((r) => normalize(r, record.project_root)))
  for (const path of intendedPaths) {
    const absolute = normalize(path, record.project_root)
    const directory = dirnameOf(absolute)
    const touched = [...observedReads].some((r) => r === absolute || withinDir(r, directory))
    if (!touched) reasons.push(`no recorded read in this session touched ${path}`)
  }

  if (!record.memory_retrieval && !memoryResult) {
    reasons.push("no memory retrieval result recorded; record one, even when no notes apply")
  } else {
    if (memoryCheck && memoryCheck.ok === false) {
      reasons.push(`memory retrieval is not verifiable: ${memoryCheck.reason}`)
    } else if (memoryCheck?.degraded) {
      return { status: READINESS.DEGRADED, reasons: [`memory retrieval failed: ${memoryCheck.reason}`] }
    } else {
      const retrieval = memoryResult ?? record.memory_retrieval
      if (retrieval?.status === "error") {
        return {
          status: READINESS.DEGRADED,
          reasons: [`memory retrieval failed: ${retrieval.reason ?? "unknown"}`],
        }
      }
      if (!retrieval?.notes_read && !retrieval?.no_relevant_notes) {
        reasons.push("memory retrieval result must record the notes read or that none applied")
      }
    }
  }

  if (record.blockers.length > 0) {
    return { status: READINESS.BLOCKED, reasons: record.blockers.slice() }
  }

  if (reasons.length > 0) return { status: READINESS.IN_PROGRESS, reasons }

  return {
    status: READINESS.READY,
    reasons: [],
  }
}

function normalize(path, base) {
  const value = String(path ?? "")
  if (!value) return value
  if (isAbsolute(value)) return resolve(value)
  return resolve(base ?? process.cwd(), value)
}

function dirnameOf(path) {
  const normalized = String(path).replace(/\\/g, "/")
  const index = normalized.lastIndexOf("/")
  return index <= 0 ? "/" : normalized.slice(0, index)
}

function withinDir(readPath, dir) {
  const a = readPath.replace(/\\/g, "/")
  const b = dir.replace(/\\/g, "/").replace(/\/+$/, "")
  return a.startsWith(`${b}/`) || a === b
}