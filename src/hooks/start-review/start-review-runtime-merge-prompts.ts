import type { MergeConsensusResult } from "../../features/review-merge"
import type { ReviewWaveFinding } from "../../features/review-loop"
import type { MaterializedReviewTarget } from "../../features/review-target-resolution"

export function createMergeTaskPrompt(input: {
  review_run_id: string
  profile: MergeConsensusResult["profile"]
  wave: number
  target: MaterializedReviewTarget
  lane_findings: ReviewWaveFinding[]
}): string {
  return [
    "Themis runtime merge lane",
    `review_run_id=${input.review_run_id}`,
    `profile=${input.profile}`,
    `wave=${input.wave}`,
    `target_hash=${input.target.materialization.hash}`,
    `changed_files=${input.target.diff.changed_files.join(",")}`,
    "You are validating and reporting on the deterministic TypeScript merge result.",
    "The deterministic TypeScript merge remains authoritative for consensus selection.",
    "Your role is validation/reporting only: confirm the merge input is coherent, note any suspicious inconsistencies, and report how many findings were considered.",
    'Return ONLY JSON: {"status":"ok","findings_considered":number,"notes":string}',
    JSON.stringify({ findings: input.lane_findings }),
  ].join("\n")
}

export function createTieBreakTaskPrompt(input: {
  review_run_id: string
  profile: MergeConsensusResult["profile"]
  wave: number
  target: MaterializedReviewTarget
  conflicts: MergeConsensusResult["conflicts_for_tie_break"]
}): string {
  return [
    "Oracle runtime tie-break lane",
    `review_run_id=${input.review_run_id}`,
    `profile=${input.profile}`,
    `wave=${input.wave}`,
    `target_hash=${input.target.materialization.hash}`,
    "Resolve each conflict by selecting one lane.",
    'Return ONLY JSON: {"resolutions":[{"fingerprint":string,"selected_lane":"argus","rationale":string}]}',
    JSON.stringify({ conflicts: input.conflicts }),
  ].join("\n")
}
