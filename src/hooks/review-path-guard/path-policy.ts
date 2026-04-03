import { existsSync, realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from "node:path"

import { createReviewArtifactPaths } from "../../features/review-artifacts/review-artifact-paths"

export type ReviewRole = "themis" | "argus"

export type ReviewPathDecision = {
  allowed: boolean
  reason?: string
}

const REVIEW_PATH_PATTERN = /^\.sisyphus\/reviews\/([^/]+)(?:\/.*)?$/
const REMEDIATION_PATH_PATTERN = /^\.sisyphus\/plans\/review-remediation-(.+)\.md$/

function toPosixPath(path: string): string {
  return normalize(path).replace(/\\/g, "/")
}

function pathInside(target: string, root: string): boolean {
  const rel = relative(root, target)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

function nearestExistingAncestor(path: string): string {
  let current = path
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) {
      return current
    }

    current = parent
  }

  return current
}

function canonicalizeExistingPath(path: string): string {
  return normalize(realpathSync.native(path))
}

function canonicalizeTargetPath(path: string): string {
  if (existsSync(path)) {
    return canonicalizeExistingPath(path)
  }

  const absParent = dirname(path)
  const existingAncestor = nearestExistingAncestor(absParent)
  const canonicalAncestor = existsSync(existingAncestor)
    ? canonicalizeExistingPath(existingAncestor)
    : normalize(existingAncestor)
  const tail = relative(existingAncestor, path)
  return normalize(join(canonicalAncestor, tail))
}

function getReviewRootForRunId(workspaceRoot: string, runId: string): string {
  const reviewPaths = createReviewArtifactPaths({
    projectRoot: workspaceRoot,
    review_run_id: runId,
    review_scope_key: "guard",
    suppression_scope_key: "guard",
  })
  return reviewPaths.reviewRootDir
}

function getCanonicalRemediationPath(workspaceRoot: string, runId: string): string {
  const reviewRoot = getReviewRootForRunId(workspaceRoot, runId)
  const normalizedRunId = basename(reviewRoot)
  return join(workspaceRoot, ".sisyphus", "plans", `review-remediation-${normalizedRunId}.md`)
}

function validateReviewArtifactPath(relativePath: string, targetCanonicalPath: string, workspaceRoot: string): boolean {
  const match = relativePath.match(REVIEW_PATH_PATTERN)
  if (!match) {
    return false
  }

  try {
    const runId = match[1]
    const reviewRoot = getReviewRootForRunId(workspaceRoot, runId)
    const canonicalReviewRoot = canonicalizeTargetPath(reviewRoot)
    return pathInside(targetCanonicalPath, canonicalReviewRoot)
  } catch (error) {
    void error
    return false
  }
}

function validateRemediationPath(relativePath: string, targetCanonicalPath: string, workspaceRoot: string): boolean {
  const match = relativePath.match(REMEDIATION_PATH_PATTERN)
  if (!match) {
    return false
  }

  try {
    const runId = match[1]
    const expectedPath = getCanonicalRemediationPath(workspaceRoot, runId)
    const canonicalExpectedPath = canonicalizeTargetPath(expectedPath)
    return targetCanonicalPath === canonicalExpectedPath
  } catch (error) {
    void error
    return false
  }
}

export function evaluateReviewPathPolicy(input: {
  workspaceRoot: string
  filePath: string
  role: ReviewRole
}): ReviewPathDecision {
  const workspaceRootCanonical = canonicalizeTargetPath(resolve(input.workspaceRoot))
  const targetAbsolutePath = isAbsolute(input.filePath)
    ? input.filePath
    : resolve(input.workspaceRoot, input.filePath)
  const targetCanonicalPath = canonicalizeTargetPath(targetAbsolutePath)

  if (!pathInside(targetCanonicalPath, workspaceRootCanonical)) {
    return {
      allowed: false,
      reason: "path escapes workspace root via traversal or symlink",
    }
  }

  const relativePath = toPosixPath(relative(workspaceRootCanonical, targetCanonicalPath))
  const isArtifactPath = validateReviewArtifactPath(relativePath, targetCanonicalPath, workspaceRootCanonical)
  if (isArtifactPath) {
    return { allowed: true }
  }

  if (input.role === "themis") {
    const isRemediationPath = validateRemediationPath(
      relativePath,
      targetCanonicalPath,
      workspaceRootCanonical,
    )
    if (isRemediationPath) {
      return { allowed: true }
    }
  }

  if (relativePath.startsWith(".sisyphus/")) {
    return {
      allowed: false,
      reason: "reserved .sisyphus path outside review artifact contract",
    }
  }

  return {
    allowed: false,
    reason: "source or non-review file writes are blocked",
  }
}
