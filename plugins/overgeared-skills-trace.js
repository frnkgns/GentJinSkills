import { registerTracePlugin } from "../src/trace/plugin-body.mjs"

/**
 * OpenCode 2.0.28 requires a plugin's default export to be a definition object carrying an `id`
 * and an `effect` or `setup` function. The V1 inline async arrow this file used to export is
 * rejected, which is why the plugin failed to load. The implementation stays in
 * ../src/trace/plugin-body.mjs so the unit tests can import it directly.
 */
export default {
  id: "overgeared-skills-trace",
  setup(ctx) {
    return registerTracePlugin(ctx)
  },
}