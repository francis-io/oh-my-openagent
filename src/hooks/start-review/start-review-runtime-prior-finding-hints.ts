import type { PersistedReviewState } from "../../features/review-state"

export function collectPriorFindingHints(state: PersistedReviewState): Array<{
  fingerprint: string
  title: string
  summary: string
}> {
  return Object.values(state.findings)
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint))
    .slice(0, 200)
    .map((finding) => ({
      fingerprint: finding.fingerprint,
      title: finding.title,
      summary: finding.summary,
    }))
}
