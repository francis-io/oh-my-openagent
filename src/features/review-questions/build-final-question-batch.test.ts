declare const require: (name: string) => any
const { describe, expect, test } = require("bun:test")
import { createInitialReviewState } from "../review-state"
import { buildFinalQuestionBatch } from "./build-final-question-batch"

describe("buildFinalQuestionBatch", () => {
  test("batches only unresolved conflicts into one final question wave", () => {
    const state = createInitialReviewState({
      review_run_id: "run-questions",
      review_scope_key: "scope",
      suppression_scope_key: "suppression",
      now: "2026-04-01T00:00:00.000Z",
    })
    state.findings.dismissed = {
      fingerprint: "dismissed",
      suppression_identity: "dismissed",
      category: "correctness",
      severity: "major",
      confidence: "high",
      title: "dismissed",
      summary: "dismissed",
      remediation_intent: "dismissed",
      evidence: [{ path: "src/a.ts" }],
      state: "dismissed",
      first_seen_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
      state_events: [{ to: "dismissed", at: "2026-04-01T00:00:00.000Z" }],
    }
    state.findings.accepted = {
      fingerprint: "accepted",
      suppression_identity: "accepted",
      category: "correctness",
      severity: "major",
      confidence: "high",
      title: "accepted",
      summary: "accepted",
      remediation_intent: "accepted",
      evidence: [{ path: "src/a.ts" }],
      state: "accepted_open",
      first_seen_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
      state_events: [{ to: "accepted_open", at: "2026-04-01T00:00:00.000Z" }],
    }

    const batch = buildFinalQuestionBatch({
      state,
      unresolved_conflicts: [
        {
          fingerprint: "dismissed",
          summary: "should be suppressed",
          options: ["a", "b"],
        },
        {
          fingerprint: "accepted",
          summary: "already accepted_open",
          options: ["a", "b"],
        },
        {
          fingerprint: "unresolved",
          summary: "needs user adjudication",
          options: ["a", "b"],
        },
      ],
    })

    expect(batch?.batch_id).toBe("final-user-question-wave")
    expect(batch?.conflicts.map((entry) => entry.fingerprint)).toEqual(["unresolved"])
    expect(batch?.conflicts[0]?.options).toContain("Dismiss finding")
  })

  test("dedupes unresolved conflicts by fingerprint", () => {
    const state = createInitialReviewState({
      review_run_id: "run-questions-dedupe",
      review_scope_key: "scope",
      suppression_scope_key: "suppression",
      now: "2026-04-01T00:00:00.000Z",
    })

    const batch = buildFinalQuestionBatch({
      state,
      unresolved_conflicts: [
        { fingerprint: "f-a", summary: "first", options: ["x"] },
        { fingerprint: "f-a", summary: "duplicate", options: ["y"] },
      ],
    })

    expect(batch?.conflicts).toHaveLength(1)
    expect(batch?.conflicts[0]?.summary).toBe("first")
    expect(batch?.conflicts[0]?.options).toEqual(["x", "Dismiss finding"])
  })
})
