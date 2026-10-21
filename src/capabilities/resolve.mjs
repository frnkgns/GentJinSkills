const UPDATE_TARGET_TERMS = [
  "overgeared-skills",
  "overgeared-skills installation",
  "overgeared skills",
  "overgeared skills installation",
  "overgeared",
  "gentjin",
  "gent jin",
  "gentyin",
  "gentjin installation",
  "skill suite",
  "installed skill",
]

const NON_TARGET_UPDATE_TERMS = [
  "dependency",
  "dependencies",
  "package",
  "packages",
  "npm",
  "yarn",
  "pnpm",
  "readme",
  "documentation",
  "docs",
  "changelog",
  "source",
  "repo source",
  "version",
]

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

export function resolveCapability(registry, request, options = {}) {
  const text = normalize(request)

  if (text.length === 0) {
    return { resolved: false, reason: "empty request" }
  }

  const isNegated = /\b(do not|don'?t|never)\b[^.]*\b(update|install|run|execute)\b/.test(text)
  if (isNegated && !options.overrideNegation) {
    return { resolved: false, reason: "request explicitly declines the action" }
  }

  if (/\bwhat does\b|\bwhat is\b|\bexplain\b|\bhow does\b/.test(text) && !/\b(execute|run|do it|go ahead)\b/.test(text)) {
    return { resolved: false, reason: "request asks about a capability rather than invoking it" }
  }

  if (/\b(transcript|quoted|quote|it said|was said|earlier someone said)\b/.test(text)) {
    return { resolved: false, reason: "request quotes a transcript rather than invoking the workflow" }
  }

  const commandMatch = matchCommands(registry, text, options)
  if (commandMatch) return commandMatch

  const skillMatch = matchSkills(registry, text, options)
  if (skillMatch) return skillMatch

  return { resolved: false, reason: "no capability matched the request" }
}

function matchCommands(registry, text, options) {
  const byId = new Map(registry.capabilities.filter((c) => c.kind === "command").map((c) => [c.id, c]))

  const slash = text.match(/(?:^|\s)\/([a-z0-9][a-z0-9-]*)/)
  if (slash && byId.has(slash[1])) {
    return resolved(byId.get(slash[1]), "exact named command", "exact_slash")
  }

  const rebrandBareName = text.match(/\b(update|install)-overgeared-skills\b/)
  if (rebrandBareName) {
    const id = `${rebrandBareName[1]}-overgeared-skills`
    if (byId.has(id)) return resolved(byId.get(id), "named command without slash", "exact_name")
  }

  const bareName = text.match(/\b(update|install|push|review|resume|pause|report|status|task|cleanup|learn|setup)-?(gentjin|git)\b/)
  if (bareName) {
    const id = `${bareName[1]}-${bareName[2]}`
    if (byId.has(id)) return resolved(byId.get(id), "named command without slash", "exact_name")
  }

  const wantsUpdate = /\b(update|upgrade|sync|refresh|upgrade|bring)\b/.test(text)
  const targetsOvergeared = UPDATE_TARGET_TERMS.some((term) => text.includes(term))
  const targetsOther = NON_TARGET_UPDATE_TERMS.some((term) => text.includes(term))

  if (wantsUpdate && targetsOther && !targetsOvergeared) {
    return { resolved: false, reason: "update request targets something other than the Overgeared Skills installation" }
  }

  let best = null
  for (const capability of byId.values()) {
    for (const intent of capability.intent) {
      if (!text.includes(normalize(intent))) continue
      if (!best || intent.length > best.score) best = { capability, score: intent.length, intent }
    }
  }

  if (best) {
    if (wantsUpdate && !targetsOvergeared && best.capability.id !== "update-overgeared-skills") {
      return { resolved: false, reason: "generic update request is not about the Overgeared Skills installation" }
    }
    return resolved(best.capability, `natural-language intent "${best.intent}"`, "intent_match")
  }

  return null
}

function matchSkills(registry, text, options) {
  let best = null
  for (const capability of registry.capabilities.filter((c) => c.kind === "skill")) {
    for (const intent of capability.intent) {
      if (!text.includes(normalize(intent))) continue
      if (!best || intent.length > best.score) best = { capability, score: intent.length, intent }
    }
  }
  if (best) return resolved(best.capability, `skill intent "${best.intent}"`, "intent_match")
  return null
}

function resolved(capability, reason, matchKind) {
  return {
    resolved: true,
    id: capability.id,
    kind: capability.kind,
    path: capability.path,
    description: capability.description,
    scope: capability.scope,
    guarded: capability.guarded,
    review_only: capability.review_only,
    grants_code_change_authority: capability.grants_code_change_authority,
    required_preconditions: capability.required_preconditions ?? [],
    exclusions: capability.exclusions ?? [],
    match: matchKind,
    reason,
  }
}

export function findCapability(registry, id) {
  const byId = new Map(registry.capabilities.map((c) => [c.id, c]))
  const capability = byId.get(id)
  if (!capability) return { found: false, reason: `unknown capability id "${id}"` }
  return { found: true, capability }
}

export function findCapabilityOfKind(registry, id, kind) {
  const result = findCapability(registry, id)
  if (!result.found) return result
  if (result.capability.kind !== kind) {
    return {
      found: false,
      reason: `"${id}" is a ${result.capability.kind}, not a ${kind}; refusing to treat it as the wrong kind`,
    }
  }
  return result
}