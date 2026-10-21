import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, isAbsolute, join, relative } from "node:path"
import { createHash } from "node:crypto"

const DEFAULT_FILE = join(tmpdir(), "overgeared-skills-gate-decisions.jsonl")

function anonymize(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 12)
}

/**
 * Records why the gate allowed or refused a call. Only the decision shape is stored: no file
 * content, no command text, no conversation. Paths are relativized against the project root so a
 * trace never carries an absolute user path.
 */
export function createGateTracer({
  file = process.env.OVERGEARED_SKILLS_GATE_LOG ?? process.env.GENTJIN_GATE_LOG ?? DEFAULT_FILE,
} = {}) {
  let enabled = true

  return {
    get file() {
      return file
    },
    disable() {
      enabled = false
    },
    record({ tool, filePath, projectRoot, allowed, status = null, reasons = [], sessionId = null, taskId = null }) {
      if (!enabled) return null
      const root = projectRoot ?? null
      const absolute = filePath ? String(filePath) : null
      const relativePath = absolute
        ? root && isAbsolute(absolute)
          ? relative(root, absolute).replace(/\\/g, "/")
          : absolute
          ? basename(absolute)
          : null
        : null

      const entry = {
        at: new Date().toISOString(),
        tool: tool ?? null,
        decision: allowed ? "allowed" : "refused",
        readiness: status,
        path: relativePath,
        reasons: reasons.slice(0, 4),
        session: sessionId ? anonymize(sessionId) : null,
        task: taskId ? anonymize(taskId) : null,
      }

      try {
        mkdirSync(dirname(file), { recursive: true })
        appendFileSync(file, `${JSON.stringify(entry)}\n`)
      } catch {
        // A failed trace must never block or alter the decision it describes.
      }
      return entry
    },
  }
}

export function readGateTrace(file = DEFAULT_FILE) {
  let text
  try {
    text = readFileSync(file, "utf8")
  } catch {
    return []
  }
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}