import type { ReviewProfileName } from "../../shared/model-requirements"
import type { PendingFinalConflictBatch, PersistedReviewState } from "./review-state-types"

function toSafeWave(wave: number): number {
  return Math.max(0, Math.floor(wave))
}

function getMaxCompletedWave(state: PersistedReviewState): number {
  return toSafeWave(state.wave_counters.completed_waves)
}

export function withPendingFinalConflictBatch(
  state: PersistedReviewState,
  pending_final_conflict_batch: PendingFinalConflictBatch | undefined,
  now?: string,
): PersistedReviewState {
  return {
    ...state,
    pending_final_conflict_batch,
    updated_at: now ?? new Date().toISOString(),
  }
}

function normalizeLaneLineageForCompletedWaves(state: PersistedReviewState): PersistedReviewState["lane_lineage_by_wave"] {
  const maxCompletedWave = getMaxCompletedWave(state)
  const next: PersistedReviewState["lane_lineage_by_wave"] = {}

  for (const [key, records] of Object.entries(state.lane_lineage_by_wave)) {
    const wave = toSafeWave(Number(key))
    if (wave >= 1 && wave <= maxCompletedWave) {
      next[String(wave)] = records.filter((record) => toSafeWave(record.wave) <= maxCompletedWave)
    }
  }

  return next
}

function normalizeLockedRoleInvocationsForCompletedWaves(
  state: PersistedReviewState,
): PersistedReviewState["locked_role_invocations"] {
  const maxCompletedWave = getMaxCompletedWave(state)
  return state.locked_role_invocations.filter((record) => toSafeWave(record.wave) <= maxCompletedWave)
}

function rebuildSessionMarkers(
  records: PersistedReviewState["locked_role_invocations"],
): PersistedReviewState["locked_session_markers"] {
  const laneSessions: string[] = []
  let mergeSession: string | undefined = undefined
  let tieBreakSession: string | undefined = undefined

  for (const record of records) {
    if (record.role === "argus-lane") {
      laneSessions.push(record.lock_marker)
      continue
    }
    if (record.role === "merge") {
      mergeSession = record.lock_marker
      continue
    }
    if (record.role === "tie-break") {
      tieBreakSession = record.lock_marker
    }
  }

  return {
    argus_lane_sessions: laneSessions,
    merge_session: mergeSession,
    tie_break_session: tieBreakSession,
  }
}

export function normalizeReviewStateForResumeAtPassBoundary(
  state: PersistedReviewState,
  now?: string,
): PersistedReviewState {
  const nextLockedInvocations = normalizeLockedRoleInvocationsForCompletedWaves(state)
  const nextLaneLineageByWave = normalizeLaneLineageForCompletedWaves(state)
  const nextPhase = state.phase === "completed"
    ? "completed"
    : state.pending_final_conflict_batch
      ? "tie_break_pending"
      : "pass_boundary"

  return {
    ...state,
    phase: nextPhase,
    lane_lineage_by_wave: nextLaneLineageByWave,
    locked_role_invocations: nextLockedInvocations,
    locked_session_markers: rebuildSessionMarkers(nextLockedInvocations),
    updated_at: now ?? new Date().toISOString(),
  }
}

export function assertReviewProfileInvariant(state: PersistedReviewState, profile: ReviewProfileName): void {
  if (state.profile !== profile) {
    throw new Error(`Review profile drift detected during resume: state=${state.profile}, requested=${profile}`)
  }
}
