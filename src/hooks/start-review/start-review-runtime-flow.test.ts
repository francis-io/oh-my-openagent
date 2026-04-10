import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { startReviewRuntimeFlow } from "./start-review-runtime-flow"

function writeProjectFile(root: string, relativePath: string, content: string): void {
  const absolutePath = join(root, relativePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content, "utf-8")
}

describe("start-review runtime flow", () => {
  test("reruns in same session create fresh run ids instead of stale-state short-circuit", async () => {
    const root = mkdtempSync(join(tmpdir(), "start-review-runtime-rerun-"))
    writeProjectFile(root, "src/a.ts", "export const a = 1\n")

    let taskCounter = 0
    const tasks = new Map<string, { id: string; status: string; result: string }>()
    const manager = {
      launch: async (input: { description: string }) => {
        taskCounter += 1
        const id = `task-${taskCounter}`
        const isWave1 = input.description.includes("wave 1")
        const payload = input.description.startsWith("argus")
          ? JSON.stringify({
              findings: [
                {
                  category: "correctness",
                  severity: isWave1 ? "major" : "minor",
                  confidence: "high",
                  title: "lane-argus",
                  summary: "runtime",
                  evidence: [{ path: "src/a.ts", start_line: 1, end_line: 1 }],
                  remediation: { intent: "fix-runtime" },
                },
              ],
            })
          : JSON.stringify({ status: "ok" })
        tasks.set(id, { id, status: "completed", result: payload })
        return { id, sessionID: `ses-${id}` }
      },
      getTask: (id: string) => tasks.get(id),
    }

    const runA = await startReviewRuntimeFlow({
      workspaceRoot: root,
      mode: "repo-wide",
      requestedInput: "review full repository",
      sessionID: "ses-rerun",
      backgroundManager: manager as never,
      now: "2026-04-01T10:00:00.000Z",
    })
    const runB = await startReviewRuntimeFlow({
      workspaceRoot: root,
      mode: "repo-wide",
      requestedInput: "review full repository",
      sessionID: "ses-rerun",
      backgroundManager: manager as never,
      now: "2026-04-01T10:01:00.000Z",
    })

    expect(runA.started).toBe(true)
    expect(runB.started).toBe(true)
    expect(runA.review_run_id).not.toBe(runB.review_run_id)

    rmSync(root, { recursive: true, force: true })
  })

  test("fails closed when the lane does not complete successfully", async () => {
    const root = mkdtempSync(join(tmpdir(), "start-review-runtime-lane-failure-"))
    writeProjectFile(root, "src/a.ts", "export const a = 1\n")

    const tasks = new Map<string, { id: string; status: string; result?: string }>()
    const manager = {
      launch: async (input: { description: string }) => {
        const id = input.description.startsWith("argus") ? "argus-lane" : "merge-lane"
        if (id === "argus-lane") {
          tasks.set(id, { id, status: "error" })
        }
        return { id, sessionID: `ses-${id}` }
      },
      getTask: (id: string) => tasks.get(id),
    }

    await expect(
      startReviewRuntimeFlow({
        workspaceRoot: root,
        mode: "repo-wide",
        requestedInput: "review full repository",
        sessionID: "ses-fail-closed",
        backgroundManager: manager as never,
        now: "2026-04-01T10:00:00.000Z",
      }),
    ).rejects.toThrow("did not complete successfully")

    rmSync(root, { recursive: true, force: true })
  })

  test("accumulates multi-wave findings into remediation output", async () => {
    const root = mkdtempSync(join(tmpdir(), "start-review-runtime-accumulate-"))
    writeProjectFile(root, "src/a.ts", "export const a = 1\n")

    let sequence = 0
    const tasks = new Map<string, { id: string; status: string; result: string }>()
    const manager = {
      launch: async (input: { description: string }) => {
        sequence += 1
        const id = `task-${sequence}`
        const wave = input.description.includes("wave 2") ? 2 : 1

        if (input.description.startsWith("argus")) {
          const fingerprint = wave === 1 ? "f-wave-1" : "f-wave-2"
          tasks.set(id, {
            id,
            status: "completed",
            result: JSON.stringify({
              findings: [
                {
                  category: "correctness",
                  severity: "major",
                  confidence: "high",
                  title: `argus-wave-${wave}-title`,
                  summary: "runtime",
                  evidence: [{ path: "src/a.ts", start_line: 1, end_line: 1 }],
                  remediation: { intent: "fix-runtime" },
                  suppression_identity: fingerprint,
                  fingerprint,
                },
              ],
            }),
          })
        } else if (input.description.startsWith("themis merge")) {
          tasks.set(id, { id, status: "completed", result: JSON.stringify({ status: "ok", findings_considered: 2, notes: "merged" }) })
        } else if (input.description.startsWith("oracle tie-break")) {
          tasks.set(id, {
            id,
            status: "completed",
            result: JSON.stringify({ resolutions: [] }),
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
      sessionID: "ses-merge-runtime",
      backgroundManager: manager as never,
      now: "2026-04-01T10:00:00.000Z",
    })

    const remediationContent = readFileSync(join(root, runtime.remediation_plan_relative_path), "utf-8")
    const mergedFindings = JSON.parse(readFileSync(join(root, ".sisyphus", "reviews", runtime.review_run_id, "merged-findings.json"), "utf-8")) as {
      runtime_execution: { merge: { task_id: string; validation: { findings_considered: number } }; tie_break: { task_id: string } | null }
    }

    expect(remediationContent).toContain("f-wave-1")
    expect(remediationContent).toContain("f-wave-2")
    expect(remediationContent).toContain("argus-claude (wave 1)")
    expect(remediationContent).toContain("argus-claude (wave 2)")
    expect(mergedFindings.runtime_execution.merge.task_id.length).toBeGreaterThan(0)
    expect(mergedFindings.runtime_execution.merge.validation.findings_considered).toBe(2)

    rmSync(root, { recursive: true, force: true })
  })

  test("single lane produces consensus with no tie-break conflicts", async () => {
    const root = mkdtempSync(join(tmpdir(), "start-review-runtime-no-conflict-"))
    writeProjectFile(root, "src/a.ts", "export const a = 1\n")

    let sequence = 0
    const tasks = new Map<string, { id: string; status: string; result: string }>()
    const manager = {
      launch: async (input: { description: string }) => {
        sequence += 1
        const id = `task-${sequence}`
        if (input.description.startsWith("argus")) {
          tasks.set(id, {
            id,
            status: "completed",
            result: JSON.stringify({
              findings: [{
                category: "correctness",
                severity: "major",
                confidence: "high",
                title: "argus-finding",
                summary: "runtime",
                evidence: [{ path: "src/a.ts", start_line: 1, end_line: 1 }],
                remediation: { intent: "fix-runtime" },
                suppression_identity: "f-single",
                fingerprint: "f-single",
              }],
            }),
          })
        } else if (input.description.startsWith("themis merge")) {
          tasks.set(id, { id, status: "completed", result: JSON.stringify({ status: "ok", findings_considered: 1, notes: "validated" }) })
        } else if (input.description.startsWith("oracle tie-break")) {
          tasks.set(id, { id, status: "completed", result: JSON.stringify({ resolutions: [] }) })
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
      sessionID: "ses-no-conflict-runtime",
      backgroundManager: manager as never,
      now: "2026-04-01T10:00:00.000Z",
    })

    expect(runtime.final_conflict_count).toBe(0)
    expect(runtime.stop_reason).toBe("dry-wave-complete")

    const remediationContent = readFileSync(join(root, runtime.remediation_plan_relative_path), "utf-8")
    expect(remediationContent).toContain("f-single")
    expect(remediationContent).toContain("argus-finding")

    rmSync(root, { recursive: true, force: true })
  })

  test("resolves lane and merge output from completed session messages when task.result is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "start-review-runtime-session-output-"))
    writeProjectFile(root, "src/a.ts", "export const a = 1\n")

    let sequence = 0
    const tasks = new Map<string, { id: string; sessionID: string; status: string; result?: string }>()
    const sessionMessages = new Map<string, unknown>()
    const manager = {
      launch: async (input: { description: string }) => {
        sequence += 1
        const id = `task-${sequence}`
        const sessionID = `ses-${id}`
        if (input.description.startsWith("argus")) {
          tasks.set(id, { id, sessionID, status: "completed" })
          sessionMessages.set(sessionID, {
            data: [{
              info: { role: "assistant", time: { created: 1 } },
              parts: [{
                type: "text",
                text: JSON.stringify({
                  findings: [{
                    category: "correctness",
                    severity: "major",
                    confidence: "high",
                    title: "argus-finding",
                    summary: "runtime",
                    evidence: [{ path: "src/a.ts", start_line: 1, end_line: 1 }],
                    remediation: { intent: "fix-runtime" },
                    suppression_identity: "f-shared",
                    fingerprint: "f-shared",
                  }],
                }),
              }],
            }],
          })
        } else if (input.description.startsWith("themis merge")) {
          tasks.set(id, { id, sessionID, status: "completed" })
          sessionMessages.set(sessionID, {
            data: [{
              info: { role: "assistant", time: { created: 1 } },
              parts: [{ type: "text", text: JSON.stringify({ status: "ok", findings_considered: 1, notes: "validated" }) }],
            }],
          })
        } else if (input.description.startsWith("oracle tie-break")) {
          tasks.set(id, { id, sessionID, status: "completed" })
          sessionMessages.set(sessionID, {
            data: [{
              info: { role: "assistant", time: { created: 1 } },
              parts: [{ type: "text", text: JSON.stringify({ resolutions: [] }) }],
            }],
          })
        } else {
          tasks.set(id, { id, sessionID, status: "completed", result: JSON.stringify({ status: "ok" }) })
        }

        return { id, sessionID }
      },
      getTask: (id: string) => tasks.get(id),
      getSessionMessages: async (sessionID: string) => sessionMessages.get(sessionID),
    }

    const runtime = await startReviewRuntimeFlow({
      workspaceRoot: root,
      mode: "repo-wide",
      requestedInput: "review full repository",
      sessionID: "ses-session-output-runtime",
      backgroundManager: manager as never,
      now: "2026-04-01T10:00:00.000Z",
    })

    const remediationContent = readFileSync(join(root, runtime.remediation_plan_relative_path), "utf-8")
    expect(remediationContent).toContain("f-shared")
    expect(remediationContent).toContain("argus-finding")

    rmSync(root, { recursive: true, force: true })
  })
})
