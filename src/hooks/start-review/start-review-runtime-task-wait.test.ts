import { describe, expect, test } from "bun:test"
import { waitForRuntimeTaskTerminal } from "./start-review-runtime-task-wait"

describe("start-review runtime task wait", () => {
  test("throws on timeout when task never reaches terminal status", async () => {
    await expect(
      waitForRuntimeTaskTerminal(
        {
          getTask: () => ({ status: "running" } as never),
        } as never,
        "bg-never-terminal",
        { timeout_ms: 5, poll_interval_ms: 1 },
      ),
    ).rejects.toThrow("Timed out waiting for runtime task completion after 5ms")
  })

  test("uses longer runtime default timeout when none is provided", async () => {
    const originalDateNow = Date.now
    let now = 0
    Date.now = () => now

    try {
      const waitPromise = waitForRuntimeTaskTerminal(
        {
          getTask: () => ({ status: "running" } as never),
        } as never,
        "bg-default-timeout",
        { poll_interval_ms: 1 },
      )

      now = 599_999
      await Promise.resolve()

      now = 600_001
      await expect(waitPromise).rejects.toThrow("Timed out waiting for runtime task completion after 600000ms")
    } finally {
      Date.now = originalDateNow
    }
  })
})
