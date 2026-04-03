import { afterEach, describe, expect, test } from "bun:test"

import { getFallbackModelsForSession } from "./fallback-models"
import {
  _resetLockedReviewRuntimeSessionRegistryForTesting,
  registerLockedReviewRuntimeSession,
} from "../../shared/locked-review-session-registry"
import { SessionCategoryRegistry } from "../../shared/session-category-registry"

describe("runtime-fallback fallback-models", () => {
  afterEach(() => {
    SessionCategoryRegistry.clear()
    _resetLockedReviewRuntimeSessionRegistryForTesting()
  })

  test("uses category fallback_models when session category is registered", () => {
    //#given
    const sessionID = "ses_runtime_fallback_category"
    SessionCategoryRegistry.register(sessionID, "quick")
    const pluginConfig = {
      categories: {
        quick: {
          fallback_models: ["openai/gpt-5.2", "anthropic/claude-opus-4-6"],
        },
      },
    } as any

    //#when
    const result = getFallbackModelsForSession(sessionID, undefined, pluginConfig)

    //#then
    expect(result).toEqual(["openai/gpt-5.2", "anthropic/claude-opus-4-6"])
  })

  test("uses agent-specific fallback_models when agent is resolved", () => {
    //#given
    const pluginConfig = {
      agents: {
        oracle: {
          fallback_models: ["openai/gpt-5.2", "anthropic/claude-opus-4-6"],
        },
      },
    } as any

    //#when
    const result = getFallbackModelsForSession("ses_runtime_fallback_agent", "oracle", pluginConfig)

    //#then
    expect(result).toEqual(["openai/gpt-5.2", "anthropic/claude-opus-4-6"])
  })

  test("does not fall back to another agent chain when agent cannot be resolved", () => {
    //#given
    const pluginConfig = {
      agents: {
        sisyphus: {
          fallback_models: ["quotio/gpt-5.2", "quotio/glm-5", "quotio/kimi-k2.5"],
        },
        oracle: {
          fallback_models: ["openai/gpt-5.2", "anthropic/claude-opus-4-6"],
        },
      },
    } as any

    //#when
    const result = getFallbackModelsForSession("ses_runtime_fallback_unknown", undefined, pluginConfig)

    //#then
    expect(result).toEqual([])
  })

  test("bypasses runtime fallback models for locked review-role sessions", () => {
    //#given
    const pluginConfig = {
      agents: {
        argus: {
          fallback_models: ["openai/gpt-5.4", "anthropic/claude-opus-4-6"],
        },
      },
    } as any

    //#when
    const result = getFallbackModelsForSession(
      "ses_themis-review-role:test:argus-lane",
      "argus",
      pluginConfig,
    )

    //#then
    expect(result).toEqual([])
  })

  test("bypasses runtime fallback models for registered opaque locked review sessions", () => {
    const pluginConfig = {
      agents: {
        argus: {
          fallback_models: ["openai/gpt-5.4", "anthropic/claude-opus-4-6"],
        },
      },
    } as any

    registerLockedReviewRuntimeSession("ses_runtime_lane_1", {
      profile: "test",
      role: "argus-lane",
      wave: 1,
      lane: "argus",
    })

    const result = getFallbackModelsForSession("ses_runtime_lane_1", "argus", pluginConfig)

    expect(result).toEqual([])
  })
})
