import { describe, expect, test } from "bun:test"
import {
  ARGUS_SYSTEM_PROMPT,
  argusPromptMetadata,
  createArgusAgent,
  getArgusPrompt,
  getArgusPromptSource,
} from "./argus"

describe("Argus reviewer prompt routing", () => {
  test("routes GPT models to gpt overlay", () => {
    // given
    const model = "openai/gpt-5.4"

    // when
    const source = getArgusPromptSource(model)
    const prompt = getArgusPrompt(model)

    // then
    expect(source).toBe("gpt")
    expect(prompt).toContain("No orchestration. No delegation. No recursion.")
  })

  test("routes Gemini models to gemini overlay", () => {
    // given
    const model = "google/gemini-3.1-pro"

    // when
    const source = getArgusPromptSource(model)
    const prompt = getArgusPrompt(model)

    // then
    expect(source).toBe("gemini")
    expect(prompt).toContain("Never orchestrate, never spawn subagents, never recurse.")
  })

  test("uses default overlay for non-GPT/Gemini models", () => {
    // given
    const model = "anthropic/claude-opus-4-6"

    // when
    const source = getArgusPromptSource(model)
    const prompt = getArgusPrompt(model)

    // then
    expect(source).toBe("default")
    expect(prompt).toContain("You are a leaf reviewer")
  })
})

describe("Argus reviewer constraints and output schema", () => {
  test("default system prompt includes locked finding schema", () => {
    // given
    const prompt = ARGUS_SYSTEM_PROMPT

    // when
    // then
    expect(prompt).toContain("correctness | requirement-mismatch | best-practice | simplify-remove")
    expect(prompt).toContain("blocking | major | minor | nit")
    expect(prompt).toContain("low | medium | high")
    expect(prompt).toContain("fingerprint")
    expect(prompt).toContain("suppression_identity")
  })

  test("default system prompt forbids orchestration and user questioning", () => {
    // given
    const prompt = ARGUS_SYSTEM_PROMPT.toLowerCase()

    // when
    // then
    expect(prompt).toContain("not an orchestrator")
    expect(prompt).toContain("must not spawn subagents")
    expect(prompt).toContain("must not ask the user questions")
    expect(prompt).toContain("must not request recursive review rounds")
  })
})

describe("createArgusAgent reviewer identity", () => {
  test("preserves reviewer metadata contract", () => {
    // then
    expect(argusPromptMetadata.promptAlias).toBe("Argus")
    expect(argusPromptMetadata.category).toBe("specialist")
    expect(argusPromptMetadata.cost).toBe("EXPENSIVE")
  })

  test("returns subagent with reviewer identity fields", () => {
    // when
    const config = createArgusAgent("anthropic/claude-opus-4-6")

    // then
    expect(config.mode).toBe("subagent")
    expect(createArgusAgent.mode).toBe("subagent")
    expect(config.description).toContain("Argus")
    expect(config.color).toBe("#1E40AF")
    expect(config.thinking).toEqual({ type: "enabled", budgetTokens: 32000 })
  })

  test("gpt model uses gpt reviewer overlay", () => {
    // when
    const config = createArgusAgent("openai/gpt-5.4")

    // then
    expect(config.reasoningEffort).toBe("medium")
    expect(config.textVerbosity).toBe("high")
    expect(config.prompt).toContain("No orchestration. No delegation. No recursion.")
    expect(config.thinking).toBeUndefined()
  })
})
