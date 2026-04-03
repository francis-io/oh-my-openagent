/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { parseStartReviewUserRequest } from "./parse-user-request"

describe("parseStartReviewUserRequest", () => {
  test("returns empty string when user-request tag is missing", () => {
    expect(parseStartReviewUserRequest("hello world")).toBe("")
  })

  test("extracts user-request content", () => {
    const prompt = `<session-context>foo</session-context>\n<user-request>.sisyphus/plans/a.md</user-request>`
    expect(parseStartReviewUserRequest(prompt)).toBe(".sisyphus/plans/a.md")
  })
})
