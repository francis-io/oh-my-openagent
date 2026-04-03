import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { createOpencodeClient, type Project } from "@opencode-ai/sdk"
import { MESSAGE_STORAGE } from "../../shared/opencode-storage-paths"
import { createToolExecuteAfterHandler } from "./tool-execute-after"

describe("createToolExecuteAfterHandler background launch detection", () => {
  let testDirectory = ""

  beforeEach(() => {
    testDirectory = join(tmpdir(), `atlas-background-launch-${crypto.randomUUID()}`)
    if (!existsSync(testDirectory)) {
      mkdirSync(testDirectory, { recursive: true })
    }
  })

  afterEach(() => {
    if (testDirectory && existsSync(testDirectory)) {
      rmSync(testDirectory, { recursive: true, force: true })
    }
    const messageDir = join(MESSAGE_STORAGE, "ses_parent")
    if (existsSync(messageDir)) {
      rmSync(messageDir, { recursive: true, force: true })
    }
  })

  function seedOrchestratorMessage(sessionID: string): void {
    const messageDir = join(MESSAGE_STORAGE, sessionID)
    mkdirSync(messageDir, { recursive: true })
    writeFileSync(
      join(messageDir, "msg_001.json"),
      JSON.stringify({
        agent: "atlas",
        model: { providerID: "anthropic", modelID: "claude-opus-4-6" },
      }),
      "utf-8",
    )
  }

  function createHandler() {
    const project = {
      id: "project-1",
      worktree: testDirectory,
      time: { created: Date.now() },
    } satisfies Project

    const ctx = {
      client: createOpencodeClient(),
      project,
      directory: testDirectory,
      worktree: testDirectory,
      serverUrl: new URL("https://example.com"),
      $: Bun.$,
    } satisfies PluginInput

    return createToolExecuteAfterHandler({
      ctx,
      pendingFilePaths: new Map(),
      pendingTaskRefs: new Map(),
      autoCommit: true,
      getState: () => ({ promptFailureCount: 0 }),
    })
  }

  it("treats call_omo_agent background launch output as still running", async () => {
    seedOrchestratorMessage("ses_parent")
    const handler = createHandler()
    const output = {
      title: "call_omo_agent",
      output: "Background agent task launched successfully.",
      metadata: { sessionId: "ses_child123" },
    }

    await handler(
      { tool: "call_omo_agent", sessionID: "ses_parent" },
      output,
    )

    expect(output.output).toBe("Background agent task launched successfully.")
  })
})
