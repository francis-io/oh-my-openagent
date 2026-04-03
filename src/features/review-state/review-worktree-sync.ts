import { cpSync, existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { createReviewArtifactPaths } from "../review-artifacts"

const REVIEW_SYNC_FILES: Array<
  | "statePath"
  | "targetPath"
  | "mergedFindingsPath"
  | "conflictsPath"
  | "remediationPlanSnapshotPath"
  | "canonicalRemediationPathRefPath"
> = [
  "statePath",
  "targetPath",
  "mergedFindingsPath",
  "conflictsPath",
  "remediationPlanSnapshotPath",
  "canonicalRemediationPathRefPath",
]

function copyIfExists(input: {
  sourcePath: string
  destinationPath: string
  exists: (path: string) => boolean
  mkdir: (path: string, options: { recursive: true }) => void
  copy: (source: string, destination: string, options: { force?: boolean; recursive?: boolean }) => void
}): void {
  if (!input.exists(input.sourcePath)) {
    return
  }
  input.mkdir(dirname(input.destinationPath), { recursive: true })
  input.copy(input.sourcePath, input.destinationPath, { force: true })
}

export function syncReviewArtifactsFromWorktree(input: {
  worktree_path: string
  main_repo_path: string
  review_run_id: string
  review_scope_key: string
  suppression_scope_key: string
  deps?: {
    exists?: (path: string) => boolean
    mkdir?: (path: string, options: { recursive: true }) => void
    copy?: (source: string, destination: string, options: { force?: boolean; recursive?: boolean }) => void
  }
}): boolean {
  try {
    const exists = input.deps?.exists ?? existsSync
    const mkdir = input.deps?.mkdir ?? mkdirSync
    const copy = input.deps?.copy ?? cpSync
    const sourcePaths = createReviewArtifactPaths({
      projectRoot: input.worktree_path,
      review_run_id: input.review_run_id,
      review_scope_key: input.review_scope_key,
      suppression_scope_key: input.suppression_scope_key,
    })
    const destinationPaths = createReviewArtifactPaths({
      projectRoot: input.main_repo_path,
      review_run_id: input.review_run_id,
      review_scope_key: input.review_scope_key,
      suppression_scope_key: input.suppression_scope_key,
    })

    for (const key of REVIEW_SYNC_FILES) {
      copyIfExists({
        sourcePath: sourcePaths[key],
        destinationPath: destinationPaths[key],
        exists,
        mkdir,
        copy,
      })
    }

    const sourceLanesDir = sourcePaths.lanesDir
    const destinationLanesDir = destinationPaths.lanesDir
    if (exists(sourceLanesDir)) {
      mkdir(destinationLanesDir, { recursive: true })
      copy(sourceLanesDir, destinationLanesDir, { recursive: true, force: true })
    }

    return true
  } catch (error) {
    const capturedError = String(error)
    void capturedError
    return false
  }
}
