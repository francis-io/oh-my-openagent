import { describe, expect, test } from "bun:test"
import { syncReviewArtifactsFromWorktree } from "./review-worktree-sync"

describe("syncReviewArtifactsFromWorktree", () => {
  test("returns false when copy operation throws", () => {
    const result = syncReviewArtifactsFromWorktree({
      worktree_path: "/tmp/worktree",
      main_repo_path: "/tmp/main",
      review_run_id: "run-worktree-failure",
      review_scope_key: "scope-a",
      suppression_scope_key: "suppression-a",
      deps: {
        exists: () => true,
        mkdir: () => {},
        copy: () => {
          throw new Error("copy failed")
        },
      },
    })

    expect(result).toBe(false)
  })
})
