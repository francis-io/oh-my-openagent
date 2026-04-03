import type { FindingProvenance, PersistedReviewFinding, PersistedReviewState } from "../review-state"
import type { ReviewWaveFinding, ReviewWaveProvenanceMap } from "./types"

export function appendWaveProvenanceToFinding(input: {
  finding: PersistedReviewFinding
  state: PersistedReviewState
  waveFinding: ReviewWaveFinding
  wave_provenance?: ReviewWaveProvenanceMap
}): PersistedReviewFinding {
  const wave = input.state.wave_counters.completed_waves + 1
  const lanes = input.wave_provenance?.get(input.waveFinding.fingerprint) ?? []
  const existingSeenBy = input.finding.seen_by ?? []
  const knownEntries = new Set(existingSeenBy.map((entry) => `${entry.lane}:${entry.wave}`))
  const newEntries: FindingProvenance[] = []

  for (const lane of lanes) {
    const key = `${lane.lane}:${wave}`
    if (knownEntries.has(key)) {
      continue
    }

    knownEntries.add(key)
    newEntries.push({ lane: lane.lane, wave })
  }

  if (newEntries.length === 0) {
    return input.finding
  }

  return {
    ...input.finding,
    seen_by: [...existingSeenBy, ...newEntries],
  }
}
