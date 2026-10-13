const BLOCKED = [
  {
    id: "push",
    pattern: /\bgit\s+push\b/i,
    why: "Pushing publishes work. Confirm the branch and commit with the user first.",
  },
  {
    id: "push-force",
    pattern: /\bgit\s+push\b.*(--force\b|--force-with-lease\b|-f\b)/i,
    why: "Force pushing overwrites remote history that may be shared.",
  },
  {
    id: "reset-hard",
    pattern: /\bgit\s+reset\s+--hard\b/i,
    why: "Discards uncommitted work irreversibly.",
  },
  {
    id: "clean",
    pattern: /\bgit\s+clean\s+-[a-z]*f/i,
    why: "Deletes untracked files that cannot be recovered from Git.",
  },
  {
    id: "branch-delete-force",
    pattern: /\bgit\s+branch\s+-D(?:\s|$)/,
    why: "Force-deletes a branch, including unmerged commits. Plain -d is allowed.",
  },
  {
    id: "checkout-dot",
    pattern: /\bgit\s+checkout\s+\.\s*$/i,
    why: "Discards all uncommitted changes in the working tree.",
  },
  {
    id: "restore-dot",
    pattern: /\bgit\s+restore\s+\.\s*$/i,
    why: "Discards all uncommitted changes in the working tree.",
  },
]

function allowedKeys() {
  return new Set(
    String(process.env.GENTJIN_ALLOW_GIT ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

export function evaluateGitCommand(command) {
  const text = String(command ?? "")
  if (!/\bgit\b/.test(text)) return { blocked: false }

  const allowed = allowedKeys()
  const hits = BLOCKED.filter((rule) => {
    if (allowed.has(rule.id)) return false
    return rule.pattern.test(text)
  })

  if (hits.length === 0) return { blocked: false }

  const forced = hits.find((h) => h.id === "push-force")
  const matched = forced ?? hits[0]

  return {
    blocked: true,
    rule: matched.id,
    reason: matched.why,
    allMatched: hits.map((h) => h.id),
    override: `Set GENTJIN_ALLOW_GIT=${matched.id} for this session only if you are certain.`,
  }
}

export const guardrailRules = BLOCKED.map((r) => ({ id: r.id, why: r.why }))

/**
 * This module is a rule evaluator, not a plugin entry point. The plugin that applies these rules
 * lives in guardrails/gentjin-guardrails.js, because OpenCode 2.0.28 loads a plugin only from a
 * default export that is a definition object with an id and a setup function.
 */