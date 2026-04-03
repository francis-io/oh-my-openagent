import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import * as shared from "../shared"
import { createBuiltinAgents } from "./builtin-agents"

describe("createBuiltinAgents Themis and Argus registration", () => {
  let fetchAvailableModelsSpy: ReturnType<typeof spyOn>
  let readConnectedProvidersCacheSpy: ReturnType<typeof spyOn>
  let readProviderModelsCacheSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    fetchAvailableModelsSpy = spyOn(shared, "fetchAvailableModels").mockResolvedValue(
      new Set<string>([
        "anthropic/claude-opus-4-6",
        "openai/gpt-5.4",
      ]),
    )
    readConnectedProvidersCacheSpy = spyOn(shared, "readConnectedProvidersCache").mockReturnValue(null)
    readProviderModelsCacheSpy = spyOn(shared, "readProviderModelsCache").mockReturnValue(null)
  })

  afterEach(() => {
    fetchAvailableModelsSpy.mockRestore()
    readConnectedProvidersCacheSpy.mockRestore()
    readProviderModelsCacheSpy.mockRestore()
  })

  test("registers Themis as mode all and Argus as mode subagent", async () => {
    // given
    const disabledAgents: string[] = []

    // when
    const result = await createBuiltinAgents(disabledAgents, {}, "/tmp/project", "openai/gpt-5.4")

    // then
    expect(result.themis).toBeDefined()
    expect(result.argus).toBeDefined()
    expect(result.themis?.mode).toBe("all")
    expect(result.argus?.mode).toBe("subagent")
  })

  test("keeps deterministic ordering for reviewer and top-level registration", async () => {
    // when
    const result = await createBuiltinAgents([], {}, "/tmp/project", "openai/gpt-5.4")
    const keys = Object.keys(result)

    // then
    expect(keys.indexOf("argus")).toBeGreaterThan(keys.indexOf("momus"))
    expect(keys.indexOf("themis")).toBeGreaterThan(keys.indexOf("argus"))
    expect(keys.indexOf("atlas")).toBeGreaterThan(keys.indexOf("themis"))
  })
})
