import { describe, expect, mock, test } from "bun:test"
import { createRuntimeShowToast, emitReviewToast } from "./start-review-runtime-toasts"

describe("start-review runtime toasts", () => {
  test("emits one toast for each lifecycle event", () => {
    const showToast = mock(() => Promise.resolve({}))

    emitReviewToast(showToast, { type: "review-started", profile: "test", mode: "repo-wide", reviewRunId: "run-1" })
    emitReviewToast(showToast, { type: "wave-started", wave: 1 })
    emitReviewToast(showToast, { type: "wave-complete", wave: 1, findingCount: 2, newHighCount: 1 })
    emitReviewToast(showToast, { type: "convergence-complete", completedWaves: 2, stopReason: "dry-wave-complete", totalFindings: 3 })
    emitReviewToast(showToast, { type: "merge-started", laneFindingCount: 4, retrying: false })
    emitReviewToast(showToast, { type: "tie-break-started", conflictCount: 1 })
    emitReviewToast(showToast, { type: "review-complete", acceptedCount: 3, remediationPath: ".sisyphus/plans/x.md" })
    emitReviewToast(showToast, { type: "review-needs-input", conflictCount: 2 })
    emitReviewToast(showToast, { type: "review-error", message: "boom", recoveryAttempted: true })

    expect(showToast).toHaveBeenCalledTimes(9)
  })

  test("swallows rejected toast promises", async () => {
    const showToast = mock(() => Promise.reject(new Error("toast failed")))
    emitReviewToast(showToast, { type: "review-error", message: "boom", recoveryAttempted: false })
    await Promise.resolve()
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  test("swallows synchronous toast throws", () => {
    const showToast = mock(() => {
      throw new Error("sync toast failure")
    })

    expect(() => {
      emitReviewToast(showToast, { type: "review-error", message: "boom", recoveryAttempted: false })
    }).not.toThrow()
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  test("preserves receiver when adapting tui.showToast", async () => {
    const calls: Array<{ body: { title: string; message: string; variant: string; duration: number } }> = []

    const tui = {
      prefix: "bound",
      showToast(input: { body: { title: string; message: string; variant: "info" | "success" | "warning" | "error"; duration: number } }) {
        if (this.prefix !== "bound") {
          throw new Error("receiver lost")
        }
        calls.push(input)
        return Promise.resolve({})
      },
    }

    const runtimeShowToast = createRuntimeShowToast(tui)
    emitReviewToast(runtimeShowToast, { type: "review-started", profile: "test", mode: "repo-wide", reviewRunId: "run-1" })

    await Promise.resolve()

    expect(calls).toHaveLength(1)
    expect(calls[0]?.body.title).toBe("Review Started")
  })
})
