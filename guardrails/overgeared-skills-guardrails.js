import { evaluateGitCommand } from "../src/guardrails/git-guardrails.mjs"

/**
 * Blocks destructive git commands before OpenCode executes them, using the
 * tool.execute.before hook.
 *
 * OpenCode 1.18.34 discovers only .js and .ts files and invokes only an inline
 * default export. Extra named exports suppress invocation, so this file
 * deliberately exports nothing but the default.
 *
 * This file is NOT installed automatically. Run /setup-git-guardrails to place
 * it in ~/.config/opencode/plugins/.
 */
export default async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input?.tool !== "bash") return
      const command = output?.args?.command
      if (typeof command !== "string") return

      const verdict = evaluateGitCommand(command)
      if (!verdict.blocked) return

      const note = await ctx?.client?.app?.log({
        body: {
          service: "overgeared-skills-guardrails",
          level: "warn",
          message: `blocked ${verdict.rule}: ${command}`,
        },
      }).catch(() => {})

      void note

      throw new Error(
        [
          `Blocked by Overgeared Skills git guardrails (${verdict.rule}).`,
          `Reason: ${verdict.reason}`,
          `Matched: ${verdict.allMatched.join(", ")}`,
          verdict.override,
          "Ask the user for explicit authorization, or run /setup-git-guardrails to remove this guardrail.",
        ].join("\n"),
      )
    },
  }
}