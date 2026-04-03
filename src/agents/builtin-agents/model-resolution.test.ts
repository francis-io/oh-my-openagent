import { describe, expect, test } from "bun:test"

import { applyModelResolution } from "./model-resolution"

describe("model-resolution", () => {
  test("fails closed when locked required model is unavailable", () => {
    //#given
    const availableModels = new Set<string>(["openai/gpt-5.3-codex"])

    //#when
    const result = applyModelResolution({
      lockedRequiredModel: {
        providerID: "openai",
        modelID: "gpt-5.4",
        variant: "xhigh",
      },
      availableModels,
      systemDefaultModel: "anthropic/claude-sonnet-4-6",
      requirement: {
        fallbackChain: [
          { providers: ["anthropic"], model: "claude-opus-4-6", variant: "max" },
        ],
      },
    })

    //#then
    expect(result).toBeUndefined()
  })

  test("returns locked required model when exact provider/model is available", () => {
    //#given
    const availableModels = new Set<string>(["openai/gpt-5.4"])

    //#when
    const result = applyModelResolution({
      lockedRequiredModel: {
        providerID: "openai",
        modelID: "gpt-5.4",
        variant: "xhigh",
      },
      availableModels,
      systemDefaultModel: "anthropic/claude-sonnet-4-6",
    })

    //#then
    expect(result).toEqual({
      model: "openai/gpt-5.4",
      provenance: "provider-fallback",
      variant: "xhigh",
    })
  })
})
