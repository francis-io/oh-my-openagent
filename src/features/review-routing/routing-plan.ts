import {
  REVIEW_PROFILE_MODEL_POLICIES,
  type LockedReviewModelTuple,
  type ReviewProfileName,
} from "../../shared/model-requirements"
import { buildLockedReviewSessionMarker } from "../review-state"
import type { ReviewWaveRoutingPlan } from "./types"

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

export function assertReviewRoutingTupleContract(input: {
  laneTuple: LockedReviewModelTuple
  mergeTuple: LockedReviewModelTuple
  tieBreakTuple: LockedReviewModelTuple
}): void {
  assertTupleAgent(input.laneTuple, "argus", "argus lane")
  assertTupleAgent(input.mergeTuple, "themis", "merge")
  assertTupleAgent(input.tieBreakTuple, "oracle", "tie-break")
}

export function createReviewWaveRoutingPlan(profile: ReviewProfileName, wave: number): ReviewWaveRoutingPlan {
  const normalizedWave = Math.max(1, Math.floor(wave))
  const policy = REVIEW_PROFILE_MODEL_POLICIES[profile]

  const laneTuple = policy.lockedArgusLane
  assertReviewRoutingTupleContract({
    laneTuple,
    mergeTuple: policy.merge,
    tieBreakTuple: policy.tieBreak,
  })

  return {
    profile,
    wave: normalizedWave,
    lanes: [
      {
        lane: "argus",
        role: "argus-lane",
        lock_marker: lockMarkerForInvocation(profile, "argus-lane", normalizedWave, "argus"),
        model_tuple: laneTuple,
      },
    ],
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
