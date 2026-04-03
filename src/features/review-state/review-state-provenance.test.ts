import { describe, expect, test } from "bun:test"
import { PersistedReviewFindingSchema } from "./review-state-types"

describe("review-state provenance", () => {
  test("defaults seen_by to an empty array when omitted", () => {
    const parsed = PersistedReviewFindingSchema.parse({
      fingerprint: "fprint-1",
      suppression_identity: "fprint-1",
      category: "correctness",
      severity: "major",
      confidence: "high",
      title: "Null guard",
      summary: "Missing guard",
      remediation_intent: "add-null-guard",
      evidence: [{ path: "src/foo.ts", symbol: "run", start_line: 10, end_line: 18 }],
      state: "candidate",
      first_seen_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
      state_events: [{ to: "candidate", at: "2026-04-01T00:00:00.000Z" }],
    })

    expect(parsed.seen_by).toEqual([])
  })

  test("validates seen_by entries", () => {
    const parsed = PersistedReviewFindingSchema.parse({
      fingerprint: "fprint-2",
      suppression_identity: "fprint-2",
      category: "correctness",
      severity: "major",
      confidence: "high",
      title: "Null guard",
      summary: "Missing guard",
      remediation_intent: "add-null-guard",
      evidence: [{ path: "src/foo.ts", symbol: "run", start_line: 10, end_line: 18 }],
      state: "candidate",
      first_seen_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
      state_events: [{ to: "candidate", at: "2026-04-01T00:00:00.000Z" }],
      seen_by: [
        { lane: "argus", wave: 1 },
        { lane: "argus", wave: 2 },
      ],
    })

    expect(parsed.seen_by).toEqual([
      { lane: "argus", wave: 1 },
      { lane: "argus", wave: 2 },
    ])
  })
})
