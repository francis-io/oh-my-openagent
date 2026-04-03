import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  applyFindingStateTransition,
  canTransitionFindingState,
  createReviewStateTempPath,
  createInitialReviewState,
  readReviewState,
  transitionFindingState,
  updateReviewState,
  writeReviewStateAtomic,
} from "./index"
import { buildLockedReviewSessionMarker, isLockedReviewSessionMarker } from "./review-session-marker"
import type { PersistedReviewFinding } from "./review-state-types"

const tempDirs: string[] = []

function createTempDir(): string {
  const path = mkdtempSync(join(tmpdir(), "omo-review-state-"))
  tempDirs.push(path)
  return path
}

function createFinding(state: PersistedReviewFinding["state"]): PersistedReviewFinding {
  return {
    fingerprint: "fprint-1",
    suppression_identity: "fprint-1",
    category: "correctness",
    severity: "major",
    confidence: "high",
    title: "Null guard",
    summary: "Missing guard",
    remediation_intent: "add-null-guard",
    evidence: [{ path: "src/foo.ts", symbol: "run", start_line: 10, end_line: 18 }],
    state,
    first_seen_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    state_events: [{ to: state, at: "2026-04-01T00:00:00.000Z" }],
    seen_by: [],
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) {
      rmSync(path, { recursive: true, force: true })
    }
  }
})

