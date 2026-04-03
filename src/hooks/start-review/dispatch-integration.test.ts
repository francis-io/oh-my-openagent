/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { createCommandExecuteBeforeHandler } from "../../plugin/command-execute-before"
import { createChatMessageHandler } from "../../plugin/chat-message"

describe("start-review dispatch integration", () => {
  test("command.execute.before dispatches dedicated start-review hook only for start-review command", async () => {
    let calls = 0
    const handler = createCommandExecuteBeforeHandler({
      hooks: {
        autoSlashCommand: null,
        startReview: {
          "command.execute.before": async () => {
            calls += 1
          },
        },
      } as never,
    })

    await handler(
      { command: "start-review", sessionID: "ses-1", arguments: "" },
      { parts: [{ type: "text", text: "x" }] },
    )
    await handler(
      { command: "start-work", sessionID: "ses-1", arguments: "" },
      { parts: [{ type: "text", text: "x" }] },
    )

    expect(calls).toBe(1)
  })

  test("chat.message surface can dispatch dedicated start-review hook", async () => {
    let called = false
    const handler = createChatMessageHandler({
      ctx: { client: { tui: { showToast: async () => {} } } } as never,
      pluginConfig: {} as never,
      firstMessageVariantGate: {
        shouldOverride: () => false,
        markApplied: () => {},
      },
      hooks: {
        modelFallback: null,
        stopContinuationGuard: null,
        backgroundNotificationHook: null,
        runtimeFallback: null,
        keywordDetector: null,
        thinkMode: null,
        claudeCodeHooks: null,
        autoSlashCommand: null,
        noSisyphusGpt: null,
        noHephaestusNonGpt: null,
        startWork: null,
        startReview: {
          "chat.message": async () => {
            called = true
          },
        },
      } as never,
    })

    await handler(
      { sessionID: "ses-review", agent: "themis" },
      {
        message: {},
        parts: [{ type: "text", text: "You are bootstrapping a Themis-led review session.\n<session-context>" }],
      },
    )

    expect(called).toBe(true)
  })
})
