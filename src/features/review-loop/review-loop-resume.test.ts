declare const require: (name: string) => any
const { describe, expect, test } = require("bun:test")
import { createInitialReviewState } from "../review-state"
import { runReviewConvergenceLoop } from "./convergence-loop"

describe("review-loop resume safety", () => {
  test("restart at pass boundary never mixes stale partial-wave output with fresh output", async () => {
    const state = createInitialReviewState({
      profile: "test",
      review_run_id: "run-loop-resume",
      review_scope_key: "scope-loop-resume",
      suppression_scope_key: "suppression-loop-resume",
      now: "2026-04-01T22:00:00.000Z",
    })

    state.phase = "merge_pending"
    state.wave_counters = { completed_waves: 1, dry_waves: 0, consecutive_dry_waves: 0 }
    state.lane_lineage_by_wave = {
      "1": [
        {
          invocation_type: "lane",
          profile: "test",
          wave: 1,
          role: "argus-lane",
          lane: "argus",
          lock_marker: "kept-wave-1",
          model_tuple: { agent: "argus", provider: "anthropic", model: "claude-opus-4-6", variant: "max", thinking: { type: "enabled", budgetTokens: 32000 } },
          surface: "task-background",
          created_at: "2026-04-01T22:00:01.000Z",
        },
      ],
      "2": [
        {
          invocation_type: "lane",
          profile: "test",
          wave: 2,
          role: "argus-lane",
          lane: "argus",
          lock_marker: "stale-wave-2",
          model_tuple: { agent: "argus", provider: "anthropic", model: "claude-opus-4-1", variant: "max", thinking: { type: "enabled", budgetTokens: 32000 } },
          surface: "task-background",
          created_at: "2026-04-01T22:00:02.000Z",
        },
      ],
    }
    state.locked_role_invocations = [
      {
        invocation_type: "lane",
        profile: "test",
        wave: 2,
        role: "argus-lane",
        lane: "argus",
        lock_marker: "stale-wave-2",
        model_tuple: { agent: "argus", provider: "anthropic", model: "claude-opus-4-1", variant: "max", thinking: { type: "enabled", budgetTokens: 32000 } },
        surface: "task-background",
        created_at: "2026-04-01T22:00:02.000Z",
      },
    ]

    const launched: string[] = []
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
      nowForWave: (wave) => `2026-04-01T22:00:0${wave}.000Z`,
    })

    expect(launched).toEqual([
      "argus argus-claude wave 2",
      "argus argus-gpt wave 2",
      "argus argus-claude wave 3",
      "argus argus-gpt wave 3",
    ])
    expect(result.state.lane_lineage_by_wave["2"]).toHaveLength(2)
    expect(result.state.lane_lineage_by_wave["2"]?.some((entry) => entry.lock_marker === "stale-wave-2")).toBe(false)
    expect(result.state.lane_lineage_by_wave["3"]).toHaveLength(2)
    expect(result.stop_reason).toBe("dry-wave-complete")
  })

  test("resume fails closed when requested profile drifts from persisted profile", async () => {
    const state = createInitialReviewState({
      profile: "production",
      review_run_id: "run-loop-profile-drift",
      review_scope_key: "scope-loop-profile-drift",
      suppression_scope_key: "suppression-loop-profile-drift",
      now: "2026-04-01T22:10:00.000Z",
    })

    const attempt = runReviewConvergenceLoop({
      state,
      profile: "test",
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      manager: { launch: async () => ({ id: "bg", sessionID: "ses" }) } as never,
      lanePromptsForWave: () => ({ "argus-claude": "a", "argus-gpt": "a" }),
      collectWaveFindings: () => [],
    })

    await expect(attempt).rejects.toThrow("Review profile drift detected during resume")
  })
})
