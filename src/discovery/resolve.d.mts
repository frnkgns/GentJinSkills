import type { ResolvedProject } from "./gate.d.mts"

export function normalizeIdentifier(raw: string): string

export function resolveProject(startDir?: string): ResolvedProject

export function expandHome(path: string): string

export function isWithin(candidate: string, root: string): boolean