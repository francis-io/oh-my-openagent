/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { inferStartReviewMode } from "./mode-inference"

describe("inferStartReviewMode", () => {
  test("infers plan+git-diff with explicit .sisyphus plan path", () => {
    const result = inferStartReviewMode(".sisyphus/plans/review-task.md")

    expect(result.mode).toBe("plan+git-diff")
    expect(result.shouldConfirm).toBe(false)
    expect(result.options[0]).toBe("Review completed plan")
  })

  test("infers repo-wide with explicit repository cue", () => {
    const result = inferStartReviewMode("review full repository for regressions")

    expect(result.mode).toBe("repo-wide")
    expect(result.shouldConfirm).toBe(false)
    expect(result.options[0]).toBe("Review full repository")
  })

  test("dot input is ambiguous and requires question confirmation", () => {
    const result = inferStartReviewMode(".")

    expect(result.mode).toBe("repo-wide")
    expect(result.shouldConfirm).toBe(true)
    expect(result.strength).toBe("ambiguous")
    expect(result.options[0]).toBe("Review full repository")
  })

  test("soft markdown input requires question confirmation", () => {
    const result = inferStartReviewMode("docs/implementation-notes.md")

    expect(result.mode).toBe("plan+git-diff")
    expect(result.shouldConfirm).toBe(true)
    expect(result.strength).toBe("soft")
    expect(result.options[0]).toBe("Review full repository")
  })

  test("mixed concrete plan_path and repo-wide cues requires confirmation", () => {
    const result = inferStartReviewMode(".sisyphus/plans/auth.md review full repository")

    expect(result.mode).toBe("plan+git-diff")
    expect(result.shouldConfirm).toBe(true)
    expect(result.strength).toBe("ambiguous")
    expect(result.options[0]).toBe("Review completed plan")
  })
})
