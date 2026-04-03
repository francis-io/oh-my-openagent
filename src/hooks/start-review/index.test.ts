/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { createStartReviewHook } from "./index"
import type { BackgroundTask } from "../../features/background-agent/types"
import { START_REVIEW_TEMPLATE } from "../../features/builtin-commands/templates/start-review"
import {
  _resetForTesting,
  getSessionAgent,
  registerAgentName,
} from "../../features/claude-code-session-state"

describe("start-review hook", () => {
  let testDir = ""

  function createStartReviewPrompt(userRequest: string): string {
    return `<command-instruction>
You are bootstrapping a Themis-led review session.
</command-instruction>

<session-context>
Session ID: $SESSION_ID
Timestamp: $TIMESTAMP
</session-context>

<user-request>
${userRequest}
</user-request>`
  }

  function createMockPluginInput(
    userMessages: Array<{ role: "user" | "assistant"; text: string }> = [],
    options?: {
      promptAsync?: (args: unknown) => Promise<unknown>
      prompt?: (args: unknown) => Promise<unknown>
      appAgents?: Array<{ name: string }>
      sessionMessagesResponse?: Array<Record<string, unknown>>
    },
  ) {
    return {
      directory: testDir,
      client: {
        ...(options?.appAgents
          ? {
              app: {
                agents: async () => ({ data: options.appAgents }),
              },
            }
          : {}),
        session: {
          messages: async () => ({
            data: options?.sessionMessagesResponse
              ?? userMessages.map((message, index) => ({
                info: { role: message.role, id: `msg_${index}` },
                parts: [{ type: "text", text: message.text }],
              })),
          }),
          promptAsync: options?.promptAsync,
          prompt: options?.prompt,
        },
      },
    } as unknown as Parameters<typeof createStartReviewHook>[0]
  }

  function createMockBackgroundManager() {
    const tasks = new Map<string, BackgroundTask>()
    let counter = 0

    return {
      launch: async (input: {
        description: string
        prompt: string
        agent: string
        parentSessionID: string
        parentMessageID: string
      }) => {
        counter += 1
        const isGptLane = input.description.includes("argus")
        const isLane = input.description.startsWith("argus")
        const isMerge = input.description.startsWith("themis merge")
        const isTieBreak = input.description.startsWith("oracle tie-break")
        const task: BackgroundTask = {
          id: `bg_${counter}`,
          sessionID: `ses_lane_${counter}`,
          parentSessionID: input.parentSessionID,
          parentMessageID: input.parentMessageID,
          description: input.description,
          prompt: input.prompt,
          agent: input.agent,
          status: "completed",
          result: isLane
            ? JSON.stringify({
                findings: [
                  {
                    category: "correctness",
                    severity: "major",
                    confidence: "high",
                    title: "major-finding",
                    summary: isGptLane ? "runtime-path finding" : "runtime-path finding",
                    evidence: [{ path: "src/index.ts", start_line: 1, end_line: 2 }],
                    remediation: { intent: "fix-runtime-path" },
                  },
                ],
              })
            : isMerge
              ? JSON.stringify({ status: "ok", findings_considered: 2, notes: "validated" })
              : isTieBreak
                ? JSON.stringify({ resolutions: [] })
                : JSON.stringify({ status: "ok" }),
        }
        tasks.set(task.id, task)
        return task
      },
      getTask: (id: string) => tasks.get(id),
    }
  }

  async function waitFor(condition: () => boolean, timeoutMs = 500): Promise<void> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (condition()) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error("Timed out waiting for condition")
  }

  beforeEach(() => {
    _resetForTesting()
    registerAgentName("themis")
    testDir = join(tmpdir(), `start-review-test-${randomUUID()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    _resetForTesting()
    rmSync(testDir, { recursive: true, force: true })
  })

  test("ignores non start-review content", async () => {
    const hook = createStartReviewHook(createMockPluginInput())
    const output = { parts: [{ type: "text", text: "hello" }] }

    await hook["chat.message"]?.({ sessionID: "ses-1" }, output)

    expect(output.parts[0].text).toBe("hello")
  })

  test("hands off start-review session to Themis", async () => {
    const hook = createStartReviewHook(createMockPluginInput(), {
      backgroundManager: createMockBackgroundManager(),
    })
    const output = {
      message: {} as Record<string, unknown>,
      parts: [{ type: "text", text: createStartReviewPrompt("review full repository") }],
    }

    await hook["chat.message"]?.({ sessionID: "ses-review" }, output)

    expect(getSessionAgent("ses-review")).toBe("themis")
    expect(output.message.agent).toBe("Themis (Reviewer)")
    expect(output.parts[0].text).toContain("Review Bootstrap")
    expect(output.parts[0].text).toContain("Runtime Review Bootstrap")
  })

  test("direct raw /start-review chat message is handled without slash-template injection", async () => {
    const hook = createStartReviewHook(createMockPluginInput(), {
      backgroundManager: createMockBackgroundManager(),
    })
    const output = {
      message: {} as Record<string, unknown>,
      parts: [{ type: "text", text: "/start-review review full repository" }],
    }

    await hook["chat.message"]?.({ sessionID: "ses-raw-chat", messageID: "msg-raw-chat" }, output)

    expect(getSessionAgent("ses-raw-chat")).toBe("themis")
    expect(output.message.agent).toBe("Themis (Reviewer)")
    expect(output.parts[0].text).toContain("The user invoked /start-review review full repository.")
    expect(output.parts[0].text).toContain("Runtime Review Bootstrap")
    expect(output.parts[0].text).toContain("launched asynchronously")
  })

  test("plain top-level Themis tab can bootstrap the same runtime without /start-review", async () => {
    const hook = createStartReviewHook(
      createMockPluginInput([{ role: "user", text: "review full repository for regressions" }]),
      {
        backgroundManager: createMockBackgroundManager(),
      }
    )
    const output = {
      message: {} as Record<string, unknown>,
      parts: [{ type: "text", text: "You are Themis, the native top-level review coordinator." }],
    }

    await hook["chat.message"]?.({ sessionID: "ses-themis-tab", agent: "themis" }, output)

    expect(getSessionAgent("ses-themis-tab")).toBe("themis")
    expect(output.message.agent).toBe("Themis (Reviewer)")
    expect(output.parts[0].text).toContain("Review Bootstrap")
    expect(output.parts[0].text).toContain("Runtime Review Bootstrap")
  })

  test("plain Themis tab asks for confirmation when latest user request is ambiguous", async () => {
    const hook = createStartReviewHook(createMockPluginInput([{ role: "user", text: "." }]))
    const output = {
      parts: [{ type: "text", text: "You are Themis, the native top-level review coordinator." }],
    }

    await hook["chat.message"]?.({ sessionID: "ses-themis-ambiguous", agent: "themis" }, output)

    const text = output.parts[0].text ?? ""
    expect(text).toContain("Review Mode Confirmation Required")
    expect(text).toContain("1. Review full repository")
    expect(text).toContain("2. Review completed plan")
  })

  test("dot input triggers question confirmation with repo-wide recommended first", async () => {
    const hook = createStartReviewHook(createMockPluginInput())
    const output = {
      parts: [{ type: "text", text: createStartReviewPrompt(".") }],
    }

    await hook["chat.message"]?.({ sessionID: "ses-dot" }, output)

    const text = output.parts[0].text ?? ""
    expect(text).toContain("Review Mode Confirmation Required")
    expect(text).toContain("call the existing `question` tool")
    const repoFirst = text.indexOf("1. Review full repository")
    const planSecond = text.indexOf("2. Review completed plan")
    expect(repoFirst).toBeGreaterThan(-1)
    expect(planSecond).toBeGreaterThan(repoFirst)
  })

  test("non-ambiguous repository input does not require question confirmation", async () => {
    const hook = createStartReviewHook(createMockPluginInput(), {
      backgroundManager: createMockBackgroundManager(),
    })
    const output = {
      parts: [{ type: "text", text: createStartReviewPrompt("review full repository for regressions") }],
    }

    await hook["chat.message"]?.({ sessionID: "ses-plan" }, output)

    const text = output.parts[0].text ?? ""
    expect(text).toContain("Review Bootstrap")
    expect(text).not.toContain("Review Mode Confirmation Required")
    expect(text).toContain("Runtime Review Bootstrap")
  })

  test("non-ambiguous start-review command materializes runtime review artifacts and orchestration state", async () => {
    const hook = createStartReviewHook(createMockPluginInput([], {
      promptAsync: async () => ({ data: {} }),
    }), {
      backgroundManager: createMockBackgroundManager(),
    })
    const output = {
      parts: [{ type: "text", text: createStartReviewPrompt("review full repository for regressions") }],
    }

    await hook["command.execute.before"]?.(
      { sessionID: "ses-live-runtime", command: "start-review", arguments: "review full repository for regressions" },
      output,
    )
    await hook.event?.({
      event: { type: "session.idle", properties: { sessionID: "ses-live-runtime" } },
    })

    const runtimeText = output.parts[0].text ?? ""
    const reviewRunId = runtimeText.match(/Review run id: `([^`]+)`/)?.[1]
    if (!reviewRunId) {
      throw new Error("Expected runtime bootstrap block to include review run id")
    }
    const reviewRoot = join(testDir, ".sisyphus", "reviews", reviewRunId)
    const targetPath = join(reviewRoot, "target.json")
    const statePath = join(reviewRoot, "state.json")
    const mergedPath = join(reviewRoot, "merged-findings.json")
    const conflictsPath = join(reviewRoot, "conflicts.json")
    const snapshotPath = join(reviewRoot, "remediation-plan.snapshot.md")
    const canonicalRefPath = join(reviewRoot, "canonical-remediation-path.txt")

    await waitFor(() => existsSync(targetPath) && existsSync(statePath) && existsSync(mergedPath) && existsSync(conflictsPath) && existsSync(snapshotPath) && existsSync(canonicalRefPath))

    const state = JSON.parse(readFileSync(statePath, "utf-8")) as {
      stop_reason?: string
      phase: string
      coordinator_session_id?: string
      review_scope_key: string
      suppression_scope_key: string
      ref_identity: { base_ref: string | null; head_ref: string | null }
      locked_role_invocations: Array<{ invocation_type: string }>
    }
    expect(state.stop_reason).toBe("dry-wave-complete")
    expect(state.phase).toBe("completed")
    expect(state.coordinator_session_id).toBe("ses-live-runtime")
    expect(state.locked_role_invocations.some((entry) => entry.invocation_type === "merge")).toBe(true)
    expect(state.locked_role_invocations.some((entry) => entry.invocation_type === "tie-break")).toBe(true)
    expect(state.locked_role_invocations.some((entry) => entry.invocation_type === "lane")).toBe(true)
    expect(state.review_scope_key.startsWith("review-scope-")).toBe(true)
    expect(state.suppression_scope_key.startsWith("suppression-scope-")).toBe(true)

    const target = JSON.parse(readFileSync(targetPath, "utf-8")) as {
      review_scope_key: string
      suppression_scope_key: string
      ref_identity: { base_ref: string | null; head_ref: string | null }
    }
    expect(target.review_scope_key).toBe(state.review_scope_key)
    expect(target.suppression_scope_key).toBe(state.suppression_scope_key)
    expect(target.ref_identity).toEqual(state.ref_identity)

    const merged = JSON.parse(readFileSync(mergedPath, "utf-8")) as {
      tie_break_route: { model_tuple: { agent: string } }
    }
    expect(merged.tie_break_route.model_tuple.agent).toBe("oracle")
  })

  test("raw command.execute.before start-review runs without requiring injected slash template", async () => {
    const hook = createStartReviewHook(createMockPluginInput(), {
      backgroundManager: createMockBackgroundManager(),
    })
    const output = { parts: [] as Array<{ type: string; text?: string }> }

    await hook["command.execute.before"]?.(
      {
        sessionID: "ses-direct-command",
        command: "start-review",
        arguments: "review full repository for regressions",
        eventID: "evt-direct-command",
      },
      output,
    )

    expect(output.parts[0]?.text).toContain("The user invoked /start-review review full repository for regressions.")
    expect(output.parts[0]?.text).toContain("Runtime Review Bootstrap")
    expect(output.parts[0]?.text).toContain("launched asynchronously")
  })

  test("command.execute.before remains direct-start even when host prepopulates bootstrap template text", async () => {
    const promptAsyncCalls: unknown[] = []
    const hook = createStartReviewHook(
      createMockPluginInput([], {
        promptAsync: async (args) => {
          promptAsyncCalls.push(args)
          return { data: {} }
        },
      }),
      {
        backgroundManager: createMockBackgroundManager(),
      },
    )
    const output = {
      parts: [{
        type: "text",
        text: `<session-context>\nSession ID: $SESSION_ID\nTimestamp: $TIMESTAMP\n</session-context>\n\n${START_REVIEW_TEMPLATE}`,
      }],
    }

    await hook["command.execute.before"]?.(
      {
        sessionID: "ses-host-template-start-review",
        command: "start-review",
        arguments: "",
        eventID: "evt-host-template-start-review",
      },
      output,
    )

    expect(output.parts[0]?.text).toContain("Runtime Review Bootstrap")
    expect(output.parts[0]?.text).toContain("launched asynchronously")
    expect(output.parts[0]?.text).toContain("The user invoked /start-review.")

    await hook.event?.({
      event: { type: "session.idle", properties: { sessionID: "ses-host-template-start-review" } },
    })
    expect(promptAsyncCalls).toHaveLength(1)
  })

  test("direct command path injects visible start-review status on session idle", async () => {
    const promptAsyncCalls: unknown[] = []
    const hook = createStartReviewHook(
      createMockPluginInput([], {
        promptAsync: async (args) => {
          promptAsyncCalls.push(args)
          return { data: {} }
        },
      }),
      {
        backgroundManager: createMockBackgroundManager(),
      },
    )
    const output = { parts: [] as Array<{ type: string; text?: string }> }

    await hook["command.execute.before"]?.(
      {
        sessionID: "ses-visible-direct-command",
        command: "start-review",
        arguments: "review full repository for regressions",
        eventID: "evt-visible-direct-command",
      },
      output,
    )

    expect(promptAsyncCalls).toHaveLength(0)

    await hook.event?.({
      event: {
        type: "session.idle",
        properties: { sessionID: "ses-visible-direct-command" },
      },
    })

    expect(promptAsyncCalls).toHaveLength(1)
    const call = promptAsyncCalls[0] as {
      path: { id: string }
      body: { agent?: string; parts: Array<{ type: string; text?: string }> }
      query?: { directory: string }
    }
    expect(call.path.id).toBe("ses-visible-direct-command")
    expect(call.body.agent).toBe("Themis (Reviewer)")
    expect(call.query?.directory).toBe(testDir)
    expect(call.body.parts[0]?.text).toContain("Respond to the user with the following markdown block exactly")
    expect(call.body.parts[0]?.text).toContain("[START-REVIEW BOOTSTRAP]")
  })

  test("successful idle bootstrap is cleaned up and does not inject twice", async () => {
    const promptAsyncCalls: unknown[] = []
    const hook = createStartReviewHook(
      createMockPluginInput([], {
        promptAsync: async (args) => {
          promptAsyncCalls.push(args)
          return { data: {} }
        },
      }),
      {
        backgroundManager: createMockBackgroundManager(),
      },
    )

    await hook["command.execute.before"]?.(
      {
        sessionID: "ses-cleanup-after-success",
        command: "start-review",
        arguments: "review full repository",
        eventID: "evt-cleanup-after-success",
      },
      { parts: [] },
    )

    await hook.event?.({
      event: { type: "session.idle", properties: { sessionID: "ses-cleanup-after-success" } },
    })
    await hook.event?.({
      event: { type: "session.idle", properties: { sessionID: "ses-cleanup-after-success" } },
    })

    expect(promptAsyncCalls).toHaveLength(1)
  })

  test("direct start-review retries and then starts runtime in degraded mode when no prompt surface is available", async () => {
    const hook = createStartReviewHook(createMockPluginInput(), {
      backgroundManager: createMockBackgroundManager(),
    })
    const output = { parts: [] as Array<{ type: string; text?: string }> }

    await hook["command.execute.before"]?.(
      {
        sessionID: "ses-degraded-runtime",
        command: "start-review",
        arguments: "review full repository for regressions",
        eventID: "evt-degraded-runtime",
      },
      output,
    )

    for (let attempt = 0; attempt < 11; attempt++) {
      await hook.event?.({
        event: { type: "session.idle", properties: { sessionID: "ses-degraded-runtime" } },
      })
    }

    const reviewRunId = output.parts[0]?.text?.match(/Review run id: `([^`]+)`/)?.[1]
    if (!reviewRunId) {
      throw new Error("Expected direct command output to contain review run id")
    }

    const reviewRoot = join(testDir, ".sisyphus", "reviews", reviewRunId)
    await waitFor(() => existsSync(join(reviewRoot, "state.json")))

    const state = JSON.parse(readFileSync(join(reviewRoot, "state.json"), "utf-8")) as { coordinator_session_id?: string }
    expect(state.coordinator_session_id).toBe("ses-degraded-runtime")
  })

  test("abort-like session.error suppresses one idle injection and later message activity clears it", async () => {
    const promptAsyncCalls: unknown[] = []
    const hook = createStartReviewHook(
      createMockPluginInput([], {
        promptAsync: async (args) => {
          promptAsyncCalls.push(args)
          return { data: {} }
        },
      }),
      {
        backgroundManager: createMockBackgroundManager(),
      },
    )
    const output = { parts: [] as Array<{ type: string; text?: string }> }

    await hook["command.execute.before"]?.(
      {
        sessionID: "ses-abort-idle",
        command: "start-review",
        arguments: "review full repository",
        eventID: "evt-abort-idle",
      },
      output,
    )

    await hook.event?.({
      event: {
        type: "session.error",
        properties: { sessionID: "ses-abort-idle", error: { name: "AbortError" } },
      },
    })
    await hook.event?.({
      event: { type: "session.idle", properties: { sessionID: "ses-abort-idle" } },
    })
    expect(promptAsyncCalls).toHaveLength(0)

    await hook.event?.({
      event: {
        type: "message.updated",
        properties: { info: { sessionID: "ses-abort-idle", role: "user" } },
      },
    })
    await hook.event?.({
      event: { type: "session.idle", properties: { sessionID: "ses-abort-idle" } },
    })
    expect(promptAsyncCalls).toHaveLength(1)
  })

  test("session.compacted clears pending direct start-review state", async () => {
    const promptAsyncCalls: unknown[] = []
    const hook = createStartReviewHook(
      createMockPluginInput([], {
        promptAsync: async (args) => {
          promptAsyncCalls.push(args)
          return { data: {} }
        },
      }),
      {
        backgroundManager: createMockBackgroundManager(),
      },
    )
    const output = { parts: [] as Array<{ type: string; text?: string }> }

    await hook["command.execute.before"]?.(
      {
        sessionID: "ses-compacted-start-review",
        command: "start-review",
        arguments: "review full repository",
        eventID: "evt-compacted-start-review",
      },
      output,
    )

    await hook.event?.({
      event: { type: "session.compacted", properties: { sessionID: "ses-compacted-start-review" } },
    })
    await hook.event?.({
      event: { type: "session.idle", properties: { sessionID: "ses-compacted-start-review" } },
    })

    expect(promptAsyncCalls).toHaveLength(0)
  })

  test("session.deleted clears pending direct start-review state", async () => {
    const promptAsyncCalls: unknown[] = []
    const hook = createStartReviewHook(
      createMockPluginInput([], {
        promptAsync: async (args) => {
          promptAsyncCalls.push(args)
          return { data: {} }
        },
      }),
      {
        backgroundManager: createMockBackgroundManager(),
      },
    )

    await hook["command.execute.before"]?.(
      {
        sessionID: "ses-deleted-start-review",
        command: "start-review",
        arguments: "review full repository",
        eventID: "evt-deleted-start-review",
      },
      { parts: [] },
    )

    await hook.event?.({
      event: { type: "session.deleted", properties: { info: { id: "ses-deleted-start-review" } } },
    })
    await hook.event?.({
      event: { type: "session.idle", properties: { sessionID: "ses-deleted-start-review" } },
    })

    expect(promptAsyncCalls).toHaveLength(0)
  })

  test("transient prompt injection failure succeeds on later idle without wedging startup", async () => {
    const promptAsyncCalls: unknown[] = []
    let attempt = 0
    const hook = createStartReviewHook(
      createMockPluginInput([], {
        promptAsync: async (args) => {
          promptAsyncCalls.push(args)
          attempt += 1
          if (attempt === 1) {
            throw new Error("temporary prompt surface failure")
          }
          return { data: {} }
        },
      }),
      {
        backgroundManager: createMockBackgroundManager(),
      },
    )

    await hook["command.execute.before"]?.(
      {
        sessionID: "ses-transient-start-review",
        command: "start-review",
        arguments: "review full repository",
        eventID: "evt-transient-start-review",
      },
      { parts: [] },
    )

    await hook.event?.({
      event: { type: "session.idle", properties: { sessionID: "ses-transient-start-review" } },
    })
    expect(promptAsyncCalls).toHaveLength(1)

    await hook.event?.({
      event: { type: "session.idle", properties: { sessionID: "ses-transient-start-review" } },
    })
    expect(promptAsyncCalls).toHaveLength(2)
  })

  test("command surface is authoritative over raw chat fallback for the same session", async () => {
    const promptAsyncCalls: unknown[] = []
    const hook = createStartReviewHook(
      createMockPluginInput([], {
        promptAsync: async (args) => {
          promptAsyncCalls.push(args)
          return { data: {} }
        },
      }),
      {
        backgroundManager: createMockBackgroundManager(),
      },
    )

    await hook["chat.message"]?.(
      {
        sessionID: "ses-authority",
        messageID: "msg-chat-authority",
      },
      {
        parts: [{ type: "text", text: "/start-review review full repository" }],
      },
    )

    await hook["command.execute.before"]?.(
      {
        sessionID: "ses-authority",
        command: "start-review",
        arguments: "review completed plan .sisyphus/plans/alpha.md",
        eventID: "evt-authority",
      },
      { parts: [] },
    )

    await hook.event?.({
      event: { type: "session.idle", properties: { sessionID: "ses-authority" } },
    })

    const call = promptAsyncCalls[0] as {
      body: { parts: Array<{ text?: string }> }
    }
    expect(call.body.parts[0]?.text).toContain("Requested review: review completed plan .sisyphus/plans/alpha.md")
    expect(call.body.parts[0]?.text).not.toContain("Requested review: review full repository")
  })

  test("idle injection preserves recent model and inherited tools", async () => {
    const promptAsyncCalls: unknown[] = []
    const hook = createStartReviewHook(
      createMockPluginInput([], {
        promptAsync: async (args) => {
          promptAsyncCalls.push(args)
          return { data: {} }
        },
        sessionMessagesResponse: [
          {
            info: {
              role: "assistant",
              model: { providerID: "openai", modelID: "gpt-5.4" },
              tools: { read: true, question: false },
            },
            parts: [{ type: "text", text: "previous assistant output" }],
          },
        ],
      }),
      {
        backgroundManager: createMockBackgroundManager(),
      },
    )

    await hook["command.execute.before"]?.(
      {
        sessionID: "ses-context-inherit",
        command: "start-review",
        arguments: "review full repository",
        eventID: "evt-context-inherit",
      },
      { parts: [] },
    )

    await hook.event?.({
      event: { type: "session.idle", properties: { sessionID: "ses-context-inherit" } },
    })

    const call = promptAsyncCalls[0] as {
      body: { model?: { providerID: string; modelID: string }; tools?: Record<string, boolean> }
    }
    expect(call.body.model).toEqual({ providerID: "openai", modelID: "gpt-5.4" })
    expect(call.body.tools).toEqual({ read: true, question: false })
  })

  test("pending final conflict branch seeds visible text when output.parts starts empty", async () => {
    const reviewRoot = join(testDir, ".sisyphus", "reviews", "run-empty-pending")
    mkdirSync(reviewRoot, { recursive: true })
    writeFileSync(join(reviewRoot, "merged-findings.json"), JSON.stringify({ consensus_findings: [] }, null, 2), "utf-8")
    writeFileSync(join(reviewRoot, "state.json"), JSON.stringify({
      version: 1,
      profile: "test",
      review_run_id: "run-empty-pending",
      coordinator_session_id: "ses-empty-pending",
      review_scope_key: "scope-final",
      suppression_scope_key: "supp-final",
      ref_identity: { base_ref: null, head_ref: null },
      phase: "tie_break_pending",
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:00:01.000Z",
      wave_counters: { completed_waves: 1, dry_waves: 1 },
      stop_reason: "dry-wave-complete",
      stop_wave: 1,
      pending_final_conflict_batch: {
        batch_id: "final-user-question-wave",
        conflicts: [{ fingerprint: "f-empty", summary: "Choose a final action", options: ["Keep actionable", "Dismiss finding"] }],
      },
      findings: {
        "f-empty": {
          fingerprint: "f-empty",
          suppression_identity: "f-empty",
          category: "correctness",
          severity: "major",
          confidence: "high",
          title: "Pending finding",
          summary: "Pending summary",
          remediation_intent: "fix-pending",
          evidence: [{ path: "src/index.ts", start_line: 1, end_line: 2 }],
          state: "candidate",
          first_seen_at: "2026-04-01T10:00:00.000Z",
          updated_at: "2026-04-01T10:00:00.000Z",
          state_events: [{ to: "candidate", at: "2026-04-01T10:00:00.000Z" }],
        },
      },
      locked_session_markers: { argus_lane_sessions: [] },
      lane_lineage_by_wave: {},
      locked_role_invocations: [],
    }, null, 2), "utf-8")

    const hook = createStartReviewHook(createMockPluginInput([{ role: "assistant", text: "Review question pending" }]))
    const output = { parts: [] as Array<{ type: string; text?: string }> }

    await hook["command.execute.before"]?.(
      { sessionID: "ses-empty-pending", command: "start-review", arguments: "" },
      output,
    )

    expect(output.parts[0]?.text).toContain("Final Review Conflict Adjudication Required")
    expect(output.parts[0]?.text).toContain("call the existing `question` tool")
  })

  test("no review state or artifact directory is created before ambiguous question confirmation", async () => {
    const hook = createStartReviewHook(createMockPluginInput())
    const output = {
      parts: [{ type: "text", text: createStartReviewPrompt(".") }],
    }

    await hook["command.execute.before"]?.(
      { sessionID: "ses-prestate", command: "start-review", arguments: "." },
      output,
    )

    expect(existsSync(join(testDir, ".sisyphus", "reviews"))).toBe(false)
    expect(existsSync(join(testDir, ".sisyphus", "boulder.json"))).toBe(false)
  })

  test("ambiguous confirmation answer continues into runtime execution on subsequent message", async () => {
    const hook = createStartReviewHook(createMockPluginInput(), {
      backgroundManager: createMockBackgroundManager(),
    })

    const ambiguous = {
      parts: [{ type: "text", text: createStartReviewPrompt(".") }],
    }
    await hook["chat.message"]?.({ sessionID: "ses-confirm-path" }, ambiguous)
    expect(ambiguous.parts[0].text).toContain("Review Mode Confirmation Required")

    const confirmed = {
      parts: [{ type: "text", text: createStartReviewPrompt("Review full repository") }],
    }
    await hook["chat.message"]?.({ sessionID: "ses-confirm-path" }, confirmed)

    expect(confirmed.parts[0].text).toContain("Resolved prior ambiguous /start-review confirmation")
    expect(confirmed.parts[0].text).toContain("Runtime Review Bootstrap")
  })

  test("pending final conflicts trigger exactly one final question wave", async () => {
    const reviewRoot = join(testDir, ".sisyphus", "reviews", "run-pending")
    mkdirSync(reviewRoot, { recursive: true })
    writeFileSync(join(reviewRoot, "merged-findings.json"), JSON.stringify({ consensus_findings: [] }, null, 2), "utf-8")
    writeFileSync(join(reviewRoot, "state.json"), JSON.stringify({
      version: 1,
      profile: "test",
      review_run_id: "run-pending",
      coordinator_session_id: "ses-final-q",
      review_scope_key: "scope-final",
      suppression_scope_key: "supp-final",
      ref_identity: { base_ref: null, head_ref: null },
      phase: "tie_break_pending",
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:00:01.000Z",
      wave_counters: { completed_waves: 1, dry_waves: 1 },
      stop_reason: "dry-wave-complete",
      stop_wave: 1,
      pending_final_conflict_batch: {
        batch_id: "final-user-question-wave",
        conflicts: [
          {
            fingerprint: "f-pending",
            summary: "Choose whether to keep this finding actionable",
            options: ["Keep actionable", "Dismiss finding"],
          },
        ],
      },
      findings: {
        "f-pending": {
          fingerprint: "f-pending",
          suppression_identity: "f-pending",
          category: "correctness",
          severity: "major",
          confidence: "high",
          title: "Pending finding",
          summary: "Pending summary",
          remediation_intent: "fix-pending",
          evidence: [{ path: "src/index.ts", start_line: 1, end_line: 2 }],
          state: "candidate",
          first_seen_at: "2026-04-01T10:00:00.000Z",
          updated_at: "2026-04-01T10:00:00.000Z",
          state_events: [{ to: "candidate", at: "2026-04-01T10:00:00.000Z" }],
        },
      },
      locked_session_markers: { argus_lane_sessions: [] },
      lane_lineage_by_wave: {},
      locked_role_invocations: [],
    }, null, 2), "utf-8")

    const hook = createStartReviewHook(createMockPluginInput([{ role: "assistant", text: "Review question pending" }]))
    const output = {
      parts: [{ type: "text", text: "You are Themis, the native top-level review coordinator." }],
    }

    await hook["chat.message"]?.({ sessionID: "ses-final-q", agent: "themis" }, output)

    const text = output.parts[0].text ?? ""
    expect(text).toContain("Final Review Conflict Adjudication Required")
    expect(text).toContain("call the existing `question` tool")
    expect(text).toContain("Dismiss finding")
  })

  test("final adjudication answer updates state and clears pending batch", async () => {
    const reviewRoot = join(testDir, ".sisyphus", "reviews", "run-resolve")
    mkdirSync(reviewRoot, { recursive: true })
    writeFileSync(join(reviewRoot, "merged-findings.json"), JSON.stringify({ consensus_findings: [] }, null, 2), "utf-8")
    writeFileSync(join(reviewRoot, "state.json"), JSON.stringify({
      version: 1,
      profile: "test",
      review_run_id: "run-resolve",
      coordinator_session_id: "ses-final-resolve",
      review_scope_key: "scope-final",
      suppression_scope_key: "supp-final",
      ref_identity: { base_ref: null, head_ref: null },
      phase: "tie_break_pending",
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:00:01.000Z",
      wave_counters: { completed_waves: 1, dry_waves: 1 },
      stop_reason: "dry-wave-complete",
      stop_wave: 1,
      pending_final_conflict_batch: {
        batch_id: "final-user-question-wave",
        conflicts: [
          {
            fingerprint: "f-resolve",
            summary: "Choose whether to keep this finding actionable",
            options: ["Keep actionable", "Dismiss finding"],
          },
        ],
      },
      findings: {
        "f-resolve": {
          fingerprint: "f-resolve",
          suppression_identity: "f-resolve",
          category: "correctness",
          severity: "major",
          confidence: "high",
          title: "Resolvable finding",
          summary: "Resolvable summary",
          remediation_intent: "fix-resolve",
          evidence: [{ path: "src/index.ts", start_line: 1, end_line: 2 }],
          state: "candidate",
          first_seen_at: "2026-04-01T10:00:00.000Z",
          updated_at: "2026-04-01T10:00:00.000Z",
          state_events: [{ to: "candidate", at: "2026-04-01T10:00:00.000Z" }],
        },
      },
      locked_session_markers: { argus_lane_sessions: [] },
      lane_lineage_by_wave: {},
      locked_role_invocations: [],
    }, null, 2), "utf-8")

    const hook = createStartReviewHook(createMockPluginInput([{ role: "user", text: "Keep actionable" }]))
    const output = {
      parts: [{ type: "text", text: "You are Themis, the native top-level review coordinator." }],
    }

    await hook["chat.message"]?.({ sessionID: "ses-final-resolve", agent: "themis" }, output)

    const state = JSON.parse(readFileSync(join(reviewRoot, "state.json"), "utf-8")) as {
      phase: string
      pending_final_conflict_batch?: unknown
      findings: Record<string, { state: string }>
    }
    expect(state.phase).toBe("completed")
    expect(state.pending_final_conflict_batch).toBeUndefined()
    expect(state.findings["f-resolve"]?.state).toBe("accepted_open")
    expect(output.parts[0].text).toContain("Final Review Adjudication Resolved")
  })
})
