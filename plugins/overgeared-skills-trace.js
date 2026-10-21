import { createTracePlugin } from "../src/trace/plugin-body.mjs"

/**
 * OpenCode 1.18.35 invokes a plugin only when its default export is an inline
 * arrow function, and only discovers files ending in .js or .ts. Verified
 * empirically against 1.18.35:
 *
 *   - a .mjs file in plugins/ is never imported
 *   - `export const P = async () => {}` with `export default P` is imported
 *     but never invoked
 *   - extra named exports alongside the default suppress invocation
 *
 * This file therefore exports only the default. The implementation lives in
 * ../src/trace/plugin-body.mjs so the unit tests can import it directly.
 */
export default async (ctx) => createTracePlugin(ctx)