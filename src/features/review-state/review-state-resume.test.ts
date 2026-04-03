import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createInitialReviewState,
  normalizeReviewStateForResumeAtPassBoundary,
  readReviewState,
  syncReviewArtifactsFromWorktree,
  withPendingFinalConflictBatch,
  writeReviewStateAtomic,
} from "./index"

const tempDirs: string[] = []

function createTempDir(): string {
  const path = mkdtempSync(join(tmpdir(), "omo-review-resume-"))
  tempDirs.push(path)
  return path
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) {
      rmSync(path, { recursive: true, force: true })
    }
  }
})

describe("review-state resume + worktree sync", () => {
  test("reload restores profile, wave counters, suppression state, and pending final conflict batch", () => {
    const directory = createTempDir()
    const statePath = join(directory, "state.json")
    const initial = createInitialReviewState({
      profile: "production",
      review_run_id: "run-resume-1",
      review_scope_key: "scope-1",
      suppression_scope_key: "suppression-1",
      now: "2026-04-01T20:00:00.000Z",
    })

    initial.wave_counters = { completed_waves: 3, dry_waves: 1 }
    initial.findings.dismissedA = {
      fingerprint: "dismissedA",
      suppression_identity: "dismissedA",
      category: "correctness",
      severity: "major",
      confidence: "high",
      title: "dismissed",
      summary: "dismissed",
      remediation_intent: "skip",
      evidence: [{ path: "src/a.ts" }],
      state: "dismissed",
      first_seen_at: "2026-04-01T20:00:00.000Z",
      updated_at: "2026-04-01T20:00:00.000Z",
      state_events: [{ to: "dismissed", at: "2026-04-01T20:00:00.000Z" }],
      seen_by: [],
    }

    const withBatch = withPendingFinalConflictBatch(
      initial,
      {
        batch_id: "final-user-question-wave",
        conflicts: [{ fingerprint: "f-1", summary: "needs user input", options: ["a", "b"] }],
      },
      "2026-04-01T20:01:00.000Z",
    )

    writeReviewStateAtomic(statePath, withBatch)
    const loaded = readReviewState(statePath)

    expect(loaded?.profile).toBe("production")
    expect(loaded?.wave_counters).toEqual({ completed_waves: 3, dry_waves: 1 })
    expect(loaded?.findings.dismissedA?.state).toBe("dismissed")
    expect(loaded?.pending_final_conflict_batch?.batch_id).toBe("final-user-question-wave")
    expect(loaded?.pending_final_conflict_batch?.conflicts).toHaveLength(1)
  })

  test("resume at pass boundary prunes partial in-flight wave lineage and invocations", () => {
    const state = createInitialReviewState({
      profile: "test",
      review_run_id: "run-resume-2",
      review_scope_key: "scope-2",
      suppression_scope_key: "suppression-2",
      now: "2026-04-01T21:00:00.000Z",
    })

    state.phase = "merge_pending"
    state.wave_counters = { completed_waves: 1, dry_waves: 0 }
    state.lane_lineage_by_wave = {
      "1": [
        {
          invocation_type: "lane",
          profile: "test",
          wave: 1,
          role: "argus-lane",
          lane: "argus",
          lock_marker: "lane-1",
          model_tuple: { agent: "argus", provider: "openai", model: "gpt-5.4", variant: "xhigh", reasoningEffort: "xhigh" },
          surface: "task-background",
          task_id: "bg-1",
          session_id: "ses-1",
          created_at: "2026-04-01T21:00:01.000Z",
        },
      ],
      "2": [
        {
          invocation_type: "lane",
          profile: "test",
          wave: 2,
          role: "argus-lane",
          lane: "argus",
          lock_marker: "lane-2",
          model_tuple: { agent: "argus", provider: "anthropic", model: "claude-opus-4-1", variant: "max", thinking: { type: "enabled", budgetTokens: 32000 } },
          surface: "task-background",
          task_id: "bg-2",
          session_id: "ses-2",
          created_at: "2026-04-01T21:00:02.000Z",
        },
      ],
    }
    state.locked_role_invocations = [
      {
        invocation_type: "lane",
        profile: "test",
        wave: 1,
        role: "argus-lane",
        lane: "argus",
        lock_marker: "lane-1",
        model_tuple: { agent: "argus", provider: "openai", model: "gpt-5.4", variant: "xhigh", reasoningEffort: "xhigh" },
        surface: "task-background",
        created_at: "2026-04-01T21:00:01.000Z",
      },
      {
        invocation_type: "lane",
        profile: "test",
        wave: 2,
        role: "argus-lane",
        lane: "argus",
        lock_marker: "lane-2",
        model_tuple: { agent: "argus", provider: "anthropic", model: "claude-opus-4-1", variant: "max", thinking: { type: "enabled", budgetTokens: 32000 } },
        surface: "task-background",
        created_at: "2026-04-01T21:00:02.000Z",
      },
    ]

    const resumed = normalizeReviewStateForResumeAtPassBoundary(state, "2026-04-01T21:00:03.000Z")

    expect(resumed.phase).toBe("pass_boundary")
    expect(Object.keys(resumed.lane_lineage_by_wave)).toEqual(["1"])
    expect(resumed.locked_role_invocations).toHaveLength(1)
    expect(resumed.locked_session_markers.argus_lane_sessions).toEqual(["lane-1"])
  })

  test("pending final conflict batch keeps tie-break-pending phase across resume normalization", () => {
    const state = createInitialReviewState({
      profile: "test",
      review_run_id: "run-resume-pending-batch",
      review_scope_key: "scope-pending-batch",
      suppression_scope_key: "suppression-pending-batch",
      now: "2026-04-01T21:30:00.000Z",
    })

    state.phase = "merge_pending"
    state.pending_final_conflict_batch = {
      batch_id: "final-user-question-wave",
      conflicts: [{ fingerprint: "f-1", summary: "needs user input", options: ["keep", "Dismiss finding"] }],
    }

    const resumed = normalizeReviewStateForResumeAtPassBoundary(state, "2026-04-01T21:30:01.000Z")

    expect(resumed.phase).toBe("tie_break_pending")
    expect(resumed.pending_final_conflict_batch?.conflicts).toHaveLength(1)
  })

  test("review-specific worktree sync copies only review artifacts and canonical reference", () => {
    const directory = createTempDir()
    const worktree = join(directory, "worktree")
    const mainRepo = join(directory, "main")

    mkdirSync(join(worktree, ".sisyphus", "reviews", "run-sync", "lanes", "argus"), { recursive: true })
    mkdirSync(join(worktree, ".sisyphus", "plans"), { recursive: true })
    writeFileSync(join(worktree, ".sisyphus", "reviews", "run-sync", "state.json"), "{}", "utf-8")
    writeFileSync(join(worktree, ".sisyphus", "reviews", "run-sync", "canonical-remediation-path.txt"), "/repo/.sisyphus/plans/review-remediation-run-sync.md", "utf-8")
    writeFileSync(join(worktree, ".sisyphus", "reviews", "run-sync", "lanes", "argus", "pass-1.json"), "{}", "utf-8")
    writeFileSync(join(worktree, ".sisyphus", "plans", "manual-plan.md"), "do not sync this whole tree", "utf-8")

    const ok = syncReviewArtifactsFromWorktree({
      worktree_path: worktree,
      main_repo_path: mainRepo,
      review_run_id: "run-sync",
      review_scope_key: "scope-sync",
      suppression_scope_key: "suppression-sync",
    })

    expect(ok).toBe(true)
    expect(readFileSync(join(mainRepo, ".sisyphus", "reviews", "run-sync", "state.json"), "utf-8")).toBe("{}")
    expect(readFileSync(join(mainRepo, ".sisyphus", "reviews", "run-sync", "canonical-remediation-path.txt"), "utf-8")).toContain("review-remediation-run-sync.md")
    expect(readFileSync(join(mainRepo, ".sisyphus", "reviews", "run-sync", "lanes", "argus", "pass-1.json"), "utf-8")).toBe("{}")
    expect(() => readFileSync(join(mainRepo, ".sisyphus", "plans", "manual-plan.md"), "utf-8")).toThrow()
  })
})
