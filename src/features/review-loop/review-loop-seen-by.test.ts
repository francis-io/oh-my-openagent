declare const require: (name: string) => any
const { describe, expect, test } = require("bun:test")
import { createInitialReviewState } from "../review-state"
import type { PersistedReviewFinding } from "../review-state"
import { applyConvergenceWave } from "./convergence-wave"
import type { ReviewWaveFinding } from "./types"

function createWaveFinding(fingerprint: string): ReviewWaveFinding {
  return {
    fingerprint,
    suppression_identity: fingerprint,
    category: "correctness",
    severity: "major",
    confidence: "high",
    title: `finding-${fingerprint}`,
    summary: "test summary",
    remediation_intent: "fix-issue",
    evidence: [{ path: "src/review.ts", symbol: "runReview", start_line: 10, end_line: 20 }],
  }
}

function createResolvedFinding(fingerprint: string): PersistedReviewFinding {
  return {
    fingerprint,
    suppression_identity: fingerprint,
    category: "correctness",
    severity: "major",
    confidence: "high",
    title: `persisted-${fingerprint}`,
    summary: "persisted summary",
    remediation_intent: "fix-issue",
    evidence: [{ path: "src/review.ts", symbol: "runReview", start_line: 10, end_line: 20 }],
    state: "resolved_by_code_change",
    first_seen_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:05:00.000Z",
    state_events: [{ to: "resolved_by_code_change", at: "2026-04-01T00:05:00.000Z" }],
    seen_by: [{ lane: "argus", wave: 1 }],
  }
}

describe("review-loop seen_by provenance", () => {
  test("populates seen_by when wave provenance is provided", () => {
    const state = createInitialReviewState({
      review_run_id: "run-seen-by",
      review_scope_key: "scope-seen-by",
      suppression_scope_key: "suppression-seen-by",
      now: "2026-04-01T12:00:00.000Z",
    })

    const decision = applyConvergenceWave({
      state,
      profile: "test",
      wave_findings: [createWaveFinding("f-1")],
      wave_provenance: new Map([["f-1", [{ lane: "argus" }, { lane: "argus" }]]]),
      now: "2026-04-01T12:00:01.000Z",
    })

    expect(decision.state.findings["f-1"]?.seen_by).toEqual([
      { lane: "argus", wave: 1 },
    ])
  })

  test("accumulates seen_by across waves for repeated fingerprints", () => {
    const initial = createInitialReviewState({
      review_run_id: "run-seen-by-repeat",
      review_scope_key: "scope-seen-by-repeat",
      suppression_scope_key: "suppression-seen-by-repeat",
      now: "2026-04-01T12:30:00.000Z",
    })

    const afterWave1 = applyConvergenceWave({
      state: initial,
      profile: "test",
      wave_findings: [createWaveFinding("f-repeat")],
      wave_provenance: new Map([["f-repeat", [{ lane: "argus" }]]]),
      now: "2026-04-01T12:30:01.000Z",
    }).state
    const afterWave2 = applyConvergenceWave({
      state: afterWave1,
      profile: "test",
      wave_findings: [createWaveFinding("f-repeat")],
      wave_provenance: new Map([["f-repeat", [{ lane: "argus" }]]]),
      now: "2026-04-01T12:30:02.000Z",
    }).state

    expect(afterWave2.findings["f-repeat"]?.seen_by).toEqual([
      { lane: "argus", wave: 1 },
      { lane: "argus", wave: 2 },
    ])
  })

  test("deduplicates identical lane and wave provenance", () => {
    const state = createInitialReviewState({
      review_run_id: "run-seen-by-dedupe",
      review_scope_key: "scope-seen-by-dedupe",
      suppression_scope_key: "suppression-seen-by-dedupe",
      now: "2026-04-01T13:00:00.000Z",
    })

    const decision = applyConvergenceWave({
      state,
      profile: "test",
      wave_findings: [createWaveFinding("f-dedupe")],
      wave_provenance: new Map([["f-dedupe", [{ lane: "argus" }, { lane: "argus" }]]]),
      now: "2026-04-01T13:00:01.000Z",
    })

    expect(decision.state.findings["f-dedupe"]?.seen_by).toEqual([{ lane: "argus", wave: 1 }])
  })

  test("reopened resolved findings retain prior provenance and append new wave provenance", () => {
    const state = createInitialReviewState({
      review_run_id: "run-seen-by-reopen",
      review_scope_key: "scope-seen-by-reopen",
      suppression_scope_key: "suppression-seen-by-reopen",
      now: "2026-04-01T14:00:00.000Z",
    })
    state.wave_counters.completed_waves = 1
    state.findings["f-reopen"] = createResolvedFinding("f-reopen")

    const decision = applyConvergenceWave({
      state,
      profile: "test",
      wave_findings: [createWaveFinding("f-reopen")],
      wave_provenance: new Map([["f-reopen", [{ lane: "argus" }]]]),
      now: "2026-04-01T14:00:01.000Z",
    })

    expect(decision.state.findings["f-reopen"]?.state).toBe("candidate")
    expect(decision.state.findings["f-reopen"]?.seen_by).toEqual([
      { lane: "argus", wave: 1 },
      { lane: "argus", wave: 2 },
    ])
    expect(decision.state.findings["f-reopen"]?.state_events).toEqual([
      { to: "resolved_by_code_change", at: "2026-04-01T00:05:00.000Z" },
      { from: "resolved_by_code_change", to: "candidate", at: "2026-04-01T14:00:01.000Z", reason: "reopened-from-wave" },
    ])
  })
})
