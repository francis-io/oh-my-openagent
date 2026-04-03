import { afterEach, describe, expect, test } from "bun:test"
import {
  _resetLockedReviewRuntimeSessionRegistryForTesting,
  getLockedReviewRuntimeSession,
  isLockedReviewRuntimeSession,
  registerLockedReviewRuntimeSession,
} from "./locked-review-session-registry"

describe("locked-review-session-registry", () => {
  afterEach(() => {
    _resetLockedReviewRuntimeSessionRegistryForTesting()
  })

  test("recognizes opaque runtime session ids after registration", () => {
    registerLockedReviewRuntimeSession("ses_runtime_lane_1", {
      profile: "test",
      role: "argus-lane",
      wave: 1,
      lane: "argus",
    })

    expect(isLockedReviewRuntimeSession("ses_runtime_lane_1")).toBe(true)
    expect(getLockedReviewRuntimeSession("ses_runtime_lane_1")).toEqual({
      profile: "test",
      role: "argus-lane",
      wave: 1,
      lane: "argus",
    })
  })
})
