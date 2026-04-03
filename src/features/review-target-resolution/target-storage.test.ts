import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createReviewTargetTempPath,
  readMaterializedReviewTarget,
  resolveReviewTarget,
  writeMaterializedReviewTargetAtomic,
} from "./index"

const tempDirs: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "omo-review-target-storage-"))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe("review-target-storage", () => {
  test("scope and batch metadata persists to deterministic target.json", () => {
    //#given
    const projectRoot = createTempDir()
    const targetPath = join(projectRoot, ".sisyphus/reviews/run-1/target.json")
    const target = resolveReviewTarget({
      mode: "repo-wide",
      project_root: projectRoot,
      review_scope_key: "scope-a",
      suppression_scope_key: "suppression-a",
      now: "2026-04-01T00:00:00.000Z",
    })

    //#when
    writeMaterializedReviewTargetAtomic(targetPath, target)
    const reloaded = readMaterializedReviewTarget(targetPath)
    const firstRaw = readFileSync(targetPath, "utf-8")
    writeMaterializedReviewTargetAtomic(targetPath, target)
    const secondRaw = readFileSync(targetPath, "utf-8")

    //#then
    expect(reloaded?.scope.default_exclusions.length).toBeGreaterThan(0)
    expect(reloaded?.ref_identity).toEqual({ base_ref: null, head_ref: null })
    expect(reloaded?.batches).toEqual(target.batches)
    expect(firstRaw).toBe(secondRaw)
  })

  test("temp file naming stays unique within the same millisecond", () => {
    //#given
    const targetPath = "/tmp/target.json"
    const originalNow = Date.now
    Date.now = () => 1_712_345_678_901

    try {
      //#when
      const first = createReviewTargetTempPath(targetPath)
      const second = createReviewTargetTempPath(targetPath)

      //#then
      expect(first).not.toBe(second)
      expect(first.startsWith(`${targetPath}.tmp.1712345678901.`)).toBe(true)
      expect(second.startsWith(`${targetPath}.tmp.1712345678901.`)).toBe(true)
    } finally {
      Date.now = originalNow
    }
  })
})
