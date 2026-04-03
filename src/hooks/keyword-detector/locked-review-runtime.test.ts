import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createKeywordDetectorHook } from "./hook"
import { _resetForTesting, setMainSession } from "../../features/claude-code-session-state"
import { _resetLockedReviewRuntimeSessionRegistryForTesting, registerLockedReviewRuntimeSession } from "../../shared/locked-review-session-registry"

function createMockPluginInput() {
  return {
    client: {
      tui: {
        showToast: async () => ({}),
      },
    },
  } as never
}

describe("keyword-detector locked review runtime", () => {
  beforeEach(() => {
    _resetForTesting()
    _resetLockedReviewRuntimeSessionRegistryForTesting()
    setMainSession("ses-main")
  })

  afterEach(() => {
    _resetForTesting()
    _resetLockedReviewRuntimeSessionRegistryForTesting()
  })

  test("skips keyword injection for registered locked review runtime session", async () => {
    const hook = createKeywordDetectorHook(createMockPluginInput())
    registerLockedReviewRuntimeSession("ses-review-1", { profile: "test", role: "merge", wave: 1 })
    const output = {
      message: {} as Record<string, unknown>,
      parts: [{ type: "text", text: "ultrawork analyze this" }],
    }

    await hook["chat.message"]({ sessionID: "ses-review-1", agent: "themis" }, output)

    expect(output.parts[0]?.text).toBe("ultrawork analyze this")
  })

  test("keeps main-session themis behavior intact", async () => {
    const hook = createKeywordDetectorHook(createMockPluginInput())
    const output = {
      message: {} as Record<string, unknown>,
      parts: [{ type: "text", text: "ultrawork implement this" }],
    }

    await hook["chat.message"]({ sessionID: "ses-main", agent: "themis" }, output)

    expect(output.parts[0]?.text).toContain("YOU MUST LEVERAGE ALL AVAILABLE AGENTS")
  })

  test("skips keyword injection for locked review runtime prompt before registry state exists", async () => {
    const hook = createKeywordDetectorHook(createMockPluginInput())
    const output = {
      message: {} as Record<string, unknown>,
      parts: [{ type: "text", text: "Themis runtime merge lane\nreview_run_id=run-1\nultrawork analyze this" }],
    }

    await hook["chat.message"]({ sessionID: "ses-opaque-merge", agent: "themis" }, output)

    expect(output.parts[0]?.text).toBe("Themis runtime merge lane\nreview_run_id=run-1\nultrawork analyze this")
  })

  test("does not suppress non-review oracle subagent sessions", async () => {
    const hook = createKeywordDetectorHook(createMockPluginInput())
    const output = {
      message: {} as Record<string, unknown>,
      parts: [{ type: "text", text: "ultrawork investigate this" }],
    }

    await hook["chat.message"]({ sessionID: "ses-sub-oracle", agent: "oracle" }, output)

    expect(output.parts[0]?.text).toContain("YOU MUST LEVERAGE ALL AVAILABLE AGENTS")
  })
})
