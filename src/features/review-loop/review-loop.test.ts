declare const require: (name: string) => any
const { describe, expect, test } = require("bun:test")
import { createInitialReviewState, type PersistedReviewFinding } from "../review-state"
import { runReviewConvergenceLoop } from "./convergence-loop"
import { applyConvergenceWave } from "./convergence-wave"
import type { ReviewWaveFinding } from "./types"

function createWaveFinding(input: {
  fingerprint: string
  severity: "blocking" | "major" | "minor" | "nit"
  title?: string
}): ReviewWaveFinding {
  return {
    fingerprint: input.fingerprint,
    suppression_identity: input.fingerprint,
    category: "correctness",
    severity: input.severity,
    confidence: "high",
    title: input.title ?? `finding-${input.fingerprint}`,
    summary: "test summary",
    remediation_intent: "fix-issue",
    evidence: [{ path: "src/review.ts", symbol: "runReview", start_line: 10, end_line: 20 }],
  }
}

function createPersistedFinding(input: {
  fingerprint: string
  severity: PersistedReviewFinding["severity"]
  state: PersistedReviewFinding["state"]
}): PersistedReviewFinding {
  return {
    fingerprint: input.fingerprint,
    suppression_identity: input.fingerprint,
    category: "correctness",
    severity: input.severity,
    confidence: "high",
    title: `persisted-${input.fingerprint}`,
    summary: "persisted summary",
    remediation_intent: "fix-issue",
    evidence: [{ path: "src/review.ts", symbol: "runReview", start_line: 10, end_line: 20 }],
    state: input.state,
    first_seen_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    state_events: [{ to: input.state, at: "2026-04-01T00:00:00.000Z" }],
    seen_by: [],
  }
}

