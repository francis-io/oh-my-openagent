declare const require: (name: string) => any
const { describe, expect, test } = require("bun:test")
import { resolveReviewPassCap } from "./pass-cap"

describe("resolveReviewPassCap", () => {
  test("uses six passes for the test profile by default", () => {
    expect(resolveReviewPassCap("test")).toBe(6)
  })

  test("continues to use ten passes for the production profile by default", () => {
    expect(resolveReviewPassCap("production")).toBe(10)
  })

  test("prefers explicit overrides over profile defaults", () => {
    expect(resolveReviewPassCap("test", 4)).toBe(4)
  })
})
