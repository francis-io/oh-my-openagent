import type { ReviewWaveFinding } from "../review-loop"
import type { PersistedReviewState } from "../review-state"
import type { LaneFindingInput } from "./types"

type LaneName = LaneFindingInput["lane"]

function baseFinding(input: {
  fingerprint: string
  severity: ReviewWaveFinding["severity"]
  title: string
  summary: string
  remediation_intent: string
}): ReviewWaveFinding {
  return {
    fingerprint: input.fingerprint,
    suppression_identity: input.fingerprint,
    category: "correctness",
    severity: input.severity,
    confidence: "high",
    title: input.title,
    summary: input.summary,
    remediation_intent: input.remediation_intent,
    evidence: [{ path: "src/review-flow.ts", symbol: "reviewFlow", start_line: 1, end_line: 1 }],
  }
}

export function createLaneFinding(lane: LaneName, finding: ReviewWaveFinding): LaneFindingInput {
  return { lane, finding }
}

export function createPlanModeWaveFindingsForConvergence(wave: number): ReviewWaveFinding[] {
  if (wave === 1) {
    return [
      baseFinding({
        fingerprint: "f-consensus",
        severity: "major",
        title: "Consensus issue",
        summary: "Both lanes should agree this is major",
        remediation_intent: "fix-consensus",
      }),
      baseFinding({
        fingerprint: "f-conflict",
        severity: "major",
        title: "Conflicted issue",
        summary: "Lanes disagree and require tie-break",
        remediation_intent: "fix-conflict",
      }),
      baseFinding({
        fingerprint: "f-dismissed",
        severity: "major",
        title: "Dismissed issue",
        summary: "Should be suppressed by branch-lifetime state",
        remediation_intent: "skip-dismissed",
      }),
      baseFinding({
        fingerprint: "f-accepted-open",
        severity: "major",
        title: "Accepted open issue",
        summary: "Should be carried to remediation output",
        remediation_intent: "track-accepted-open",
      }),
    ]
  }

  return [
    baseFinding({
      fingerprint: "f-consensus",
      severity: "major",
      title: "Consensus issue",
      summary: "No new high severity findings in this wave",
      remediation_intent: "fix-consensus",
    }),
    baseFinding({
      fingerprint: "f-dismissed",
      severity: "major",
      title: "Dismissed issue",
      summary: "Still dismissed",
      remediation_intent: "skip-dismissed",
    }),
  ]
}

export function createPlanModeWaveOneLaneFindings(): LaneFindingInput[] {
  return [
    createLaneFinding("argus", baseFinding({
      fingerprint: "f-consensus",
      severity: "major",
      title: "Consensus issue",
      summary: "Both lanes agree",
      remediation_intent: "fix-consensus",
    })),
    createLaneFinding("argus", baseFinding({
      fingerprint: "f-consensus",
      severity: "major",
      title: "Consensus issue",
      summary: "Both lanes agree",
      remediation_intent: "fix-consensus",
    })),
    createLaneFinding("argus", baseFinding({
      fingerprint: "f-conflict",
      severity: "major",
      title: "Conflicted issue",
      summary: "GPT lane calls this major",
      remediation_intent: "fix-conflict",
    })),
    createLaneFinding("argus", baseFinding({
      fingerprint: "f-conflict",
      severity: "blocking",
      title: "Conflicted issue",
      summary: "Claude lane calls this blocking",
      remediation_intent: "fix-conflict",
    })),
    createLaneFinding("argus", baseFinding({
      fingerprint: "f-dismissed",
      severity: "major",
      title: "Dismissed issue",
      summary: "Should be filtered",
      remediation_intent: "skip-dismissed",
    })),
    createLaneFinding("argus", baseFinding({
      fingerprint: "f-accepted-open",
      severity: "major",
      title: "Accepted open issue",
      summary: "Should remain visible",
      remediation_intent: "track-accepted-open",
    })),
  ]
}

export function seedSuppressionLifecycleState(state: PersistedReviewState): void {
  state.findings["f-dismissed"] = {
    ...baseFinding({
      fingerprint: "f-dismissed",
      severity: "major",
      title: "Dismissed issue",
      summary: "previously dismissed",
      remediation_intent: "skip-dismissed",
    }),
    state: "dismissed",
    first_seen_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    state_events: [{ to: "dismissed", at: "2026-04-01T00:00:00.000Z" }],
    seen_by: [],
  }
  state.findings["f-accepted-open"] = {
    ...baseFinding({
      fingerprint: "f-accepted-open",
      severity: "major",
      title: "Accepted open issue",
      summary: "previously accepted open",
      remediation_intent: "track-accepted-open",
    }),
    state: "accepted_open",
    first_seen_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    state_events: [{ to: "accepted_open", at: "2026-04-01T00:00:00.000Z" }],
    seen_by: [],
  }
}
