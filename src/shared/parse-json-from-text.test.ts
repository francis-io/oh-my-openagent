import { describe, expect, test } from "bun:test"
import { parseJsonFromText } from "./parse-json-from-text"

describe("parseJsonFromText", () => {
  test("parses direct object JSON", () => {
    expect(parseJsonFromText('{"status":"ok"}')).toEqual({ status: "ok" })
  })

  test("parses fenced JSON block", () => {
    expect(parseJsonFromText('```json\n{"findings":[]}\n```')).toEqual({ findings: [] })
  })

  test("parses arrays with surrounding prose", () => {
    expect(parseJsonFromText('before\n[1,2,3]\nafter')).toEqual([1, 2, 3])
  })

  test("parses anchored findings object with brace noise", () => {
    expect(parseJsonFromText('Use {x} template\n{"findings":[]}\nDone {y}')).toEqual({ findings: [] })
  })

  test("parses pretty JSON with prose wrapping", () => {
    expect(parseJsonFromText('Preamble\n{\n  "status": "ok",\n  "notes": "wrapped"\n}\nDone')).toEqual({
      status: "ok",
      notes: "wrapped",
    })
  })

  test("ignores braces inside JSON string values", () => {
    expect(parseJsonFromText('Before\n{"notes":"value with {braces}","status":"ok"}\nAfter')).toEqual({
      notes: "value with {braces}",
      status: "ok",
    })
  })

  test("parses indented fenced json amidst brace noise", () => {
    expect(parseJsonFromText('prefix {ignore}\n```json\n{\n  "resolutions": []\n}\n```\nsuffix')).toEqual({
      resolutions: [],
    })
  })

  test("throws on invalid text", () => {
    expect(() => parseJsonFromText("not json")).toThrow()
  })
})
