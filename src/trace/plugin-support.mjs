import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export const PLUGIN_NAME = "overgeared-skills-trace"

export function traceDirIsOutsideRepo(repoRoot) {
  const dir = (process.env.OVERGEARED_SKILLS_TRACE_DIR ?? join(homedir(), ".local", "state", "overgeared-skills", "traces")).replace(
    /\\/g,
    "/",
  )
  const root = String(repoRoot).replace(/\\/g, "/")
  return !dir.startsWith(root)
}

export function pluginIsInstalled(opencodeRoot) {
  return existsSync(join(opencodeRoot, "plugins", `${PLUGIN_NAME}.js`))
}

export const pluginManifest = {
  name: PLUGIN_NAME,
  description:
    "Records Overgeared Skills task traces from real OpenCode hooks. Installs into ~/.config/opencode/plugins/.",
  location: "~/.config/opencode/plugins/overgeared-skills-trace.js",
  required_hooks: ["tool.execute.before", "tool.execute.after", "event", "chat.message", "permission.ask"],
  trace_location: process.env.OVERGEARED_SKILLS_TRACE_DIR ?? "~/.local/state/overgeared-skills/traces",
  coverage_note:
    "Skill selection is not observable through any hook. Routing recorded alongside traces is inferred and must be labeled as such.",
  load_contract:
    "OpenCode 1.18.35 discovers only .js and .ts, and invokes only an inline default export. " +
    "The plugin file exports nothing else.",
}