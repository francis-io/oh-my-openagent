import { describe, expect, test } from "bun:test"
import { injectTopLevelPrompt } from "./top-level-prompt-injector"

describe("injectTopLevelPrompt", () => {
  test("calls promptAsync with correct this binding", async () => {
    const calls: unknown[] = []
    const sessionApi = {
      _client: { ready: true },
      promptAsync(this: { _client?: unknown }, args: unknown) {
        if (!this._client) {
          throw new Error("missing client binding")
        }
        calls.push(args)
        return Promise.resolve({ data: {} })
      },
    }

    const result = await injectTopLevelPrompt({
      ctx: {
        directory: "/workspace",
        client: {
          session: sessionApi,
          app: {
            agents: async () => ({ data: [{ name: "Themis (Reviewer)" }] }),
          },
        },
      } as never,
      sessionID: "ses-binding-test",
      agentName: "Themis (Reviewer)",
      prompt: "hello world",
    })

    expect(result).toEqual({ status: "injected", promptAgent: "Themis (Reviewer)" })
    expect(calls).toHaveLength(1)
  })
})
