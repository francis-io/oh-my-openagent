import { describe, expect, mock, test } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { startReviewRuntimeFlow } from "./start-review-runtime-flow"

function writeProjectFile(root: string, relativePath: string, content: string): void {
  const absolutePath = join(root, relativePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content, "utf-8")
}

describe("start-review runtime recovery", () => {
  test("retries merge after parse failure using persisted lane findings", async () => {
    const root = mkdtempSync(join(tmpdir(), "start-review-runtime-recovery-"))
    writeProjectFile(root, "src/a.ts", "export const a = 1\n")

    let sequence = 0
    let mergeAttempts = 0
    const tasks = new Map<string, { id: string; status: string; result: string }>()
    const manager = {
      launch: async (input: { description: string }) => {
        sequence += 1
        const id = `task-${sequence}`
        if (input.description.includes("argus")) {
          tasks.set(id, {
            id,
            status: "completed",
            result: JSON.stringify({
              findings: [{
                category: "correctness",
                severity: "major",
                confidence: "high",
                title: input.description.includes("claude") ? "claude-title" : "gpt-title",
                summary: "runtime",
                evidence: [{ path: "src/a.ts", start_line: 1, end_line: 1 }],
                remediation: { intent: "fix-runtime" },
                suppression_identity: "f-shared",
                fingerprint: "f-shared",
              }],
            }),
          })
        } else if (input.description.startsWith("themis merge")) {
          mergeAttempts += 1
          tasks.set(id, {
            id,
            status: "completed",
            result: mergeAttempts === 1
              ? "ULTRAWORK {not-json}"
              : JSON.stringify({ status: "ok", findings_considered: 2, notes: "recovered" }),
          })
        } else {
          tasks.set(id, { id, status: "completed", result: JSON.stringify({ status: "ok" }) })
        }

        return { id, sessionID: `ses-${id}` }
      },
      getTask: (id: string) => tasks.get(id),
    }
    const showToast = mock((input: { body: { title: string } }) => Promise.resolve(input))

    const runtime = await startReviewRuntimeFlow({
      workspaceRoot: root,
      mode: "repo-wide",
      requestedInput: "review full repository",
      sessionID: "ses-recovery-runtime",
      backgroundManager: manager as never,
      showToast,
      now: "2026-04-01T10:00:00.000Z",
    })

    const mergedFindings = JSON.parse(readFileSync(join(root, ".sisyphus", "reviews", runtime.review_run_id, "merged-findings.json"), "utf-8")) as {
      runtime_execution: { merge: { validation: { notes: string } } }
    }

    expect(mergeAttempts).toBe(2)
    expect(mergedFindings.runtime_execution.merge.validation.notes).toBe("recovered")
    expect(showToast.mock.calls.some(([input]) => input.body.title === "Review Error")).toBe(false)

    rmSync(root, { recursive: true, force: true })
  })

  test("recovers from missing persisted lane json via markdown fallback", async () => {
    const root = mkdtempSync(join(tmpdir(), "start-review-runtime-md-fallback-"))
    writeProjectFile(root, "src/a.ts", "export const a = 1\n")

    let sequence = 0
    let mergeAttempts = 0
    const tasks = new Map<string, { id: string; status: string; result: string }>()
    const manager = {
      launch: async (input: { description: string }) => {
        sequence += 1
        const id = `task-${sequence}`
        if (input.description.includes("argus")) {
          tasks.set(id, {
            id,
            status: "completed",
            result: JSON.stringify({
              findings: [{
                category: "correctness",
                severity: "major",
                confidence: "high",
                title: input.description.includes("claude") ? "claude-title" : "gpt-title",
                summary: "runtime",
                evidence: [{ path: "src/a.ts", start_line: 1, end_line: 1 }],
                remediation: { intent: "fix-runtime" },
                suppression_identity: "f-shared",
                fingerprint: "f-shared",
              }],
            }),
          })
        } else if (input.description.startsWith("themis merge")) {
          mergeAttempts += 1
          if (mergeAttempts === 1) {
            const reviewsDir = join(root, ".sisyphus", "reviews")
            const reviewRunId = readdirSync(reviewsDir)[0]
            if (!reviewRunId) {
              throw new Error("Expected review artifacts directory before merge retry test")
            }
            rmSync(join(reviewsDir, reviewRunId, "lanes", "argus", "pass-1.json"), { force: true })
            rmSync(join(reviewsDir, reviewRunId, "lanes", "argus", "pass-1.json"), { force: true })
          }
          tasks.set(id, {
            id,
            status: "completed",
            result: mergeAttempts === 1
              ? "ULTRAWORK {not-json}"
              : JSON.stringify({ status: "ok", findings_considered: 2, notes: "recovered-from-md" }),
          })
        } else {
          tasks.set(id, { id, status: "completed", result: JSON.stringify({ status: "ok" }) })
        }

        return { id, sessionID: `ses-${id}` }
      },
      getTask: (id: string) => tasks.get(id),
    }

    const runtime = await startReviewRuntimeFlow({
      workspaceRoot: root,
      mode: "repo-wide",
      requestedInput: "review full repository",
      sessionID: "ses-md-recovery-runtime",
      backgroundManager: manager as never,
      now: "2026-04-01T10:00:00.000Z",
    })

    const reviewRoot = join(root, ".sisyphus", "reviews", runtime.review_run_id)

    const mergedFindings = JSON.parse(readFileSync(join(reviewRoot, "merged-findings.json"), "utf-8")) as {
      runtime_execution: { merge: { validation: { notes: string } } }
    }

    expect(mergeAttempts).toBe(2)
    expect(mergedFindings.runtime_execution.merge.validation.notes).toBe("recovered-from-md")

    rmSync(root, { recursive: true, force: true })
  })

  test("emits a single handled error toast when retry also fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "start-review-runtime-retry-fail-"))
    writeProjectFile(root, "src/a.ts", "export const a = 1\n")

    let sequence = 0
    let mergeAttempts = 0
    const tasks = new Map<string, { id: string; status: string; result: string }>()
    const manager = {
      launch: async (input: { description: string }) => {
        sequence += 1
        const id = `task-${sequence}`
        if (input.description.includes("argus")) {
          tasks.set(id, {
            id,
            status: "completed",
            result: JSON.stringify({
              findings: [{
                category: "correctness",
                severity: "major",
                confidence: "high",
                title: input.description.includes("claude") ? "claude-title" : "gpt-title",
                summary: "runtime",
                evidence: [{ path: "src/a.ts", start_line: 1, end_line: 1 }],
                remediation: { intent: "fix-runtime" },
                suppression_identity: "f-shared",
                fingerprint: "f-shared",
              }],
            }),
          })
        } else if (input.description.startsWith("themis merge")) {
          mergeAttempts += 1
          tasks.set(id, {
            id,
            status: "completed",
            result: "ULTRAWORK {not-json}",
          })
        } else {
          tasks.set(id, { id, status: "completed", result: JSON.stringify({ status: "ok" }) })
        }

        return { id, sessionID: `ses-${id}` }
      },
      getTask: (id: string) => tasks.get(id),
    }
    const showToast = mock((input: { body: { title: string; message: string } }) => Promise.resolve(input))

    await expect(
      startReviewRuntimeFlow({
        workspaceRoot: root,
        mode: "repo-wide",
        requestedInput: "review full repository",
        sessionID: "ses-retry-fail-runtime",
        backgroundManager: manager as never,
        showToast,
        now: "2026-04-01T10:00:00.000Z",
      }),
    ).rejects.toThrow()

    expect(mergeAttempts).toBe(2)
    const errorToasts = showToast.mock.calls.filter(([input]) => input.body.title === "Review Error")
    expect(errorToasts).toHaveLength(1)
    expect(errorToasts[0]?.[0].body.message).toContain("recovery attempted")

    rmSync(root, { recursive: true, force: true })
  })
})
