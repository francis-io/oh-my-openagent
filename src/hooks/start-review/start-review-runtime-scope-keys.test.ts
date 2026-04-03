import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, test } from "bun:test"
import { resolveReviewTarget } from "../../features/review-target-resolution"
import { deriveRuntimeScopeKeys } from "./start-review-runtime-scope-keys"

function writeProjectFile(root: string, relativePath: string, content: string): void {
  const absolutePath = join(root, relativePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content, "utf-8")
}

describe("start-review runtime scope keys", () => {
  test("same logical target across reruns yields stable review and suppression scope keys", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "start-review-scope-"))
    writeProjectFile(projectRoot, "src/a.ts", "export const a = 1\n")

    const targetA = resolveReviewTarget({
      mode: "repo-wide",
      project_root: projectRoot,
      review_scope_key: "bootstrap-scope-a",
      suppression_scope_key: "bootstrap-suppression-a",
      now: "2026-04-01T00:00:00.000Z",
    })
    const targetB = resolveReviewTarget({
      mode: "repo-wide",
      project_root: projectRoot,
      review_scope_key: "bootstrap-scope-b",
      suppression_scope_key: "bootstrap-suppression-b",
      now: "2026-04-01T00:00:00.000Z",
    })

    const keysA = deriveRuntimeScopeKeys({ target: targetA })
    const keysB = deriveRuntimeScopeKeys({ target: targetB })

    expect(keysA.review_scope_key).toBe(keysB.review_scope_key)
    expect(keysA.suppression_scope_key).toBe(keysB.suppression_scope_key)

    rmSync(projectRoot, { recursive: true, force: true })
  })

  test("changed target identity produces different derived scope keys", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "start-review-scope-drift-"))
    writeProjectFile(projectRoot, "src/a.ts", "export const a = 1\n")

    const before = resolveReviewTarget({
      mode: "repo-wide",
      project_root: projectRoot,
      review_scope_key: "bootstrap-scope",
      suppression_scope_key: "bootstrap-suppression",
      now: "2026-04-01T00:00:00.000Z",
    })

    writeProjectFile(projectRoot, "src/b.ts", "export const b = 2\n")

    const after = resolveReviewTarget({
      mode: "repo-wide",
      project_root: projectRoot,
      review_scope_key: "bootstrap-scope",
      suppression_scope_key: "bootstrap-suppression",
      now: "2026-04-01T00:00:00.000Z",
    })

    const beforeKeys = deriveRuntimeScopeKeys({ target: before })
    const afterKeys = deriveRuntimeScopeKeys({ target: after })

    expect(beforeKeys.review_scope_key).not.toBe(afterKeys.review_scope_key)
    expect(beforeKeys.suppression_scope_key).not.toBe(afterKeys.suppression_scope_key)

    rmSync(projectRoot, { recursive: true, force: true })
  })

  test("same branch/ref context across reruns yields stable keys", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "start-review-scope-ref-stable-"))
    writeProjectFile(projectRoot, "src/a.ts", "export const a = 1\n")

    const git = (args: string[]) => {
      const command = args.join(" ")
      if (command === "diff main...feature") return "@@ -1,1 +1,1 @@"
      if (command === "diff --name-only main...feature") return "src/a.ts"
      return ""
    }

    const targetA = resolveReviewTarget(
      {
        mode: "plan+git-diff",
        project_root: projectRoot,
        review_scope_key: "bootstrap-a",
        suppression_scope_key: "bootstrap-a",
        base_ref: "main",
        head_ref: "feature",
      },
      { git },
    )
    const targetB = resolveReviewTarget(
      {
        mode: "plan+git-diff",
        project_root: projectRoot,
        review_scope_key: "bootstrap-b",
        suppression_scope_key: "bootstrap-b",
        base_ref: "main",
        head_ref: "feature",
      },
      { git },
    )

    const keysA = deriveRuntimeScopeKeys({ target: targetA })
    const keysB = deriveRuntimeScopeKeys({ target: targetB })

    expect(keysA.review_scope_key).toBe(keysB.review_scope_key)
    expect(keysA.suppression_scope_key).toBe(keysB.suppression_scope_key)

    rmSync(projectRoot, { recursive: true, force: true })
  })

  test("changed branch/ref context changes derived keys", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "start-review-scope-ref-drift-"))
    writeProjectFile(projectRoot, "src/a.ts", "export const a = 1\n")

    const gitMainFeature = (args: string[]) => {
      const command = args.join(" ")
      if (command === "diff main...feature") return "@@ -1,1 +1,1 @@"
      if (command === "diff --name-only main...feature") return "src/a.ts"
      return ""
    }
    const gitReleaseFeature = (args: string[]) => {
      const command = args.join(" ")
      if (command === "diff release...feature") return "@@ -1,1 +1,1 @@"
      if (command === "diff --name-only release...feature") return "src/a.ts"
      return ""
    }

    const targetMain = resolveReviewTarget(
      {
        mode: "plan+git-diff",
        project_root: projectRoot,
        review_scope_key: "bootstrap-main",
        suppression_scope_key: "bootstrap-main",
        base_ref: "main",
        head_ref: "feature",
      },
      { git: gitMainFeature },
    )
    const targetRelease = resolveReviewTarget(
      {
        mode: "plan+git-diff",
        project_root: projectRoot,
        review_scope_key: "bootstrap-release",
        suppression_scope_key: "bootstrap-release",
        base_ref: "release",
        head_ref: "feature",
      },
      { git: gitReleaseFeature },
    )

    const mainKeys = deriveRuntimeScopeKeys({ target: targetMain })
    const releaseKeys = deriveRuntimeScopeKeys({ target: targetRelease })

    expect(mainKeys.review_scope_key).not.toBe(releaseKeys.review_scope_key)
    expect(mainKeys.suppression_scope_key).not.toBe(releaseKeys.suppression_scope_key)

    rmSync(projectRoot, { recursive: true, force: true })
  })
})
