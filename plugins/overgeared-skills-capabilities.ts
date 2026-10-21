/**
 * Makes Overgeared Skills capabilities loadable and enforceable at runtime.
 *
 * Registers `overgeared_skills_capability`, which returns the complete canonical body of a skill or
 * command; a `tool.execute.before` hook that refuses workflow-owned commands until those
 * instructions are loaded; and an `event` hook that checks adherence when the turn ends.
 *
 * Verified against OpenCode 1.18.35 by probe, not documentation:
 *   - plugin tools are callable by the model
 *   - throwing from tool.execute.before blocks the command
 *   - `event` receives session.idle when the assistant finishes a turn
 *   - no hook exists that can retract or block an already-emitted message, so the completion
 *     check can only surface non-adherence, never prevent the claim
 *
 * OpenCode discovers .js and .ts and invokes only an inline default export, so this file
 * exports nothing else.
 */
import { appendFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createLoader, type CapabilityLoader } from "../src/capabilities/loader.mjs"

interface PluginInput {
  id?: string
  kind?: string
}

interface GuardOwner {
  capability: { id: string }
}

interface GuardVerdict {
  guarded: boolean
  owners?: GuardOwner[]
}

interface PluginEvent {
  event?: { type?: string }
}

function resolveOpenCodeRoot(): string {
  if (process.env.OVERGEARED_SKILLS_ROOT) return process.env.OVERGEARED_SKILLS_ROOT
  const here = dirname(fileURLToPath(import.meta.url))
  return resolve(here, "..")
}

export default async (): Promise<Record<string, unknown>> => {
  const loader: CapabilityLoader = createLoader({ opencodeRoot: resolveOpenCodeRoot() })

  return {
    event: async ({ event }: PluginEvent): Promise<void> => {
      if (event?.type !== "session.idle") return
      const report = loader.completionReport()
      if (report.findings.length === 0) return
      try {
        appendFileSync(join(tmpdir(), "overgeared-skills-adherence.log"), `${JSON.stringify(report)}\n`)
      } catch {
        // A session-end finding must never break the session.
      }
    },

    tool: {
      overgeared_skills_capability: {
        description:
          "Load the complete canonical instructions for a skill or command before performing any action it governs. " +
          "Use this whenever an Overgeared Skills workflow applies and you need its full body rather than its summary. " +
          "Examples: id update-overgeared-skills, install-overgeared-skills, git-push, systematic-debugging. " +
          "Pass kind as command or skill when you know it.",
        args: {
          id: { type: "string", description: "Capability id, for example update-overgeared-skills or systematic-debugging" },
          kind: { type: "string", description: "Optional: command or skill" },
        },
        async execute(args: PluginInput): Promise<string> {
          const result = loader.load(args?.id, args?.kind)
          if (!result.ok) return `CAPABILITY_UNAVAILABLE: ${result.reason}`
          const header = `# ${result.id} (${result.kind}) - canonical instructions loaded from ${result.path}`
          return [header, "", result.instructions].join("\n")
        },
      },
    },

    "tool.execute.before": async (input: { tool?: string }, output: { args?: { command?: string } }): Promise<void> => {
      if (input?.tool !== "bash") return
      const command = output?.args?.command
      if (typeof command !== "string") return

      const verdict: GuardVerdict = loader.checkCommand(command)
      if (!verdict.guarded) return

      const unloaded = (verdict.owners ?? []).filter((owner) => !loader.isLoaded(owner.capability.id))
      if (unloaded.length === 0) return

      const names = unloaded.map((owner) => `"${owner.capability.id}"`).join(" or ")
      const possessive = unloaded.length === 1 ? "its" : "their"

      throw new Error(
        [
          `Blocked: ${names} owns this action and ${possessive} instructions were not loaded in this session.`,
          `Call the overgeared_skills_capability tool with that id first, then follow those instructions.`,
          "Do not substitute a remembered procedure, a summary, or a custom script for the canonical workflow.",
        ].join("\n"),
      )
    },
  }
}