describe("review-state", () => {
  test("persists and reloads deterministic review state JSON", () => {
    //#given
    const directory = createTempDir()
    const statePath = join(directory, "review-state.json")
    const state = createInitialReviewState({
      review_run_id: "run-1",
      coordinator_session_id: "ses-coordinator",
      review_scope_key: "scope-1",
      suppression_scope_key: "suppression-1",
      now: "2026-04-01T01:00:00.000Z",
    })
    state.findings["fprint-1"] = createFinding("candidate")

    //#when
    writeReviewStateAtomic(statePath, state)
    const first = readReviewState(statePath)
    const second = readReviewState(statePath)

    //#then
    expect(first).not.toBeNull()
    expect(second).toEqual(first)
    expect(first?.coordinator_session_id).toBe("ses-coordinator")
    expect(first?.ref_identity).toEqual({ base_ref: null, head_ref: null })
    expect(first?.findings["fprint-1"]?.state).toBe("candidate")
  })

  test("returns null for invalid or missing state files", () => {
    //#given
    const directory = createTempDir()
    const missingPath = join(directory, "missing.json")
    const invalidPath = join(directory, "invalid.json")
    writeFileSync(invalidPath, "{not-json}", "utf-8")

    //#when
    const missing = readReviewState(missingPath)
    const invalid = readReviewState(invalidPath)

    //#then
    expect(missing).toBeNull()
    expect(invalid).toBeNull()
  })

  test("loads legacy findings without seen_by and defaults provenance to an empty array", () => {
    const directory = createTempDir()
    const statePath = join(directory, "legacy-state.json")
    writeFileSync(statePath, JSON.stringify({
      version: 1,
      profile: "test",
      review_run_id: "run-legacy",
      review_scope_key: "scope-legacy",
      suppression_scope_key: "suppression-legacy",
      ref_identity: { base_ref: null, head_ref: null },
      phase: "pass_boundary",
      created_at: "2026-04-01T01:00:00.000Z",
      updated_at: "2026-04-01T01:00:00.000Z",
      wave_counters: { completed_waves: 0, dry_waves: 0 },
      findings: {
        "legacy-finding": {
          fingerprint: "legacy-finding",
          suppression_identity: "legacy-finding",
          category: "correctness",
          severity: "major",
          confidence: "high",
          title: "Legacy finding",
          summary: "Legacy summary",
          remediation_intent: "fix-legacy",
          evidence: [{ path: "src/legacy.ts", symbol: "legacy", start_line: 1, end_line: 2 }],
          state: "candidate",
          first_seen_at: "2026-04-01T01:00:00.000Z",
          updated_at: "2026-04-01T01:00:00.000Z",
          state_events: [{ to: "candidate", at: "2026-04-01T01:00:00.000Z" }],
        },
      },
      locked_session_markers: { argus_lane_sessions: [] },
      lane_lineage_by_wave: {},
      locked_role_invocations: [],
    }, null, 2), "utf-8")

    const loaded = readReviewState(statePath)

    expect(loaded?.findings["legacy-finding"]?.seen_by).toEqual([])
  })

  test("supports required lifecycle transitions", () => {
    //#given
    const candidate = createFinding("candidate")

    //#when
    const merged = applyFindingStateTransition(candidate, "merged", {
      at: "2026-04-01T01:01:00.000Z",
      reason: "dedupe accepted",
    })
    const tieBroken = applyFindingStateTransition(merged, "tie-broken", {
      at: "2026-04-01T01:02:00.000Z",
      reason: "lane disagreement",
    })
    const acceptedOpen = applyFindingStateTransition(tieBroken, "accepted_open", {
      at: "2026-04-01T01:03:00.000Z",
      reason: "confirmed actionable",
    })
    const dismissed = applyFindingStateTransition(acceptedOpen, "dismissed", {
      at: "2026-04-01T01:04:00.000Z",
      reason: "user dismissed",
    })
    const resolved = applyFindingStateTransition(dismissed, "resolved_by_code_change", {
      at: "2026-04-01T01:05:00.000Z",
      reason: "code changed",
    })

    //#then
    expect(canTransitionFindingState("candidate", "merged")).toBe(true)
    expect(canTransitionFindingState("merged", "tie-broken")).toBe(true)
    expect(canTransitionFindingState("tie-broken", "accepted_open")).toBe(true)
    expect(canTransitionFindingState("accepted_open", "dismissed")).toBe(true)
    expect(canTransitionFindingState("dismissed", "resolved_by_code_change")).toBe(true)
    expect(resolved.state).toBe("resolved_by_code_change")
  })

  test("rejects invalid lifecycle transitions", () => {
    //#when
    const attempt = () => transitionFindingState("candidate", "tie-broken")

    //#then
    expect(attempt).toThrow("Invalid review finding state transition")
  })

  test("aligns locked review session marker identity format", () => {
    //#given
    const marker = buildLockedReviewSessionMarker("test", "argus-lane")

    //#then
    expect(marker).toBe("themis-review-role:test:argus-lane")
    expect(isLockedReviewSessionMarker(marker)).toBe(true)
  })

  test("updates state with restart-safe boundary semantics", () => {
    //#given
    const directory = createTempDir()
    const statePath = join(directory, "review-state.json")

    writeReviewStateAtomic(
      statePath,
      createInitialReviewState({
        review_run_id: "run-2",
        review_scope_key: "scope-2",
        suppression_scope_key: "suppression-2",
        now: "2026-04-01T02:00:00.000Z",
      }),
    )

    //#when
    const updated = updateReviewState(statePath, (previous) => {
      if (!previous) {
        return createInitialReviewState({
          review_run_id: "run-2",
          review_scope_key: "scope-2",
          suppression_scope_key: "suppression-2",
          now: "2026-04-01T02:00:00.000Z",
        })
      }

      return {
        ...previous,
        phase: "merge_pending",
        updated_at: "2026-04-01T02:05:00.000Z",
      }
    })

    //#then
    expect(updated.phase).toBe("merge_pending")
    expect(readReviewState(statePath)?.phase).toBe("merge_pending")
  })

  test("temp file naming stays unique within the same millisecond", () => {
    //#given
    const statePath = "/tmp/review-state.json"
    const originalNow = Date.now
    Date.now = () => 1_712_345_678_901

    try {
      //#when
      const first = createReviewStateTempPath(statePath)
      const second = createReviewStateTempPath(statePath)

      //#then
      expect(first).not.toBe(second)
      expect(first.startsWith(`${statePath}.tmp.1712345678901.`)).toBe(true)
      expect(second.startsWith(`${statePath}.tmp.1712345678901.`)).toBe(true)
    } finally {
      Date.now = originalNow
    }
  })

  test("initial state can persist explicit branch/ref identity", () => {
    const state = createInitialReviewState({
      review_run_id: "run-ref",
      review_scope_key: "scope-ref",
      suppression_scope_key: "suppression-ref",
      ref_identity: { base_ref: "main", head_ref: "feature" },
      now: "2026-04-01T03:00:00.000Z",
    })

    expect(state.ref_identity).toEqual({ base_ref: "main", head_ref: "feature" })
  })
})
