import type { ReviewMode } from "../../features/review-target-resolution"

const REVIEW_COMPLETED_PLAN_OPTION = "Review completed plan"
const REVIEW_FULL_REPOSITORY_OPTION = "Review full repository"

const PLAN_PATH_PATTERN = /(?:^|\s)((?:\.?\/)?\.sisyphus\/plans\/[\w./-]+\.md|\/[\w./-]*\.sisyphus\/plans\/[\w./-]+\.md)(?=$|\s)/i
const PLAN_FLAG_PATTERN = /(?:^|\s)--plan(?:=|\s+)([^\s]+)/i
const SOFT_MARKDOWN_PATTERN = /(?:https?:\/\/\S+\.md|(?:^|\s)[\w./-]+\.md(?=$|\s))/i
const REPO_WIDE_HINT_PATTERN = /\b(repo(?:sitory)?(?:-wide)?|full\s+repo(?:sitory)?|entire\s+repo(?:sitory)?|whole\s+repo(?:sitory)?|codebase|all\s+files)\b/i

type InferenceStrength = "high" | "soft" | "ambiguous"

export type StartReviewModeInference = {
  mode: ReviewMode
  shouldConfirm: boolean
  strength: InferenceStrength
  reason: string
  requested_input: string
  plan_path_hint?: string
  options: [string, string]
}

function normalizePlanPathHint(rawPath: string): string {
  return rawPath.replace(/^["']|["']$/g, "")
}

export function inferStartReviewMode(inputRaw: string): StartReviewModeInference {
  const input = inputRaw.trim()
  const dotOnly = input === "."
  const planPathMatch = input.match(PLAN_PATH_PATTERN)
  const planFlagMatch = input.match(PLAN_FLAG_PATTERN)
  const hasRepoWideHint = REPO_WIDE_HINT_PATTERN.test(input)

  const strongPlanPath = planPathMatch?.[1] ?? planFlagMatch?.[1]
  if (strongPlanPath && !hasRepoWideHint) {
    return {
      mode: "plan+git-diff",
      shouldConfirm: false,
      strength: "high",
      reason: "Detected explicit .sisyphus/plans/*.md plan context.",
      requested_input: input,
      plan_path_hint: normalizePlanPathHint(strongPlanPath),
      options: [REVIEW_COMPLETED_PLAN_OPTION, REVIEW_FULL_REPOSITORY_OPTION],
    }
  }

  if (strongPlanPath && hasRepoWideHint) {
    return {
      mode: "plan+git-diff",
      shouldConfirm: true,
      strength: "ambiguous",
      reason: "Detected both plan-like and repository-wide cues; confirmation is required.",
      requested_input: input,
      plan_path_hint: normalizePlanPathHint(strongPlanPath),
      options: [REVIEW_COMPLETED_PLAN_OPTION, REVIEW_FULL_REPOSITORY_OPTION],
    }
  }

  if (dotOnly) {
    return {
      mode: "repo-wide",
      shouldConfirm: true,
      strength: "ambiguous",
      reason: "Input is '.', which can mean current directory or full-repository review.",
      requested_input: input,
      options: [REVIEW_FULL_REPOSITORY_OPTION, REVIEW_COMPLETED_PLAN_OPTION],
    }
  }

  if (SOFT_MARKDOWN_PATTERN.test(input)) {
    return {
      mode: "plan+git-diff",
      shouldConfirm: true,
      strength: "soft",
      reason: "Detected markdown-like context, but not an explicit .sisyphus/plans/*.md plan path.",
      requested_input: input,
      options: [REVIEW_FULL_REPOSITORY_OPTION, REVIEW_COMPLETED_PLAN_OPTION],
    }
  }

  return {
    mode: "repo-wide",
    shouldConfirm: false,
    strength: "high",
    reason: "No plan-like cue detected; defaulting to repository-wide review.",
    requested_input: input,
    options: [REVIEW_FULL_REPOSITORY_OPTION, REVIEW_COMPLETED_PLAN_OPTION],
  }
}
