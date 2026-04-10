import { resolveReviewProfileModelPolicy, type LockedReviewModelTuple, type ReviewProfileName } from "../../shared"
import { buildLockedReviewSessionMarker } from "../review-state"
import type { ReviewLaneName, ReviewWaveRoutingPlan } from "./types"

function lockMarkerForInvocation(profile: ReviewProfileName, role: "argus-lane" | "merge" | "tie-break", wave: number, lane?: string): string {
  const base = buildLockedReviewSessionMarker(profile, role)
  if (role !== "argus-lane") {
    return `${base}:wave-${wave}`
  }
  return `${base}:wave-${wave}:${lane ?? "lane"}`
}

function assertTupleAgent(tuple: LockedReviewModelTuple, expected: LockedReviewModelTuple["agent"], label: string): void {
  if (tuple.agent !== expected) {
    throw new Error(`Locked review routing is fail-closed: ${label} expected agent '${expected}' but received '${tuple.agent}'`)
  }
}

function deriveLaneName(tuple: LockedReviewModelTuple): ReviewLaneName {
  const normalized = `${tuple.provider}/${tuple.model}`.toLowerCase()
  if (normalized.includes("gpt")) return "argus-gpt"
  return "argus-claude"
}

export function assertReviewRoutingTupleContract(input: {
  laneTuples: LockedReviewModelTuple[]
  mergeTuple: LockedReviewModelTuple
  tieBreakTuple: LockedReviewModelTuple
}): void {
  for (const laneTuple of input.laneTuples) {
    assertTupleAgent(laneTuple, "argus", "argus lane")
  }
  assertTupleAgent(input.mergeTuple, "themis", "merge")
  assertTupleAgent(input.tieBreakTuple, "oracle", "tie-break")
}

export function createReviewWaveRoutingPlan(profile: ReviewProfileName, wave: number): ReviewWaveRoutingPlan {
  const normalizedWave = Math.max(1, Math.floor(wave))
  const policy = resolveReviewProfileModelPolicy(profile)

  assertReviewRoutingTupleContract({
    laneTuples: policy.lockedArgusLanes,
    mergeTuple: policy.merge,
    tieBreakTuple: policy.tieBreak,
  })

  const lanes = policy.lockedArgusLanes.map((tuple) => {
    const laneName = deriveLaneName(tuple)
    return {
      lane: laneName,
      role: "argus-lane" as const,
      lock_marker: lockMarkerForInvocation(profile, "argus-lane", normalizedWave, laneName),
      model_tuple: tuple,
    }
  })

  return {
    profile,
    wave: normalizedWave,
    lanes,
    merge: {
      role: "merge",
      lock_marker: lockMarkerForInvocation(profile, "merge", normalizedWave),
      model_tuple: policy.merge,
    },
    tie_break: {
      role: "tie-break",
      lock_marker: lockMarkerForInvocation(profile, "tie-break", normalizedWave),
      model_tuple: policy.tieBreak,
    },
  }
}
