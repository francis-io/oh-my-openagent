import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { dirname } from "node:path"
import { PersistedReviewStateSchema, type PersistedReviewState } from "./review-state-types"
import type { ReviewProfileName } from "../../shared/model-requirements"

function ensureDirectory(filePath: string): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function sortForDeterministicJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForDeterministicJson)
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const input = value as Record<string, unknown>
  const keys = Object.keys(input).sort((left, right) => left.localeCompare(right))
  const sorted: Record<string, unknown> = {}

  for (const key of keys) {
    sorted[key] = sortForDeterministicJson(input[key])
  }

  return sorted
}

function toDeterministicJson(value: unknown): string {
  return JSON.stringify(sortForDeterministicJson(value), null, 2)
}

export function createReviewStateTempPath(filePath: string): string {
  return `${filePath}.tmp.${Date.now()}.${process.pid}.${randomUUID()}`
}

export function readReviewState(filePath: string): PersistedReviewState | null {
  if (!existsSync(filePath)) {
    return null
  }

  try {
    const content = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(content)
    const result = PersistedReviewStateSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch (_error) {
    return null
  }
}

export function writeReviewStateAtomic(filePath: string, state: PersistedReviewState): void {
  ensureDirectory(filePath)
  const tempPath = createReviewStateTempPath(filePath)

  try {
    writeFileSync(tempPath, toDeterministicJson(state), "utf-8")
    renameSync(tempPath, filePath)
  } catch (error) {
    let cleanupError: unknown = undefined

    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath)
      }
    } catch (cleanupFailure) {
      cleanupError = cleanupFailure
    }

    if (cleanupError) {
      throw new Error(`Failed to persist review state and cleanup temp file: ${String(cleanupError)}`, {
        cause: error,
      })
    }

    throw error
  }
}

export function updateReviewState(
  filePath: string,
  updater: (previous: PersistedReviewState | null) => PersistedReviewState,
): PersistedReviewState {
  const previous = readReviewState(filePath)
  const next = updater(previous)
  writeReviewStateAtomic(filePath, next)
  return next
}

export function createInitialReviewState(input: {
  profile?: ReviewProfileName
  review_run_id: string
  coordinator_session_id?: string
  review_scope_key: string
  suppression_scope_key: string
  ref_identity?: {
    base_ref: string | null
    head_ref: string | null
  }
  now?: string
}): PersistedReviewState {
  const now = input.now ?? new Date().toISOString()

  return {
    version: 1,
    profile: input.profile ?? "test",
    review_run_id: input.review_run_id,
    coordinator_session_id: input.coordinator_session_id,
    review_scope_key: input.review_scope_key,
    suppression_scope_key: input.suppression_scope_key,
    ref_identity: input.ref_identity ?? {
      base_ref: null,
      head_ref: null,
    },
    phase: "pass_boundary",
    created_at: now,
    updated_at: now,
    wave_counters: {
      completed_waves: 0,
      dry_waves: 0,
    },
    findings: {},
    locked_session_markers: {
      argus_lane_sessions: [],
    },
    lane_lineage_by_wave: {},
    locked_role_invocations: [],
  }
}
