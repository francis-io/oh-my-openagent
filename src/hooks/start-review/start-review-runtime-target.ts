import { resolve } from "node:path"
import { resolveReviewTarget, type MaterializedReviewTarget, type ReviewMode } from "../../features/review-target-resolution"

export function resolveStartReviewRuntimeTarget(input: {
  workspaceRoot: string
  mode: ReviewMode
  review_scope_key: string
  suppression_scope_key: string
  planPathHint?: string
  now: string
}): { mode: ReviewMode; target: MaterializedReviewTarget } {
  const resolvedPlanPath = input.planPathHint ? resolve(input.workspaceRoot, input.planPathHint) : undefined
  const target = resolveReviewTarget({
    mode: input.mode,
    project_root: input.workspaceRoot,
    review_scope_key: input.review_scope_key,
    suppression_scope_key: input.suppression_scope_key,
    plan_path: resolvedPlanPath,
    now: input.now,
  })

  return { mode: input.mode, target }
}
