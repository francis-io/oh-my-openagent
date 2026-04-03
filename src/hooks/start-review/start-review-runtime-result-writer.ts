import { writeCanonicalRemediationPlan } from "../../features/review-merge"
import type { PersistedReviewState } from "../../features/review-state"
import type { executeStartReviewRuntimeMergePhase } from "./start-review-runtime-merge-phase"
import { createReviewArtifactPaths } from "../../features/review-artifacts"
import { writeJsonFileAtomic } from "./start-review-runtime-file-write"

export function writeStartReviewRuntimeResultArtifacts(input: {
  paths: ReturnType<typeof createReviewArtifactPaths>
  workspaceRoot: string
  review_run_id: string
  review_scope_key: string
  suppression_scope_key: string
  mergePhase: Awaited<ReturnType<typeof executeStartReviewRuntimeMergePhase>>
  finalState: PersistedReviewState
  now: string
}): { remediationPlanRelativePath: string } {
  writeJsonFileAtomic(input.paths.mergedFindingsPath, {
    ...input.mergePhase.mergedAcrossWaves,
    consensus_findings: input.mergePhase.runtimeMerge.consensus_findings,
    runtime_execution: {
      merge: input.mergePhase.runtimeMerge.merge_execution,
      tie_break: input.mergePhase.runtimeMerge.tie_break_execution,
      lane_findings_aggregated_count: input.mergePhase.laneFindingsForMerge.length,
    },
  })
  writeJsonFileAtomic(
    input.paths.conflictsPath,
    { conflicts: input.mergePhase.runtimeMerge.unresolved_conflicts },
  )

  const remediation = writeCanonicalRemediationPlan({
    project_root: input.workspaceRoot,
    review_run_id: input.review_run_id,
    review_scope_key: input.review_scope_key,
    suppression_scope_key: input.suppression_scope_key,
    consensus_findings: input.mergePhase.runtimeMerge.consensus_findings,
    accepted_open_findings: Object.values(input.finalState.findings)
      .filter((finding) => finding.state === "accepted_open")
      .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint)),
    persisted_findings: input.finalState.findings,
    generated_at: input.now,
  })

  return {
    remediationPlanRelativePath: remediation.canonical_path.replace(`${input.workspaceRoot}/`, ""),
  }
}
