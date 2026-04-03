import { runReviewConvergenceLoop } from "../../features/review-loop"
import { buildFinalQuestionBatch } from "../../features/review-questions"
import {
  withPendingFinalConflictBatch,
  type PersistedReviewState,
} from "../../features/review-state"
import { type ReviewMode } from "../../features/review-target-resolution"
import type { ReviewProfileName } from "../../shared/model-requirements"
import { createStartReviewRunId } from "./start-review-run-id"
import {
  collectRuntimeLaneFindingsForWave,
} from "./start-review-runtime-lane-findings"
import { collectPriorFindingHints } from "./start-review-runtime-prior-finding-hints"
import { collectRuntimeWaveProvenance } from "./start-review-runtime-wave-provenance"
import { bootstrapStartReviewRuntime } from "./start-review-runtime-bootstrap"
import { isStartReviewRuntimeHandledError } from "./start-review-runtime-errors"
import { createStartReviewRuntimeLanePrompts } from "./start-review-runtime-lane-prompts"
import { executeStartReviewRuntimeMergePhase } from "./start-review-runtime-merge-phase"
import { inferRuntimeReviewProfile } from "./start-review-runtime-profile"
import { writeStartReviewRuntimeResultArtifacts } from "./start-review-runtime-result-writer"
import { emitReviewToast } from "./start-review-runtime-toasts"
import type { RuntimeBackgroundManager, RuntimeShowToast } from "./start-review-runtime-types"

type StartReviewRuntimeFlowInput = {
  workspaceRoot: string
  mode: ReviewMode
  requestedInput: string
  sessionID: string
  planPathHint?: string
  backgroundManager?: RuntimeBackgroundManager
  showToast?: RuntimeShowToast
  now?: string
}

type StartReviewRuntimeFlowResult = {
  started: boolean
  profile: ReviewProfileName
  mode: ReviewMode
  review_run_id: string
  review_root_relative_path: string
  target_materialization_hash: string | null
  stop_reason: PersistedReviewState["stop_reason"]
  final_conflict_count: number
  remediation_plan_relative_path: string
}

export async function startReviewRuntimeFlow(input: StartReviewRuntimeFlowInput): Promise<StartReviewRuntimeFlowResult> {
  if (!input.backgroundManager) {
    throw new Error("start-review runtime requires BackgroundManager handoff")
  }

  const now = input.now ?? new Date().toISOString()
  const profile = inferRuntimeReviewProfile(input.requestedInput)
  const review_run_id = createStartReviewRunId(input.sessionID, now)
  const {
    resolvedTarget,
    scopeKeys,
    paths,
    initialState,
    persistReviewState,
  } = bootstrapStartReviewRuntime({
    workspaceRoot: input.workspaceRoot,
    mode: input.mode,
    sessionID: input.sessionID,
    planPathHint: input.planPathHint,
    profile,
    review_run_id,
    now,
  })
  emitReviewToast(input.showToast, {
    type: "review-started",
    profile,
    mode: resolvedTarget.mode,
    reviewRunId: review_run_id,
  })
  const laneFindingsByWave = new Map<number, Awaited<ReturnType<typeof collectRuntimeLaneFindingsForWave>>>()
  let latestState = initialState

  try {
    const convergence = await runReviewConvergenceLoop({
      state: initialState,
      profile,
      parentSessionID: input.sessionID,
      parentMessageID: "start-review-runtime",
      manager: input.backgroundManager,
      onWaveStarted: (wave) => {
        emitReviewToast(input.showToast, { type: "wave-started", wave })
      },
      onWaveSpawned: (state) => {
        latestState = state
        persistReviewState(state)
      },
      lanePromptsForWave: (wave) => createStartReviewRuntimeLanePrompts({
        wave,
        mode: resolvedTarget.mode,
        profile,
        target: resolvedTarget.target,
        review_run_id,
        prior_findings: collectPriorFindingHints(latestState),
      }),
      collectWaveFindings: async ({ wave, state }) => {
        const collected = await collectRuntimeLaneFindingsForWave({
          wave,
          state,
          manager: input.backgroundManager!,
          paths,
        })

        laneFindingsByWave.set(wave, collected)
        return collected.map((entry) => entry.finding)
      },
      collectWaveProvenance: collectRuntimeWaveProvenance(laneFindingsByWave),
      onWaveComplete: ({ wave, findings, decision }) => {
        emitReviewToast(input.showToast, {
          type: "wave-complete",
          wave,
          findingCount: findings.length,
          newHighCount: decision.new_high_severity_fingerprints.length,
        })
      },
      onStateUpdate: (state) => {
        latestState = state
        persistReviewState(state)
      },
      now,
    })

    const mergeWave = convergence.state.stop_wave ?? convergence.state.wave_counters.completed_waves
    emitReviewToast(input.showToast, {
      type: "convergence-complete",
      completedWaves: convergence.state.wave_counters.completed_waves,
      stopReason: convergence.stop_reason,
      totalFindings: Object.keys(convergence.state.findings).length,
    })
    const mergePhase = await executeStartReviewRuntimeMergePhase({
      manager: input.backgroundManager,
      parentSessionID: input.sessionID,
      review_run_id,
      profile,
      wave: Math.max(1, mergeWave),
      target: resolvedTarget.target,
      convergenceState: convergence.state,
      laneFindingsByWave,
      paths,
      now,
      persistReviewState,
      showToast: input.showToast,
    })
    let workflowState = mergePhase.workflowState
    const questionBatch = buildFinalQuestionBatch({
      unresolved_conflicts: mergePhase.runtimeMerge.unresolved_conflicts.map((conflict) => ({
        fingerprint: conflict.fingerprint,
        summary: conflict.lane_findings[0]?.finding.summary ?? "Conflict requires final user decision",
        options: conflict.lane_findings.map((entry) => entry.finding.title),
      })),
      state: workflowState,
    })

    const finalState = withPendingFinalConflictBatch({
      ...workflowState,
      phase: questionBatch ? "tie_break_pending" : "completed",
    }, questionBatch ?? undefined, now)
    const resultArtifacts = writeStartReviewRuntimeResultArtifacts({
      paths,
      workspaceRoot: input.workspaceRoot,
      review_run_id,
      review_scope_key: scopeKeys.review_scope_key,
      suppression_scope_key: scopeKeys.suppression_scope_key,
      mergePhase,
      finalState,
      now,
    })
    persistReviewState(finalState)

    if (questionBatch) {
      emitReviewToast(input.showToast, {
        type: "review-needs-input",
        conflictCount: questionBatch.conflicts.length,
      })
    } else {
      emitReviewToast(input.showToast, {
        type: "review-complete",
        acceptedCount: mergePhase.runtimeMerge.consensus_findings.length,
        remediationPath: resultArtifacts.remediationPlanRelativePath,
      })
    }

    return {
      started: true,
      profile,
      mode: resolvedTarget.mode,
      review_run_id,
      review_root_relative_path: `.sisyphus/reviews/${review_run_id}`,
      target_materialization_hash: resolvedTarget.target.materialization.hash,
      stop_reason: finalState.stop_reason,
      final_conflict_count: mergePhase.runtimeMerge.unresolved_conflicts.length,
      remediation_plan_relative_path: resultArtifacts.remediationPlanRelativePath,
    }
  } catch (error) {
    if (!isStartReviewRuntimeHandledError(error) || !error.reviewToastShown) {
      emitReviewToast(input.showToast, {
        type: "review-error",
        message: error instanceof Error ? error.message : String(error),
        recoveryAttempted: isStartReviewRuntimeHandledError(error) ? error.recoveryAttempted : false,
      })
    }
    throw error
  }
}
