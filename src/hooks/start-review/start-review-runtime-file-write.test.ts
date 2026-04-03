import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeJsonFileAtomic, writeTextFileAtomic } from "./start-review-runtime-file-write"

describe("start-review runtime file write", () => {
  test("writes text atomically", () => {
    const root = mkdtempSync(join(tmpdir(), "review-runtime-file-write-"))
    const path = join(root, "nested", "artifact.md")

    writeTextFileAtomic(path, "hello")

    expect(readFileSync(path, "utf-8")).toBe("hello")
    expect(existsSync(`${path}.tmp`)).toBe(false)

    rmSync(root, { recursive: true, force: true })
  })

  test("overwrites json atomically", () => {
    const root = mkdtempSync(join(tmpdir(), "review-runtime-json-write-"))
    const path = join(root, "artifact.json")
    writeFileSync(path, '{"old":true}\n', "utf-8")

    writeJsonFileAtomic(path, { next: true })

    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({ next: true })

    rmSync(root, { recursive: true, force: true })
  })
})
