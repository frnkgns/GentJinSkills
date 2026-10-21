/**
 * Exports the portable Overgeared Skills core for a non-OpenCode harness.
 *
 * Usage:
 *   node scripts/export-portable.mjs [output-directory]
 *
 * The default output directory is `.gentjin-portable/` inside the repository, which is
 * git-ignored so an export never gets committed by accident.
 */
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { exportPortable } from "../src/portability/export.mjs"
import { describeContract } from "../src/portability/contract.mjs"

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
const target = resolve(process.argv[2] ?? join(repoRoot, ".gentjin-portable"))

if (existsSync(target) && !process.argv.includes("--force")) {
  console.error(`refusing to write into an existing directory without --force: ${target}`)
  process.exit(1)
}

const result = exportPortable({ payloadRoot: repoRoot, exportDir: target })
const contract = describeContract()

console.log("Portable Overgeared Skills core exported.")
console.log(`  output      : ${result.exportDir}`)
console.log(`  core files  : ${result.coreFiles.length}`)
console.log(`  skills      : ${result.skills}`)
console.log(`  commands    : ${result.commands}`)
console.log(`  metadata    : ${result.metadata.join(", ")}`)
console.log("")
console.log(`Harness targets: ${contract.harnessTargets.map((t) => t.id).join(", ")}`)
console.log("Read INTEGRATION.md in the output directory for per-harness steps.")