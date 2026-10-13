import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export const PLUGIN_NAME = "gentjin-trace"

export function traceDirIsOutsideRepo(repoRoot) {
  const dir = (process.env.GENTJIN_TRACE_DIR ?? join(homedir(), ".local", "state", "gentjin", "traces")).replace(
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
    "Records GENTJIN task traces from real OpenCode hooks. Installs into ~/.config/opencode/plugins/.",
  location: "~/.config/opencode/plugins/gentjin-trace.js",
  required_hooks: ["tool.execute.before", "tool.execute.after", "event", "chat.message", "permission.ask"],
  trace_location: process.env.GENTJIN_TRACE_DIR ?? "~/.local/state/gentjin/traces",
  coverage_note:
    "Skill selection is not observable through any hook. Routing recorded alongside traces is inferred and must be labeled as such.",
  load_contract:
    "OpenCode 2.0.28 discovers only .js and .ts, and requires the default export to be a definition " +
    "object carrying an id and an effect or setup function. A V1 async hook-map export is rejected " +
    "outright. Hooks are registered on their owning domain inside setup, not returned as string keys.",
}