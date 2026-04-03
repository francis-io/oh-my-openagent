import { existsSync, readFileSync } from "node:fs"
import type { MergeConsensusResult } from "../../features/review-merge"
import { mergeReviewFindings } from "../../features/review-merge"
import type { PersistedReviewState } from "../../features/review-state"
import type { MaterializedReviewTarget } from "../../features/review-target-resolution"
import { log } from "../../shared"
import { flattenRuntimeFindingsByWave, type RuntimeLaneFindingRecord } from "./start-review-runtime-lane-findings"
import { executeRuntimeMergeAndTieBreak } from "./start-review-runtime-merge"
import { StartReviewRuntimeHandledError } from "./start-review-runtime-errors"
import { parsePersistedRuntimeLaneFindings } from "./start-review-runtime-persisted-lane-findings"
import { parseRuntimeTaskFindings } from "./start-review-runtime-task-findings"
import { emitReviewToast } from "./start-review-runtime-toasts"
import type { RuntimeBackgroundManager, RuntimeShowToast } from "./start-review-runtime-types"
import { createReviewArtifactPaths } from "../../features/review-artifacts"
import type { ReviewProfileName } from "../../shared/model-requirements"

function readPersistedLaneFindings(input: {
  paths: ReturnType<typeof createReviewArtifactPaths>
  lane: string
  wave: number
}): RuntimeLaneFindingRecord["finding"][] {
  const jsonPath = input.paths.lanePassJsonPath(input.lane, input.wave)
  if (existsSync(jsonPath)) {
    try {
      return parsePersistedRuntimeLaneFindings(readFileSync(jsonPath, "utf-8"))
    } catch (error) {
      log("[start-review] Persisted lane JSON unreadable; falling back to markdown", {
        lane: input.lane,
        wave: input.wave,
        file_path: jsonPath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const markdownPath = input.paths.lanePassMarkdownPath(input.lane, input.wave)
  if (!existsSync(markdownPath)) {
    throw new Error(`Missing persisted lane findings at ${jsonPath} and ${markdownPath}`)
  }

  return parseRuntimeTaskFindings(readFileSync(markdownPath, "utf-8"))
}

function recoverLaneFindingsFromDisk(input: {
  paths: ReturnType<typeof createReviewArtifactPaths>
  state: PersistedReviewState
}): RuntimeLaneFindingRecord[] {
  const recovered: RuntimeLaneFindingRecord[] = []
  const waves = Object.keys(input.state.lane_lineage_by_wave)
    .map((wave) => Number(wave))
    .filter((wave) => Number.isInteger(wave))
    .sort((left, right) => left - right)

  for (const wave of waves) {
    const records = input.state.lane_lineage_by_wave[String(wave)] ?? []
    for (const record of records) {
      const findings = readPersistedLaneFindings({
        paths: input.paths,
        lane: record.lane,
        wave,
      })
      for (const finding of findings) {
        recovered.push({ lane: record.lane, finding })
      }
    }
  }

  return recovered
}

export async function executeStartReviewRuntimeMergePhase(input: {
  manager: RuntimeBackgroundManager
  parentSessionID: string
  review_run_id: string
  profile: ReviewProfileName
  wave: number
  target: MaterializedReviewTarget
  convergenceState: PersistedReviewState
  laneFindingsByWave: Map<number, RuntimeLaneFindingRecord[]>
  paths: ReturnType<typeof createReviewArtifactPaths>
  now: string
  persistReviewState: (state: PersistedReviewState) => void
  showToast?: RuntimeShowToast
}): Promise<{
  mergedAcrossWaves: MergeConsensusResult
  runtimeMerge: Awaited<ReturnType<typeof executeRuntimeMergeAndTieBreak>>
  workflowState: PersistedReviewState
  laneFindingsForMerge: RuntimeLaneFindingRecord[]
}> {
  let laneFindingsForMerge = flattenRuntimeFindingsByWave(input.laneFindingsByWave)
  let mergedAcrossWaves = mergeReviewFindings({
    profile: input.profile,
    wave: Math.max(1, input.wave),
    state: input.convergenceState,
    lane_findings: laneFindingsForMerge,
  })
  let workflowState: PersistedReviewState = {
    ...input.convergenceState,
    phase: "merge_pending",
    updated_at: input.now,
  }
  input.persistReviewState(workflowState)

  const runMerge = async (retrying: boolean) => {
    emitReviewToast(input.showToast, {
      type: "merge-started",
      laneFindingCount: laneFindingsForMerge.length,
      retrying,
    })

    return executeRuntimeMergeAndTieBreak({
      manager: input.manager,
      parentSessionID: input.parentSessionID,
      review_run_id: input.review_run_id,
      profile: input.profile,
      wave: Math.max(1, input.wave),
      target: input.target,
      merge: mergedAcrossWaves,
      lane_findings: laneFindingsForMerge.map((entry) => entry.finding),
      onBeforeTieBreak: () => {
        workflowState = {
          ...workflowState,
          phase: "tie_break_pending",
          updated_at: input.now,
        }
        input.persistReviewState(workflowState)
        emitReviewToast(input.showToast, {
          type: "tie-break-started",
          conflictCount: mergedAcrossWaves.conflicts_for_tie_break.length,
        })
      },
    })
  }

  try {
    const runtimeMerge = await runMerge(false)
    return { mergedAcrossWaves, runtimeMerge, workflowState, laneFindingsForMerge }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log("[start-review] Merge phase failed; attempting persisted lane recovery", {
      review_run_id: input.review_run_id,
      error: message,
    })

    try {
      laneFindingsForMerge = recoverLaneFindingsFromDisk({
        paths: input.paths,
        state: input.convergenceState,
      })
    } catch (recoveryError) {
      const recoveryMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
      emitReviewToast(input.showToast, {
        type: "review-error",
        message: recoveryMessage,
        recoveryAttempted: true,
      })
      throw new StartReviewRuntimeHandledError(recoveryMessage, {
        reviewToastShown: true,
        recoveryAttempted: true,
        cause: recoveryError,
      })
    }

    mergedAcrossWaves = mergeReviewFindings({
      profile: input.profile,
      wave: Math.max(1, input.wave),
      state: input.convergenceState,
      lane_findings: laneFindingsForMerge,
    })
    workflowState = {
      ...input.convergenceState,
      phase: "merge_pending",
      updated_at: input.now,
    }
    input.persistReviewState(workflowState)

    try {
      const runtimeMerge = await runMerge(true)
      return { mergedAcrossWaves, runtimeMerge, workflowState, laneFindingsForMerge }
    } catch (retryError) {
      const retryMessage = retryError instanceof Error ? retryError.message : String(retryError)
      emitReviewToast(input.showToast, {
        type: "review-error",
        message: retryMessage,
        recoveryAttempted: true,
      })
      throw new StartReviewRuntimeHandledError(retryMessage, {
        reviewToastShown: true,
        recoveryAttempted: true,
        cause: retryError,
      })
    }
  }
}
