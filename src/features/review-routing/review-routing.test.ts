declare const require: (name: string) => any
const { afterEach, describe, expect, spyOn, test } = require("bun:test")
import * as connectedProvidersCache from "../../shared/connected-providers-cache"
import { createInitialReviewState } from "../review-state"
import { withRecordedLockedInvocation } from "./lane-lineage"
import { assertReviewRoutingTupleContract, createReviewWaveRoutingPlan } from "./routing-plan"
import { spawnLockedReviewWave } from "./spawn-locked-review-wave"

afterEach(() => {
  ;(connectedProvidersCache.readConnectedProvidersCache as { mockRestore?: () => void }).mockRestore?.()
})

describe("review-routing", () => {
  test("pinned Argus lane is deterministic by profile policy tuple", () => {
    //#given
    spyOn(connectedProvidersCache, "readConnectedProvidersCache").mockReturnValue(null)

    //#when
    const testPlan = createReviewWaveRoutingPlan("test", 1)
    const productionPlan = createReviewWaveRoutingPlan("production", 1)

    //#then
    expect(testPlan.lanes).toHaveLength(2)
    expect(testPlan.lanes[0].lane).toBe("argus-claude")
    expect(testPlan.lanes[0].model_tuple).toEqual({
      agent: "argus",
      provider: "anthropic",
      model: "claude-opus-4-6",
      variant: "max",
      thinking: { type: "enabled", budgetTokens: 32000 },
    })
    expect(testPlan.lanes[1].lane).toBe("argus-gpt")
    expect(testPlan.lanes[1].model_tuple).toEqual({
      agent: "argus",
      provider: "openai",
      model: "gpt-5.4",
      variant: "high",
      reasoningEffort: "high",
    })

    expect(productionPlan.lanes[0].model_tuple.variant).toBe("max")
    expect(productionPlan.merge.model_tuple.agent).toBe("themis")
    expect(productionPlan.tie_break.model_tuple.agent).toBe("oracle")
  })

  test("fail closed wrong-model rejection on cross-wire tuple mismatch", () => {
    //#when
    const call = () => assertReviewRoutingTupleContract({
      laneTuples: [{ agent: "oracle", provider: "openai", model: "gpt-5.4", variant: "xhigh", reasoningEffort: "xhigh" }],
      mergeTuple: {
        agent: "themis",
        provider: "anthropic",
        model: "claude-opus-4-6",
        variant: "max",
      },
      tieBreakTuple: {
        agent: "oracle",
        provider: "openai",
        model: "gpt-5.4",
        variant: "xhigh",
      },
    })

    //#then
    expect(call).toThrow("fail-closed")
  })

  test("call_omo_agent surface is rejected for Argus lane spawning", async () => {
    //#given
    const manager = {
      launch: async () => ({ id: "bg_x" }),
    }

    //#when
    const call = spawnLockedReviewWave({
      manager: manager as never,
      profile: "test",
      wave: 1,
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      lanePrompts: {
        "argus-claude": "review lane argus-claude",
        "argus-gpt": "review lane argus-gpt",
      },
      surface: "call_omo_agent",
    })

    //#then
    await expect(call).rejects.toThrow("forbids call_omo_agent")
  })

  test("lane lineage persists by wave without cross-wave session reuse", async () => {
    //#given
    spyOn(connectedProvidersCache, "readConnectedProvidersCache").mockReturnValue(null)

    //#given
    const launched: Array<{ agent: string; model?: { providerID: string; modelID: string; variant?: string } }> = []
    const manager = {
      launch: async (input: { agent: string; model?: { providerID: string; modelID: string; variant?: string } }) => {
        launched.push(input)
        return {
          id: `bg_${launched.length}`,
          sessionID: `ses_lane_${launched.length}`,
        }
      },
    }

    const initial = createInitialReviewState({
      review_run_id: "run-9",
      review_scope_key: "scope-9",
      suppression_scope_key: "suppression-9",
      now: "2026-04-01T10:00:00.000Z",
    })

    //#when
    const wave1 = await spawnLockedReviewWave({
      manager: manager as never,
      profile: "test",
      wave: 1,
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      lanePrompts: {
        "argus-claude": "wave 1 argus-claude",
        "argus-gpt": "wave 1 argus-gpt",
      },
      now: "2026-04-01T10:00:01.000Z",
    })
    const wave2 = await spawnLockedReviewWave({
      manager: manager as never,
      profile: "test",
      wave: 2,
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      lanePrompts: {
        "argus-claude": "wave 2 argus-claude",
        "argus-gpt": "wave 2 argus-gpt",
      },
      now: "2026-04-01T10:00:02.000Z",
    })

    const withWave1 = wave1.reduce((state, record) => withRecordedLockedInvocation(state, record), initial)
    const withWave2 = wave2.reduce((state, record) => withRecordedLockedInvocation(state, record), withWave1)

    //#then
    expect(launched).toHaveLength(4)
    expect(launched[0]).toMatchObject({
      agent: "argus",
      model: { providerID: "anthropic", modelID: "claude-opus-4-6", variant: "max" },
    })
    expect(launched[1]).toMatchObject({
      agent: "argus",
      model: { providerID: "openai", modelID: "gpt-5.4", variant: "high" },
    })
    expect(withWave2.lane_lineage_by_wave["1"]).toHaveLength(2)
    expect(withWave2.lane_lineage_by_wave["2"]).toHaveLength(2)
    expect(withWave2.lane_lineage_by_wave["1"]?.[0]?.session_id).toBe("ses_lane_1")
    expect(withWave2.lane_lineage_by_wave["1"]?.[1]?.session_id).toBe("ses_lane_2")
    expect(withWave2.lane_lineage_by_wave["2"]?.[0]?.session_id).toBe("ses_lane_3")
    expect(withWave2.lane_lineage_by_wave["2"]?.[1]?.session_id).toBe("ses_lane_4")
    expect(withWave2.locked_role_invocations.filter(record => record.role === "merge")).toHaveLength(2)
    expect(withWave2.locked_role_invocations.filter(record => record.role === "tie-break")).toHaveLength(2)
  })

  test("routing plan produces correct number of lanes per profile", () => {
    //#when
    const testPlan = createReviewWaveRoutingPlan("test", 1)
    const productionPlan = createReviewWaveRoutingPlan("production", 1)

    //#then
    expect(testPlan.lanes).toHaveLength(2)
    expect(productionPlan.lanes).toHaveLength(2)
  })

  test("lane names are unique within a wave", () => {
    //#when
    const plan = createReviewWaveRoutingPlan("test", 1)

    //#then
    const laneNames = plan.lanes.map(l => l.lane)
    const uniqueNames = new Set(laneNames)
    expect(uniqueNames.size).toBe(laneNames.length)
  })

  test("prefers amazon-bedrock claude and openai gpt for review routing when both are connected", () => {
    //#given
    spyOn(connectedProvidersCache, "readConnectedProvidersCache").mockReturnValue(["amazon-bedrock", "openai", "github-copilot"])

    //#when
    const plan = createReviewWaveRoutingPlan("test", 1)

    //#then
    expect(plan.lanes).toHaveLength(2)
    expect(plan.lanes[0]?.model_tuple).toEqual({
      agent: "argus",
      provider: "amazon-bedrock",
      model: "anthropic.claude-opus-4-6-v1",
      variant: "max",
      thinking: { type: "enabled", budgetTokens: 32000 },
    })
    expect(plan.lanes[1]?.model_tuple).toEqual({
      agent: "argus",
      provider: "openai",
      model: "gpt-5.4",
      variant: "high",
      reasoningEffort: "high",
    })
    expect(plan.merge.model_tuple.provider).toBe("amazon-bedrock")
    expect(plan.tie_break.model_tuple.provider).toBe("openai")
  })

  test("prefers openai over github-copilot when no claude provider is connected", () => {
    //#given
    spyOn(connectedProvidersCache, "readConnectedProvidersCache").mockReturnValue(["openai", "github-copilot"])

    //#when
    const plan = createReviewWaveRoutingPlan("test", 1)

    //#then
    expect(plan.lanes).toHaveLength(1)
    expect(plan.lanes[0]?.lane).toBe("argus-gpt")
    expect(plan.lanes[0]?.model_tuple.provider).toBe("openai")
    expect(plan.merge.model_tuple.provider).toBe("openai")
    expect(plan.tie_break.model_tuple.provider).toBe("openai")
  })
})