describe("review-loop convergence", () => {
  test("stops with dry stop reason when a wave introduces no new blocking or major findings", async () => {
    //#given
    const launched: string[] = []
    const state = createInitialReviewState({
      review_run_id: "run-dry",
      review_scope_key: "scope-dry",
      suppression_scope_key: "suppression-dry",
      now: "2026-04-01T10:00:00.000Z",
    })

    //#when
    const result = await runReviewConvergenceLoop({
      state,
      profile: "test",
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      manager: {
        launch: async (input) => {
          launched.push(input.description)
          return { id: `bg_${launched.length}`, sessionID: `ses_${launched.length}` }
        },
      } as never,
      lanePromptsForWave: (wave) => ({
        "argus-claude": `argus-claude wave ${wave}`,
        "argus-gpt": `argus-gpt wave ${wave}`,
      }),
      collectWaveFindings: () => [],
      nowForWave: () => "2026-04-01T10:00:01.000Z",
    })

    //#then
    expect(result.stop_reason).toBe("dry-wave-complete")
    expect(result.state.phase).toBe("pass_boundary")
    expect(result.state.wave_counters).toEqual({ completed_waves: 2, dry_waves: 2, consecutive_dry_waves: 2 })
    expect(result.state.stop_wave).toBe(2)
    expect(result.state.lane_lineage_by_wave["1"]).toHaveLength(2)
    expect(result.state.lane_lineage_by_wave["2"]).toHaveLength(2)
    expect(launched).toHaveLength(4)
  })

  test("stops with cap stop reason when cap is reached before convergence", async () => {
    //#given
    const state = createInitialReviewState({
      review_run_id: "run-cap",
      review_scope_key: "scope-cap",
      suppression_scope_key: "suppression-cap",
      now: "2026-04-01T11:00:00.000Z",
    })

    //#when
    const result = await runReviewConvergenceLoop({
      state,
      profile: "test",
      pass_cap_override: 2,
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      manager: {
        launch: async () => ({ id: "bg", sessionID: "ses" }),
      } as never,
      lanePromptsForWave: (wave) => ({
        "argus-claude": `argus-claude wave ${wave}`,
        "argus-gpt": `argus-gpt wave ${wave}`,
      }),
      collectWaveFindings: ({ wave }) => [createWaveFinding({ fingerprint: `f-${wave}`, severity: "major" })],
      nowForWave: (wave) => `2026-04-01T11:00:0${wave}.000Z`,
    })

    //#then
    expect(result.stop_reason).toBe("pass-cap-reached")
    expect(result.state.phase).toBe("pass_boundary")
    expect(result.state.wave_counters).toEqual({ completed_waves: 2, dry_waves: 0, consecutive_dry_waves: 0 })
    expect(result.state.stop_wave).toBe(2)
    expect(result.state.lane_lineage_by_wave["1"]).toHaveLength(2)
    expect(result.state.lane_lineage_by_wave["2"]).toHaveLength(2)
  })

  test("uses six waves as the default cap for the test profile", async () => {
    //#given
    const state = createInitialReviewState({
      review_run_id: "run-default-test-cap",
      review_scope_key: "scope-default-test-cap",
      suppression_scope_key: "suppression-default-test-cap",
      now: "2026-04-01T11:30:00.000Z",
    })

    //#when
    const result = await runReviewConvergenceLoop({
      state,
      profile: "test",
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      manager: {
        launch: async () => ({ id: "bg", sessionID: "ses" }),
      } as never,
      lanePromptsForWave: (wave) => ({
        "argus-claude": `argus-claude wave ${wave}`,
        "argus-gpt": `argus-gpt wave ${wave}`,
      }),
      collectWaveFindings: ({ wave }) => [createWaveFinding({ fingerprint: `f-${wave}`, severity: "major" })],
      nowForWave: (wave) => `2026-04-01T11:30:0${Math.min(wave, 9)}.000Z`,
    })

    //#then
    expect(result.stop_reason).toBe("pass-cap-reached")
    expect(result.state.wave_counters).toEqual({ completed_waves: 6, dry_waves: 0, consecutive_dry_waves: 0 })
    expect(result.state.stop_wave).toBe(6)
  })

  test("dismissed findings do not prolong convergence when repeated in a later wave", () => {
    //#given
    const state = createInitialReviewState({
      review_run_id: "run-dismissed",
      review_scope_key: "scope-dismissed",
      suppression_scope_key: "suppression-dismissed",
      now: "2026-04-01T12:00:00.000Z",
    })
    state.wave_counters = { completed_waves: 1, dry_waves: 1, consecutive_dry_waves: 1 }
    state.findings.fingerprintDismissed = createPersistedFinding({
      fingerprint: "fingerprintDismissed",
      severity: "blocking",
      state: "dismissed",
    })

    //#when
    const decision = applyConvergenceWave({
      state,
      profile: "test",
      wave_findings: [createWaveFinding({ fingerprint: "fingerprintDismissed", severity: "blocking" })],
      now: "2026-04-01T12:00:01.000Z",
    })

    //#then
    expect(decision.stop_reason).toBe("dry-wave-complete")
    expect(decision.new_high_severity_fingerprints).toHaveLength(0)
    expect(decision.state.findings.fingerprintDismissed?.state).toBe("dismissed")
  })

  test("accepted_open findings remain visible but do not retrigger continuation", () => {
    //#given
    const state = createInitialReviewState({
      review_run_id: "run-accepted-open",
      review_scope_key: "scope-accepted-open",
      suppression_scope_key: "suppression-accepted-open",
      now: "2026-04-01T13:00:00.000Z",
    })
    state.wave_counters = { completed_waves: 1, dry_waves: 1, consecutive_dry_waves: 1 }
    state.findings.fingerprintAccepted = createPersistedFinding({
      fingerprint: "fingerprintAccepted",
      severity: "major",
      state: "accepted_open",
    })

    //#when
    const decision = applyConvergenceWave({
      state,
      profile: "test",
      wave_findings: [createWaveFinding({ fingerprint: "fingerprintAccepted", severity: "major" })],
      now: "2026-04-01T13:00:01.000Z",
    })

    //#then
    expect(decision.stop_reason).toBe("dry-wave-complete")
    expect(decision.new_high_severity_fingerprints).toHaveLength(0)
    expect(decision.state.findings.fingerprintAccepted?.state).toBe("accepted_open")
    expect(decision.state.findings.fingerprintAccepted?.title).toBe("persisted-fingerprintAccepted")
  })

  test("wave counters remain deterministic by synchronized wave progression", () => {
    //#given
    const initial = createInitialReviewState({
      review_run_id: "run-wave",
      review_scope_key: "scope-wave",
      suppression_scope_key: "suppression-wave",
      now: "2026-04-01T14:00:00.000Z",
    })

    //#when
    const afterWave1 = applyConvergenceWave({
      state: initial,
      profile: "test",
      wave_findings: [createWaveFinding({ fingerprint: "wave-1-major", severity: "major" })],
      now: "2026-04-01T14:00:01.000Z",
    }).state
    const afterWave2 = applyConvergenceWave({
      state: afterWave1,
      profile: "test",
      wave_findings: [createWaveFinding({ fingerprint: "wave-2-minor", severity: "minor" })],
      now: "2026-04-01T14:00:02.000Z",
    }).state
    const afterWave3 = applyConvergenceWave({
      state: afterWave2,
      profile: "test",
      wave_findings: [],
      now: "2026-04-01T14:00:03.000Z",
    }).state

    //#then
    expect(afterWave2.wave_counters).toEqual({ completed_waves: 2, dry_waves: 1, consecutive_dry_waves: 1 })
    expect(afterWave2.stop_reason).toBeUndefined()
    expect(afterWave3.wave_counters).toEqual({ completed_waves: 3, dry_waves: 2, consecutive_dry_waves: 2 })
    expect(afterWave3.stop_reason).toBe("dry-wave-complete")
    expect(afterWave3.stop_wave).toBe(3)
  })

  test("counter resets on non-dry wave between two dry waves", () => {
    //#given
    const initial = createInitialReviewState({
      review_run_id: "run-reset",
      review_scope_key: "scope-reset",
      suppression_scope_key: "suppression-reset",
      now: "2026-04-01T15:00:00.000Z",
    })

    //#when
    const afterDry1 = applyConvergenceWave({
      state: initial,
      profile: "test",
      wave_findings: [],
      now: "2026-04-01T15:00:01.000Z",
    }).state

    const afterNonDry = applyConvergenceWave({
      state: afterDry1,
      profile: "test",
      wave_findings: [createWaveFinding({ fingerprint: "interrupt", severity: "major" })],
      now: "2026-04-01T15:00:02.000Z",
    }).state

    const afterDry2 = applyConvergenceWave({
      state: afterNonDry,
      profile: "test",
      wave_findings: [],
      now: "2026-04-01T15:00:03.000Z",
    }).state

    //#then
    expect(afterDry1.wave_counters.consecutive_dry_waves).toBe(1)
    expect(afterDry1.stop_reason).toBeUndefined()
    expect(afterNonDry.wave_counters.consecutive_dry_waves).toBe(0)
    expect(afterDry2.wave_counters.consecutive_dry_waves).toBe(1)
    expect(afterDry2.stop_reason).toBeUndefined()
  })

  test("consecutive_dry_waves defaults to 0 when missing from persisted state", () => {
    //#given
    const state = createInitialReviewState({
      review_run_id: "run-legacy",
      review_scope_key: "scope-legacy",
      suppression_scope_key: "suppression-legacy",
      now: "2026-04-01T16:00:00.000Z",
    })
    const legacyState = { ...state, wave_counters: { completed_waves: 1, dry_waves: 1 } as any }

    //#when
    const decision = applyConvergenceWave({
      state: legacyState,
      profile: "test",
      wave_findings: [],
      now: "2026-04-01T16:00:01.000Z",
    })

    //#then
    expect(decision.stop_reason).toBeUndefined()
    expect(decision.state.wave_counters.consecutive_dry_waves).toBe(1)
  })

  test("duplicate fingerprint normalization is deterministic regardless input order", () => {
    //#given
    const state = createInitialReviewState({
      review_run_id: "run-duplicate-order",
      review_scope_key: "scope-duplicate-order",
      suppression_scope_key: "suppression-duplicate-order",
      now: "2026-04-01T15:00:00.000Z",
    })
    const blockingVariant = createWaveFinding({
      fingerprint: "dup-fingerprint",
      severity: "blocking",
      title: "A-blocking-variant",
    })
    const majorVariant = createWaveFinding({
      fingerprint: "dup-fingerprint",
      severity: "major",
      title: "B-major-variant",
    })

    //#when
    const forward = applyConvergenceWave({
      state,
      profile: "test",
      wave_findings: [majorVariant, blockingVariant],
      now: "2026-04-01T15:00:01.000Z",
    })
    const reverse = applyConvergenceWave({
      state,
      profile: "test",
      wave_findings: [blockingVariant, majorVariant],
      now: "2026-04-01T15:00:01.000Z",
    })

    //#then
    expect(forward.state.findings["dup-fingerprint"]?.severity).toBe("blocking")
    expect(reverse.state.findings["dup-fingerprint"]?.severity).toBe("blocking")
    expect(forward.state.findings["dup-fingerprint"]?.title).toBe("A-blocking-variant")
    expect(reverse.state.findings["dup-fingerprint"]?.title).toBe("A-blocking-variant")
  })

  test("equal normalized duplicates use stable raw-content tiebreak independent of arrival order", () => {
    //#given
    const state = createInitialReviewState({
      review_run_id: "run-equal-normalized-order",
      review_scope_key: "scope-equal-normalized-order",
      suppression_scope_key: "suppression-equal-normalized-order",
      now: "2026-04-01T16:00:00.000Z",
    })
    const uppercaseVariant = {
      ...createWaveFinding({ fingerprint: "dup-equal", severity: "major", title: "Alpha Guard" }),
      summary: "Needs Null Check",
      remediation_intent: "Apply Null Guard",
    }
    const lowercaseVariant = {
      ...createWaveFinding({ fingerprint: "dup-equal", severity: "major", title: "alpha guard" }),
      summary: "needs null check",
      remediation_intent: "apply null guard",
    }

    //#when
    const forward = applyConvergenceWave({
      state,
      profile: "test",
      wave_findings: [lowercaseVariant, uppercaseVariant],
      now: "2026-04-01T16:00:01.000Z",
    })
    const reverse = applyConvergenceWave({
      state,
      profile: "test",
      wave_findings: [uppercaseVariant, lowercaseVariant],
      now: "2026-04-01T16:00:01.000Z",
    })

    //#then
    expect(forward.state.findings["dup-equal"]?.title).toBe(reverse.state.findings["dup-equal"]?.title)
    expect(forward.state.findings["dup-equal"]?.summary).toBe(reverse.state.findings["dup-equal"]?.summary)
    expect(forward.state.findings["dup-equal"]?.remediation_intent).toBe(
      reverse.state.findings["dup-equal"]?.remediation_intent,
    )
    expect(["Alpha Guard", "alpha guard"]).toContain(forward.state.findings["dup-equal"]?.title)
  })
})
