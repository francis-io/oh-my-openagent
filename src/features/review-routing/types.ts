import type {
  LockedReviewModelTuple,
  LockedReviewRole,
  ReviewProfileName,
} from "../../shared/model-requirements"

export type ReviewLaneName = "argus-claude" | "argus-gpt"

export type LockedInvocationSurface = "task-background"

export type LockedInvocationType = "lane" | "merge" | "tie-break"

export type LockedInvocationRecord = {
  invocation_type: LockedInvocationType
  profile: ReviewProfileName
  wave: number
  role: LockedReviewRole
  lane: ReviewLaneName | null
  lock_marker: string
  model_tuple: LockedReviewModelTuple
  surface: LockedInvocationSurface
  task_id?: string
  session_id?: string
  created_at: string
}

export type ReviewLanePlan = {
  lane: ReviewLaneName
  role: "argus-lane"
  lock_marker: string
  model_tuple: LockedReviewModelTuple
}

export type ReviewMergePlan = {
  role: "merge"
  lock_marker: string
  model_tuple: LockedReviewModelTuple
}

export type ReviewTieBreakPlan = {
  role: "tie-break"
  lock_marker: string
  model_tuple: LockedReviewModelTuple
}

export type ReviewWaveRoutingPlan = {
  profile: ReviewProfileName
  wave: number
  lanes: ReviewLanePlan[]
  merge: ReviewMergePlan
  tie_break: ReviewTieBreakPlan
}
