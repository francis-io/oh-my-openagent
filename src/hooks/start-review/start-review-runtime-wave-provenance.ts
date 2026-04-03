import type { ReviewConvergenceLoopInput } from "../../features/review-loop"
import type { RuntimeLaneFindingRecord } from "./start-review-runtime-lane-findings"

export function collectRuntimeWaveProvenance(
  laneFindingsByWave: Map<number, RuntimeLaneFindingRecord[]>,
): ReviewConvergenceLoopInput["collectWaveProvenance"] {
  return ({ wave }) => {
    const collected = laneFindingsByWave.get(wave)
    if (!collected) {
      return undefined
    }

    const provenance = new Map<string, Array<{ lane: "argus" | "argus-gpt" | "argus-claude" }>>()
    for (const record of collected) {
      const existing = provenance.get(record.finding.fingerprint) ?? []
      provenance.set(record.finding.fingerprint, [...existing, { lane: record.lane }])
    }

    return provenance
  }
}
