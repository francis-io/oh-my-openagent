import { createReviewWaveRoutingPlan } from "../../features/review-routing"
import type { MergeConsensusResult, ReviewMergeConflict } from "../../features/review-merge"
import type { ReviewWaveFinding } from "../../features/review-loop"
import type { MaterializedReviewTarget } from "../../features/review-target-resolution"
import { QUESTION_DENIED_SESSION_PERMISSION } from "../../shared/question-denied-session-permission"
import { registerLockedReviewRuntimeSession } from "../../shared/locked-review-session-registry"
import {
  createMergeTaskPrompt,
  createTieBreakTaskPrompt,
} from "./start-review-runtime-merge-prompts"
import {
  parseMergeValidationResult,
  parseTieBreakResolutions,
  type LaneName,
  type MergeValidationResult,
  type TieBreakResolution,
} from "./start-review-runtime-merge-parser"
import type { RuntimeBackgroundManager } from "./start-review-runtime-types"
import { resolveRuntimeTaskResultText } from "./start-review-runtime-task-output"
import { waitForRuntimeTaskTerminal } from "./start-review-runtime-task-wait"

function resolveConflictByLane(conflict: ReviewMergeConflict, lane: LaneName) {
  const selected = conflict.lane_findings.find((entry) => entry.lane === lane)
  if (!selected) {
    return null
  }
  return {
    fingerprint: conflict.fingerprint,
    source_lanes: conflict.lane_findings.map((entry) => entry.lane).sort((left, right) => left.localeCompare(right)),
    finding: selected.finding,
  }
}

export async function executeRuntimeMergeAndTieBreak(input: {
  manager: RuntimeBackgroundManager
  parentSessionID: string
  review_run_id: string
  profile: MergeConsensusResult["profile"]
  wave: number
  target: MaterializedReviewTarget
  merge: MergeConsensusResult
  lane_findings: ReviewWaveFinding[]
  onBeforeTieBreak?: () => void | Promise<void>
}): Promise<{
  consensus_findings: MergeConsensusResult["consensus_findings"]
  unresolved_conflicts: ReviewMergeConflict[]
  merge_execution: { task_id: string; session_id: string; result: string; validation: MergeValidationResult }
  tie_break_execution: { task_id: string; session_id: string; result: string; resolutions: TieBreakResolution[] } | null
}> {
  const routing = createReviewWaveRoutingPlan(input.profile, input.wave)
  const mergeTask = await input.manager.launch({
    description: `themis merge wave ${routing.wave}`,
    prompt: createMergeTaskPrompt({
      review_run_id: input.review_run_id,
      profile: input.profile,
      wave: input.wave,
      target: input.target,
      lane_findings: input.lane_findings,
    }),
    agent: routing.merge.model_tuple.agent,
    model: {
      providerID: routing.merge.model_tuple.provider,
      modelID: routing.merge.model_tuple.model,
      variant: routing.merge.model_tuple.variant,
      ...(routing.merge.model_tuple.reasoningEffort ? { reasoningEffort: routing.merge.model_tuple.reasoningEffort } : {}),
      ...(routing.merge.model_tuple.thinking ? { thinking: routing.merge.model_tuple.thinking } : {}),
    },
    parentSessionID: input.parentSessionID,
    parentMessageID: "start-review-runtime-merge",
    sessionPermission: QUESTION_DENIED_SESSION_PERMISSION,
  })
  registerLockedReviewRuntimeSession(mergeTask.sessionID, {
    profile: input.profile,
    role: "merge",
    wave: input.wave,
  })
  const mergeTaskTerminal = await waitForRuntimeTaskTerminal(input.manager, mergeTask.id, {
    timeout_ms: 300_000,
    label: `Themis merge wave ${input.wave}`,
  })
  const mergeResultText = await resolveRuntimeTaskResultText(input.manager, mergeTaskTerminal)
  if (mergeTaskTerminal.status !== "completed" || typeof mergeResultText !== "string") {
    throw new Error(`Runtime merge execution failed (status=${mergeTaskTerminal.status})`)
  }
  const mergeValidation = parseMergeValidationResult(mergeResultText, input.lane_findings.length)

  if (input.merge.conflicts_for_tie_break.length === 0) {
    return {
      consensus_findings: input.merge.consensus_findings,
      unresolved_conflicts: [],
      merge_execution: {
        task_id: mergeTask.id,
        session_id: mergeTask.sessionID ?? "",
        result: mergeResultText,
        validation: mergeValidation,
      },
      tie_break_execution: null,
    }
  }

  await input.onBeforeTieBreak?.()

  const tieBreakTask = await input.manager.launch({
    description: `oracle tie-break wave ${routing.wave}`,
    prompt: createTieBreakTaskPrompt({
      review_run_id: input.review_run_id,
      profile: input.profile,
      wave: input.wave,
      target: input.target,
      conflicts: input.merge.conflicts_for_tie_break,
    }),
    agent: routing.tie_break.model_tuple.agent,
    model: {
      providerID: routing.tie_break.model_tuple.provider,
      modelID: routing.tie_break.model_tuple.model,
      variant: routing.tie_break.model_tuple.variant,
      ...(routing.tie_break.model_tuple.reasoningEffort ? { reasoningEffort: routing.tie_break.model_tuple.reasoningEffort } : {}),
      ...(routing.tie_break.model_tuple.thinking ? { thinking: routing.tie_break.model_tuple.thinking } : {}),
    },
    parentSessionID: input.parentSessionID,
    parentMessageID: "start-review-runtime-tie-break",
    sessionPermission: QUESTION_DENIED_SESSION_PERMISSION,
  })
  registerLockedReviewRuntimeSession(tieBreakTask.sessionID, {
    profile: input.profile,
    role: "tie-break",
    wave: input.wave,
  })
  const tieBreakTerminal = await waitForRuntimeTaskTerminal(input.manager, tieBreakTask.id, {
    timeout_ms: 300_000,
    label: `Oracle tie-break wave ${input.wave}`,
  })
  const tieBreakResultText = await resolveRuntimeTaskResultText(input.manager, tieBreakTerminal)
  if (tieBreakTerminal.status !== "completed" || typeof tieBreakResultText !== "string") {
    throw new Error(`Runtime tie-break execution failed (status=${tieBreakTerminal.status})`)
  }

  const resolutions = parseTieBreakResolutions(tieBreakResultText)
  const resolutionByFingerprint = new Map(resolutions.map((entry) => [entry.fingerprint, entry.selected_lane]))

  const tieBrokenConsensus = input.merge.conflicts_for_tie_break
    .map((conflict) => {
      const selectedLane = resolutionByFingerprint.get(conflict.fingerprint)
      if (!selectedLane) {
        return null
      }
      return resolveConflictByLane(conflict, selectedLane)
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  const unresolved = input.merge.conflicts_for_tie_break.filter(
    (conflict) => !resolutionByFingerprint.has(conflict.fingerprint),
  )

  return {
    consensus_findings: [...input.merge.consensus_findings, ...tieBrokenConsensus],
    unresolved_conflicts: unresolved,
    merge_execution: {
      task_id: mergeTask.id,
      session_id: mergeTask.sessionID ?? "",
      result: mergeResultText,
      validation: mergeValidation,
    },
    tie_break_execution: {
      task_id: tieBreakTask.id,
      session_id: tieBreakTask.sessionID ?? "",
      result: tieBreakResultText,
      resolutions,
    },
  }
}
