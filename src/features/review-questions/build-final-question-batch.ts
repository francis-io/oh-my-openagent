import type { BuildFinalQuestionBatchInput, FinalQuestionBatch } from "../review-merge"

const DISMISS_OPTION_LABEL = "Dismiss finding"

function withDismissOption(options: string[]): string[] {
  const deduped = new Set(options)
  deduped.add(DISMISS_OPTION_LABEL)
  return [...deduped]
}

export function buildFinalQuestionBatch(input: BuildFinalQuestionBatchInput): FinalQuestionBatch | null {
  const deduped = new Map<string, BuildFinalQuestionBatchInput["unresolved_conflicts"][number]>()

  for (const conflict of input.unresolved_conflicts) {
    if (!deduped.has(conflict.fingerprint)) {
      deduped.set(conflict.fingerprint, conflict)
    }
  }

  const conflicts = [...deduped.values()]
    .filter((conflict) => {
      const prior = input.state.findings[conflict.fingerprint]
      if (!prior) {
        return true
      }
      if (prior.state === "dismissed") {
        return false
      }
      if (prior.state === "accepted_open") {
        return false
      }
      return true
    })
    .map((conflict) => ({
      ...conflict,
      options: withDismissOption(conflict.options),
    }))
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint))

  if (conflicts.length === 0) {
    return null
  }

  return {
    batch_id: "final-user-question-wave",
    conflicts,
  }
}
