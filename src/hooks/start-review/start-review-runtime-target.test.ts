import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { resolveStartReviewRuntimeTarget } from "./start-review-runtime-target"

describe("start-review runtime target resolution", () => {
  test("plan+git-diff stays in explicit mode and does not silently downgrade to repo-wide", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "start-review-target-"))

    const resolved = resolveStartReviewRuntimeTarget({
      workspaceRoot: projectRoot,
      mode: "plan+git-diff",
      review_scope_key: "scope-x",
      suppression_scope_key: "suppression-x",
      planPathHint: ".sisyphus/plans/missing.md",
      now: "2026-04-01T00:00:00.000Z",
    })

    expect(resolved.mode).toBe("plan+git-diff")
    expect(resolved.target.mode).toBe("plan+git-diff")
    expect(resolved.target.diff.source_kind).not.toBe("repo_snapshot")

    rmSync(projectRoot, { recursive: true, force: true })
  })
})
