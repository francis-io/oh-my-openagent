import { createReviewArtifactPaths } from "../../features/review-artifacts"
import {
  createInitialReviewState,
  writeReviewStateAtomic,
  type PersistedReviewState,
} from "../../features/review-state"
import {
  writeMaterializedReviewTargetAtomic,
  type ReviewMode,
} from "../../features/review-target-resolution"
import type { ReviewProfileName } from "../../shared/model-requirements"
import { deriveRuntimeScopeKeys } from "./start-review-runtime-scope-keys"
import { resolveStartReviewRuntimeTarget } from "./start-review-runtime-target"

const BOOTSTRAP_REVIEW_SCOPE_KEY = "start-review-bootstrap-review-scope"
const BOOTSTRAP_SUPPRESSION_SCOPE_KEY = "start-review-bootstrap-suppression-scope"

export function bootstrapStartReviewRuntime(input: {
  workspaceRoot: string
  mode: ReviewMode
  sessionID: string
  planPathHint?: string
  profile: ReviewProfileName
  review_run_id: string
  now: string
}): {
  resolvedTarget: ReturnType<typeof resolveStartReviewRuntimeTarget>
  scopeKeys: ReturnType<typeof deriveRuntimeScopeKeys>
  paths: ReturnType<typeof createReviewArtifactPaths>
  initialState: PersistedReviewState
  persistReviewState: (state: PersistedReviewState) => void
} {
  const firstTarget = resolveStartReviewRuntimeTarget({
    workspaceRoot: input.workspaceRoot,
    mode: input.mode,
    review_scope_key: BOOTSTRAP_REVIEW_SCOPE_KEY,
    suppression_scope_key: BOOTSTRAP_SUPPRESSION_SCOPE_KEY,
    planPathHint: input.planPathHint,
    now: input.now,
  })
  const scopeKeys = deriveRuntimeScopeKeys({ target: firstTarget.target })
  const resolvedTarget = resolveStartReviewRuntimeTarget({
    workspaceRoot: input.workspaceRoot,
    mode: input.mode,
    review_scope_key: scopeKeys.review_scope_key,
    suppression_scope_key: scopeKeys.suppression_scope_key,
    planPathHint: input.planPathHint,
    now: input.now,
  })
  const paths = createReviewArtifactPaths({
    projectRoot: input.workspaceRoot,
    review_run_id: input.review_run_id,
    review_scope_key: scopeKeys.review_scope_key,
    suppression_scope_key: scopeKeys.suppression_scope_key,
  })
  const initialState = createInitialReviewState({
    profile: input.profile,
    review_run_id: input.review_run_id,
    coordinator_session_id: input.sessionID,
    review_scope_key: scopeKeys.review_scope_key,
    suppression_scope_key: scopeKeys.suppression_scope_key,
    ref_identity: resolvedTarget.target.ref_identity,
    now: input.now,
  })
  const persistReviewState = (state: PersistedReviewState): void => {
    writeReviewStateAtomic(paths.statePath, state)
  }

  writeMaterializedReviewTargetAtomic(paths.targetPath, resolvedTarget.target)
  persistReviewState(initialState)

  return {
    resolvedTarget,
    scopeKeys,
    paths,
    initialState,
    persistReviewState,
  }
}
