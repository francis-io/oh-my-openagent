declare const require: (name: string) => any
const { describe, expect, test } = require("bun:test")
import { createInitialReviewState } from "../review-state"
import { mergeReviewFindings } from "./merge-findings"

function laneFinding(input: {
  lane: "argus" | "argus"
  fingerprint: string
  severity: "blocking" | "major" | "minor" | "nit"
  title?: string
}) {
  return {
    lane: input.lane,
    finding: {
      fingerprint: input.fingerprint,
      suppression_identity: input.fingerprint,
      category: "correctness" as const,
      severity: input.severity,
      confidence: "high" as const,
      title: input.title ?? `${input.fingerprint}-title`,
      summary: `${input.fingerprint}-summary`,
      remediation_intent: "fix",
      evidence: [{ path: "src/foo.ts", symbol: "foo", start_line: 1, end_line: 2 }],
    },
  }
}

describe("mergeReviewFindings", () => {
  test("dedupes deterministic consensus findings across lanes", () => {
    const state = createInitialReviewState({
      review_run_id: "run-merge-consensus",
      review_scope_key: "scope",
      suppression_scope_key: "suppression",
      now: "2026-04-01T00:00:00.000Z",
    })

    const result = mergeReviewFindings({
      profile: "test",
      wave: 1,
      state,
      lane_findings: [
        laneFinding({ lane: "argus", fingerprint: "f-1", severity: "major" }),
        laneFinding({ lane: "argus", fingerprint: "f-1", severity: "major" }),
        laneFinding({ lane: "argus", fingerprint: "f-1", severity: "major" }),
      ],
    })

    expect(result.consensus_findings).toHaveLength(1)
    expect(result.consensus_findings[0]?.fingerprint).toBe("f-1")
    expect(result.conflicts_for_tie_break).toHaveLength(0)
  })

  test("single lane deduplicates same-fingerprint findings to consensus by highest severity", () => {
    const state = createInitialReviewState({
      review_run_id: "run-merge-single-lane",
      review_scope_key: "scope",
      suppression_scope_key: "suppression",
      now: "2026-04-01T00:00:00.000Z",
    })

    const result = mergeReviewFindings({
      profile: "test",
      wave: 2,
      state,
      lane_findings: [
        laneFinding({ lane: "argus", fingerprint: "f-2", severity: "major", title: "issue" }),
        laneFinding({ lane: "argus", fingerprint: "f-2", severity: "blocking", title: "issue" }),
      ],
    })

    expect(result.consensus_findings).toHaveLength(1)
    expect(result.consensus_findings[0]?.finding.severity).toBe("blocking")
    expect(result.conflicts_for_tie_break).toHaveLength(0)
  })

  test("suppresses dismissed and carries accepted_open branch-lifetime findings", () => {
    const state = createInitialReviewState({
      review_run_id: "run-suppression",
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
      remediation_intent: "skip",
      evidence: [{ path: "src/foo.ts" }],
      state: "dismissed",
      first_seen_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
      state_events: [{ to: "dismissed", at: "2026-04-01T00:00:00.000Z" }],
      seen_by: [],
    }
    state.findings.accepted = {
      fingerprint: "accepted",
      suppression_identity: "accepted",
      category: "correctness",
      severity: "major",
      confidence: "high",
      title: "accepted",
      summary: "accepted",
      remediation_intent: "keep",
      evidence: [{ path: "src/foo.ts" }],
      state: "accepted_open",
      first_seen_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
      state_events: [{ to: "accepted_open", at: "2026-04-01T00:00:00.000Z" }],
      seen_by: [],
    }

    const result = mergeReviewFindings({
      profile: "test",
      wave: 1,
      state,
      lane_findings: [
        laneFinding({ lane: "argus", fingerprint: "dismissed", severity: "major" }),
        laneFinding({ lane: "argus", fingerprint: "accepted", severity: "major" }),
      ],
    })

    expect(result.suppressed_dismissed_fingerprints).toEqual(["dismissed"])
    expect(result.carried_accepted_open_findings.map((finding) => finding.fingerprint)).toEqual(["accepted"])
    expect(result.consensus_findings).toHaveLength(0)
    expect(result.conflicts_for_tie_break).toHaveLength(0)
  })

  test("dedupes same lane and fingerprint deterministically regardless duplicate order", () => {
    const state = createInitialReviewState({
      review_run_id: "run-lane-duplicate-order",
      review_scope_key: "scope",
      suppression_scope_key: "suppression",
      now: "2026-04-01T00:00:00.000Z",
    })

    const gptBlocking = laneFinding({ lane: "argus", fingerprint: "f-order", severity: "blocking", title: "A" })
    const gptMajor = laneFinding({ lane: "argus", fingerprint: "f-order", severity: "major", title: "B" })
    const claudeBlocking = laneFinding({ lane: "argus", fingerprint: "f-order", severity: "blocking", title: "A" })

    const forward = mergeReviewFindings({
      profile: "test",
      wave: 1,
      state,
      lane_findings: [gptMajor, gptBlocking, claudeBlocking],
    })

    const reverse = mergeReviewFindings({
      profile: "test",
      wave: 1,
      state,
      lane_findings: [gptBlocking, gptMajor, claudeBlocking],
    })

    expect(forward.conflicts_for_tie_break).toHaveLength(0)
    expect(reverse.conflicts_for_tie_break).toHaveLength(0)
    expect(forward.consensus_findings).toHaveLength(1)
    expect(reverse.consensus_findings).toHaveLength(1)
    expect(forward.consensus_findings[0]?.finding.severity).toBe("blocking")
    expect(reverse.consensus_findings[0]?.finding.severity).toBe("blocking")
    expect(forward.consensus_findings[0]?.source_lanes).toEqual(["argus"])
    expect(reverse.consensus_findings[0]?.source_lanes).toEqual(["argus"])
  })

  test("equal merge signatures use stable raw-content tiebreak independent of arrival order", () => {
    const state = createInitialReviewState({
      review_run_id: "run-equal-signature-order",
      review_scope_key: "scope",
      suppression_scope_key: "suppression",
      now: "2026-04-01T00:00:00.000Z",
    })

    const gptUppercase = {
      lane: "argus" as const,
      finding: {
        ...laneFinding({ lane: "argus", fingerprint: "f-equal", severity: "major", title: "Null Guard" }).finding,
        summary: "Needs Null Check",
        remediation_intent: "Apply Null Guard",
      },
    }
    const gptLowercase = {
      lane: "argus" as const,
      finding: {
        ...laneFinding({ lane: "argus", fingerprint: "f-equal", severity: "major", title: "null guard" }).finding,
        summary: "needs null check",
        remediation_intent: "apply null guard",
      },
    }
    const claudeUppercase = {
      lane: "argus" as const,
      finding: {
        ...laneFinding({ lane: "argus", fingerprint: "f-equal", severity: "major", title: "Null Guard" }).finding,
        summary: "Needs Null Check",
        remediation_intent: "Apply Null Guard",
      },
    }

    const forward = mergeReviewFindings({
      profile: "test",
      wave: 1,
      state,
      lane_findings: [gptLowercase, gptUppercase, claudeUppercase],
    })

    const reverse = mergeReviewFindings({
      profile: "test",
      wave: 1,
      state,
      lane_findings: [gptUppercase, gptLowercase, claudeUppercase],
    })

    expect(forward.conflicts_for_tie_break).toHaveLength(0)
    expect(reverse.conflicts_for_tie_break).toHaveLength(0)
    expect(forward.consensus_findings).toHaveLength(1)
    expect(reverse.consensus_findings).toHaveLength(1)
    expect(forward.consensus_findings[0]?.finding.title).toBe(reverse.consensus_findings[0]?.finding.title)
    expect(forward.consensus_findings[0]?.finding.summary).toBe(reverse.consensus_findings[0]?.finding.summary)
    expect(["Null Guard", "null guard"]).toContain(forward.consensus_findings[0]?.finding.title)
  })
})
