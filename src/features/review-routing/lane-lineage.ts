import type { PersistedReviewState } from "../review-state"
import type { LockedInvocationRecord } from "./types"

type LaneLineageRecord = PersistedReviewState["lane_lineage_by_wave"][string][number]

function waveKey(wave: number): string {
  return String(Math.max(1, Math.floor(wave)))
}

export function withRecordedLockedInvocation(
  state: PersistedReviewState,
  record: LockedInvocationRecord,
): PersistedReviewState {
  const wave = waveKey(record.wave)
  const previousWaveRecords = state.lane_lineage_by_wave[wave] ?? []
  const laneRecord: LaneLineageRecord | undefined = record.invocation_type === "lane"
    ? {
        invocation_type: "lane",
        profile: record.profile,
        wave: record.wave,
        role: "argus-lane",
        lane: record.lane === null ? "argus" : record.lane,
        lock_marker: record.lock_marker,
        model_tuple: record.model_tuple,
        surface: record.surface,
        task_id: record.task_id,
        session_id: record.session_id,
        created_at: record.created_at,
      }
    : undefined

  const nextByWave = {
    ...state.lane_lineage_by_wave,
    [wave]: laneRecord
      ? [...previousWaveRecords, laneRecord]
      : previousWaveRecords,
  }

  return {
    ...state,
    lane_lineage_by_wave: nextByWave,
    locked_role_invocations: [...state.locked_role_invocations, record],
    locked_session_markers: {
      argus_lane_sessions: record.role === "argus-lane"
        ? [...state.locked_session_markers.argus_lane_sessions, record.lock_marker]
        : state.locked_session_markers.argus_lane_sessions,
      merge_session: record.role === "merge"
        ? record.lock_marker
        : state.locked_session_markers.merge_session,
      tie_break_session: record.role === "tie-break"
        ? record.lock_marker
        : state.locked_session_markers.tie_break_session,
    },
    updated_at: record.created_at,
  }
}
