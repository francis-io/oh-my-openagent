import type { ReviewProfileName } from "../../shared/model-requirements"

const REVIEW_PROFILE_PASS_CAPS: Record<ReviewProfileName, number> = {
  test: 6,
  production: 10,
}

export function resolveReviewPassCap(profile: ReviewProfileName, override?: number): number {
  if (typeof override === "number" && Number.isFinite(override)) {
    return Math.max(1, Math.floor(override))
  }

  return REVIEW_PROFILE_PASS_CAPS[profile]
}
