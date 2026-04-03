/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import {
  THEMIS_SYSTEM_PROMPT,
  createThemisAgent,
  getThemisPrompt,
  getThemisPromptSource,
  themisPromptMetadata,
} from "./themis"

describe("Themis coordinator prompt routing", () => {
  test("routes gpt models to gpt coordinator overlay", () => {
    // given
    const model = "openai/gpt-5.4"

    // when
    const source = getThemisPromptSource(model)
    const prompt = getThemisPrompt(model)

    // then
    expect(source).toBe("gpt")
    expect(prompt).toContain("top-level completed-work review coordinator")
    expect(prompt).toContain("pending question state")
    expect(prompt).toContain("response_shape")
  })

  test("uses default coordinator prompt for non-gpt models", () => {
    // given
    const model = "anthropic/claude-opus-4-6"

    // when
    const source = getThemisPromptSource(model)
    const prompt = getThemisPrompt(model)

    // then
    expect(source).toBe("default")
    expect(prompt).toContain("native top-level review coordinator")
    expect(prompt).toContain("question_gating_reuse")
  })
})

describe("Themis coordinator contract guidance", () => {
  test("default prompt announces profile, lifecycle phases, and review-state alignment", () => {
    // given
    const prompt = THEMIS_SYSTEM_PROMPT
    const promptLower = prompt.toLowerCase()

    // when
    // then
    expect(prompt).toContain("test or production")
    expect(prompt).toContain("pass_boundary")
    expect(prompt).toContain("merge_pending")
    expect(prompt).toContain("tie_break_pending")
    expect(prompt).toContain("completed")
    expect(promptLower).toContain("review-state")
  })

  test("default prompt keeps pending question reuse and coordinator handoff guidance", () => {
    // given
    const prompt = THEMIS_SYSTEM_PROMPT.toLowerCase()

    // when
    // then
    expect(prompt).toContain("pending-question reuse")
    expect(prompt).toContain("do not issue a second question")
    expect(prompt).toContain("handoff")
    expect(prompt).toContain("canonical remediation-plan")
    expect(prompt).toContain("review-target-resolution")
  })
})

describe("createThemisAgent coordinator identity", () => {
  test("preserves themis metadata for top-level coordinator routing", () => {
    // then
    expect(themisPromptMetadata.promptAlias).toBe("Themis")
    expect(themisPromptMetadata.category).toBe("specialist")
    expect(themisPromptMetadata.cost).toBe("EXPENSIVE")
    expect(themisPromptMetadata.triggers[0]?.domain).toContain("Top-level")
  })

  test("creates coordinator with mode all, profile-capable prompt, and canonical color", () => {
    // when
    const config = createThemisAgent("anthropic/claude-opus-4-6")

    // then
    expect(config.mode).toBe("all")
    expect(createThemisAgent.mode).toBe("all")
    expect(config.description).toContain("Themis")
    expect(config.description).toContain("review coordinator")
    expect(config.color).toBe("#4C1D95")
    expect(config.prompt).toContain("Profile announcement")
    expect(config.thinking).toEqual({ type: "enabled", budgetTokens: 32000 })
  })

  test("explicitly allows orchestration and question tools", () => {
    // when
    const config = createThemisAgent("anthropic/claude-opus-4-6")
    const permission = (config.permission ?? {}) as Record<string, string>

    // then
    expect(permission["task"]).toBe("allow")
    expect(permission["call_omo_agent"]).toBe("allow")
    expect(permission["question"]).toBe("allow")
  })

  test("gpt coordinator config uses gpt overlay", () => {
    // when
    const config = createThemisAgent("openai/gpt-5.4")

    // then
    expect(config.reasoningEffort).toBe("medium")
    expect(config.textVerbosity).toBe("high")
    expect(config.prompt).toContain("response_shape")
    expect(config.prompt).toContain("pending_question_reuse")
    expect(config.thinking).toBeUndefined()
  })
})
