import { join } from "node:path"
import { sanitizeLaneName } from "./lane-name"

export type ReviewArtifactPathInput = {
  projectRoot: string
  review_run_id: string
  review_scope_key: string
  suppression_scope_key: string
}

type SafeSegmentKind = "review-run-id" | "review-scope-key" | "suppression-scope-key" | "pass-number"

function toSafeSegment(value: string, kind: SafeSegmentKind): string {
  const segment = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")

  if (!segment || segment === "." || segment === "..") {
    throw new Error(`Invalid ${kind}: '${value}'`)
  }

  return segment
}

export function createReviewArtifactPaths(input: ReviewArtifactPathInput) {
  const reviewRunId = toSafeSegment(input.review_run_id, "review-run-id")
  const reviewScopeKey = toSafeSegment(input.review_scope_key, "review-scope-key")
  const suppressionScopeKey = toSafeSegment(input.suppression_scope_key, "suppression-scope-key")

  const reviewRootDir = join(input.projectRoot, ".sisyphus", "reviews", reviewRunId)
  const lanesDir = join(reviewRootDir, "lanes")

  return {
    reviewRootDir,
    review_scope_key: reviewScopeKey,
    suppression_scope_key: suppressionScopeKey,
    lanesDir,
    targetPath: join(reviewRootDir, "target.json"),
    statePath: join(reviewRootDir, "state.json"),
    mergedFindingsPath: join(reviewRootDir, "merged-findings.json"),
    conflictsPath: join(reviewRootDir, "conflicts.json"),
    remediationPlanSnapshotPath: join(reviewRootDir, "remediation-plan.snapshot.md"),
    canonicalRemediationPathRefPath: join(reviewRootDir, "canonical-remediation-path.txt"),
    laneDir(laneName: string): string {
      return join(lanesDir, sanitizeLaneName(laneName))
    },
    lanePassJsonPath(laneName: string, passNumber: number): string {
      const safePass = toSafeSegment(String(Math.max(1, Math.floor(passNumber))), "pass-number")
      return join(lanesDir, sanitizeLaneName(laneName), `pass-${safePass}.json`)
    },
    lanePassMarkdownPath(laneName: string, passNumber: number): string {
      const safePass = toSafeSegment(String(Math.max(1, Math.floor(passNumber))), "pass-number")
      return join(lanesDir, sanitizeLaneName(laneName), `pass-${safePass}.md`)
    },
  }
}
