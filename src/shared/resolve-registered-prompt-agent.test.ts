import { describe, expect, test } from "bun:test"
import { resolveRegisteredPromptAgent } from "./resolve-registered-prompt-agent"

describe("resolveRegisteredPromptAgent", () => {
  test("returns live registered display name when host registry matches by config key", async () => {
    const result = await resolveRegisteredPromptAgent({
      client: {
        app: {
          agents: async () => ({
            data: [{ name: "Atlas (Plan Executor)" }],
          }),
        },
      },
      agentName: "atlas",
    })

    expect(result).toBe("Atlas (Plan Executor)")
  })

  test("returns undefined when host registry is available but target agent is not registered yet", async () => {
    const result = await resolveRegisteredPromptAgent({
      client: {
        app: {
          agents: async () => ({
            data: [{ name: "Sisyphus (Ultraworker)" }],
          }),
        },
      },
      agentName: "atlas",
    })

    expect(result).toBeUndefined()
  })

  test("returns undefined when host registry is ambiguous for the same config key", async () => {
    const result = await resolveRegisteredPromptAgent({
      client: {
        app: {
          agents: async () => ({
            data: [{ name: "Atlas (Plan Executor)" }, { name: "atlas" }],
          }),
        },
      },
      agentName: "atlas",
    })

    expect(result).toBeUndefined()
  })

  test("falls back to normalized name when host agent api is unavailable", async () => {
    const result = await resolveRegisteredPromptAgent({
      client: {},
      agentName: "themis",
    })

    expect(result).toBe("Themis (Reviewer)")
  })
})
