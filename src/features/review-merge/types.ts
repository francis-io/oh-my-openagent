import type { ReviewWaveFinding } from "../review-loop"
import type { ReviewProfileName } from "../../shared/model-requirements"
import type { FindingProvenance, PersistedReviewFinding, PersistedReviewState } from "../review-state"
import type { ReviewTieBreakPlan } from "../review-routing"

export type LaneFindingInput = {
  lane: "argus" | "argus-gpt" | "argus-claude"
  finding: ReviewWaveFinding
}

export type ReviewMergeConflict = {
  fingerprint: string
  lane_findings: LaneFindingInput[]
}

export type ReviewConsensusFinding = {
  fingerprint: string
  source_lanes: Array<LaneFindingInput["lane"]>
  finding: ReviewWaveFinding
}

export type MergeConsensusResult = {
  profile: ReviewProfileName
  wave: number
  consensus_findings: ReviewConsensusFinding[]
  conflicts_for_tie_break: ReviewMergeConflict[]
  tie_break_route: ReviewTieBreakPlan
  suppressed_dismissed_fingerprints: string[]
  carried_accepted_open_findings: PersistedReviewFinding[]
}

export type WriteRemediationPlanInput = {
  project_root: string
  review_run_id: string
  review_scope_key: string
  suppression_scope_key: string
  generated_at?: string
  consensus_findings: ReviewConsensusFinding[]
  accepted_open_findings: PersistedReviewFinding[]
  persisted_findings?: Record<string, { seen_by?: FindingProvenance[] }>
}

export type WriteRemediationPlanResult = {
  canonical_path: string
  snapshot_path: string
}

export type UnresolvedConflictInput = {
  fingerprint: string
  summary: string
  options: string[]
}

export type FinalQuestionBatch = {
  batch_id: "final-user-question-wave"
  conflicts: UnresolvedConflictInput[]
}

export type BuildFinalQuestionBatchInput = {
  unresolved_conflicts: UnresolvedConflictInput[]
  state: PersistedReviewState
}
