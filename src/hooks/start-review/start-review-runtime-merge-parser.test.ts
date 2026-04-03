import { describe, expect, test } from "bun:test"
import {
  parseMergeValidationResult,
  parseTieBreakResolutions,
} from "./start-review-runtime-merge-parser"

describe("start-review runtime merge parser", () => {
  test("parses merge validation from fenced JSON with preamble", () => {
    const input = `ULTRAWORK\n\n\
\
\
\

\`\`\`json
{"status":"ok","findings_considered":3,"notes":"validated"}
\`\`\``

    expect(parseMergeValidationResult(input, 1)).toEqual({
      status: "ok",
      findings_considered: 3,
      notes: "validated",
    })
  })

  test("marks non-ok merge validation as invalid", () => {
    expect(parseMergeValidationResult('{"status":"bad","notes":"oops"}', 2)).toEqual({
      status: "invalid",
      findings_considered: 2,
      notes: "oops",
    })
  })

  test("parses tie-break resolutions from markdown-wrapped JSON", () => {
    const input = `Done\n{"resolutions":[{"fingerprint":"f-1","selected_lane":"argus","rationale":"prefer gpt"}]}`
    expect(parseTieBreakResolutions(input)).toEqual([
      { fingerprint: "f-1", selected_lane: "argus", rationale: "prefer gpt" },
    ])
  })

  test("ignores wrong-shaped tie-break entries", () => {
    const input = '{"resolutions":[{"fingerprint":"f-1","selected_lane":"bad"},{"selected_lane":"argus"}]}'
    expect(parseTieBreakResolutions(input)).toEqual([])
  })
})
