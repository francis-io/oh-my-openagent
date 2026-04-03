import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

mock.module("../../shared/opencode-storage-detection", () => ({
  isSqliteBackend: () => false,
  resetSqliteBackendCache: () => {},
}))

const { createReviewPathGuardHook } = await import("./index")
const { MESSAGE_STORAGE } = await import("../../features/hook-message-injector")

type Hook = ReturnType<typeof createReviewPathGuardHook>

function setupMessageStorage(sessionID: string, agent: string): string {
  const messageDir = join(MESSAGE_STORAGE, sessionID)
  mkdirSync(messageDir, { recursive: true })
  writeFileSync(
    join(messageDir, "msg_001.json"),
    JSON.stringify({
      agent,
      model: { providerID: "test", modelID: "test-model" },
    }),
  )
  return messageDir
}

describe("review-path-guard", () => {
  let workspaceDir = ""
  let outsideDir = ""
  let hook: Hook
  const trackedMessageDirs: string[] = []

  const invokeWrite = async (args: {
    sessionID: string
    filePath: string
    tool?: "Write" | "Edit" | "apply_patch"
  }): Promise<void> => {
    await hook["tool.execute.before"]?.(
      {
        tool: args.tool ?? "Write",
        sessionID: args.sessionID,
        callID: `call-${Date.now()}`,
      },
      { args: { filePath: args.filePath } },
    )
  }

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "review-path-guard-workspace-"))
    outsideDir = mkdtempSync(join(tmpdir(), "review-path-guard-outside-"))
    hook = createReviewPathGuardHook({
      directory: workspaceDir,
      client: {},
    } as never)
  })

  afterEach(() => {
    for (const messageDir of trackedMessageDirs.splice(0)) {
      rmSync(messageDir, { recursive: true, force: true })
    }

    rmSync(workspaceDir, { recursive: true, force: true })
    rmSync(outsideDir, { recursive: true, force: true })
  })

  test("#given themis #when writing review artifact #then allows", async () => {
    //#given
    const sessionID = "ses_themis_review_artifact"
    trackedMessageDirs.push(setupMessageStorage(sessionID, "themis"))

    //#when/#then
    await expect(
      invokeWrite({
        sessionID,
        filePath: ".sisyphus/reviews/run-2026-04-01/lanes/lane-a/pass-1.md",
      }),
    ).resolves.toBeUndefined()
  })

  test("#given themis #when writing canonical remediation plan #then allows", async () => {
    //#given
    const sessionID = "ses_themis_remediation"
    trackedMessageDirs.push(setupMessageStorage(sessionID, "Themis (Reviewer)"))

    //#when/#then
    await expect(
      invokeWrite({
        sessionID,
        filePath: ".sisyphus/plans/review-remediation-run-2026-04-01.md",
      }),
    ).resolves.toBeUndefined()
  })

  test("#given argus #when writing review artifact #then allows", async () => {
    //#given
    const sessionID = "ses_argus_review_artifact"
    trackedMessageDirs.push(setupMessageStorage(sessionID, "Argus"))

    //#when/#then
    await expect(
      invokeWrite({
        sessionID,
        filePath: ".sisyphus/reviews/run-2026-04-01/merged-findings.json",
      }),
    ).resolves.toBeUndefined()
  })

  test("#given argus #when writing canonical remediation plan #then blocks", async () => {
    //#given
    const sessionID = "ses_argus_remediation_blocked"
    trackedMessageDirs.push(setupMessageStorage(sessionID, "argus"))

    //#when/#then
    await expect(
      invokeWrite({
        sessionID,
        filePath: ".sisyphus/plans/review-remediation-run-2026-04-01.md",
      }),
    ).rejects.toThrow("Allowed paths: .sisyphus/reviews/{review-run-id}/**")
  })

  test("#given review agents #when writing source files #then blocks", async () => {
    //#given
    const themisSessionID = "ses_themis_source_blocked"
    const argusSessionID = "ses_argus_source_blocked"
    trackedMessageDirs.push(setupMessageStorage(themisSessionID, "themis"))
    trackedMessageDirs.push(setupMessageStorage(argusSessionID, "argus"))

    //#when/#then
    await expect(
      invokeWrite({
        sessionID: themisSessionID,
        filePath: "src/index.ts",
      }),
    ).rejects.toThrow("source or non-review file writes are blocked")

    await expect(
      invokeWrite({
        sessionID: argusSessionID,
        filePath: "src/plugin/index.ts",
      }),
    ).rejects.toThrow("source or non-review file writes are blocked")
  })

  test("#given review agents #when calling apply_patch #then blocks", async () => {
    //#given
    const themisSessionID = "ses_themis_apply_patch_blocked"
    const argusSessionID = "ses_argus_apply_patch_blocked"
    trackedMessageDirs.push(setupMessageStorage(themisSessionID, "themis"))
    trackedMessageDirs.push(setupMessageStorage(argusSessionID, "argus"))

    //#when/#then
    await expect(
      invokeWrite({
        sessionID: themisSessionID,
        filePath: "src/index.ts",
        tool: "apply_patch",
      }),
    ).rejects.toThrow("Blocked themis apply_patch")

    await expect(
      invokeWrite({
        sessionID: argusSessionID,
        filePath: "src/plugin/index.ts",
        tool: "apply_patch",
      }),
    ).rejects.toThrow("Blocked argus apply_patch")
  })

  test("#given review agents #when writing reserved .sisyphus paths outside contract #then blocks", async () => {
    //#given
    const sessionID = "ses_themis_reserved_blocked"
    trackedMessageDirs.push(setupMessageStorage(sessionID, "themis"))

    //#when/#then
    await expect(
      invokeWrite({
        sessionID,
        filePath: ".sisyphus/ralph-loop.local.md",
      }),
    ).rejects.toThrow("reserved .sisyphus path outside review artifact contract")
  })

  test("#given review agents #when traversal symlink or path escape is attempted #then blocks", async () => {
    //#given
    const sessionID = "ses_argus_escape_blocked"
    trackedMessageDirs.push(setupMessageStorage(sessionID, "argus"))
    mkdirSync(join(workspaceDir, ".sisyphus", "reviews", "run-safe"), { recursive: true })
    writeFileSync(join(outsideDir, "escape.md"), "outside")
    symlinkSync(outsideDir, join(workspaceDir, ".sisyphus", "reviews", "run-safe", "outside-link"))

    //#when/#then
    await expect(
      invokeWrite({
        sessionID,
        filePath: ".sisyphus/reviews/run-safe/../../plans/review-remediation-run-safe.md",
      }),
    ).rejects.toThrow("reserved .sisyphus path outside review artifact contract")

    await expect(
      invokeWrite({
        sessionID,
        filePath: ".sisyphus/reviews/run-safe/outside-link/escape.md",
      }),
    ).rejects.toThrow("path escapes workspace root via traversal or symlink")

    await expect(
      invokeWrite({
        sessionID,
        filePath: join(outsideDir, "escape.md"),
      }),
    ).rejects.toThrow("path escapes workspace root via traversal or symlink")
  })

  test("#given non-review agent #when writing source file #then hook does not block", async () => {
    //#given
    const sessionID = "ses_sisyphus_not_target"
    trackedMessageDirs.push(setupMessageStorage(sessionID, "sisyphus"))
    const targetPath = join(workspaceDir, "src", "index.ts")
    mkdirSync(dirname(targetPath), { recursive: true })

    //#when/#then
    await expect(
      invokeWrite({
        sessionID,
        filePath: targetPath,
      }),
    ).resolves.toBeUndefined()
  })
})
