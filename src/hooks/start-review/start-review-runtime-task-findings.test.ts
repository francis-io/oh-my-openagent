import { describe, expect, test } from "bun:test"
import { parseRuntimeTaskFindings } from "./start-review-runtime-task-findings"

describe("start-review runtime task findings parser", () => {
  test("throws on completely unparseable text", () => {
    expect(() => parseRuntimeTaskFindings("no json here at all")).toThrow()
  })

  test("throws when finding payload fails normalization", () => {
    const payload = JSON.stringify({
      findings: [
        {
          category: "correctness",
          severity: "major",
          confidence: "high",
          title: "missing suppression identity",
          summary: "no evidence means no fingerprint",
          evidence: [{ path: "src/a.ts" }],
          remediation: {},
        },
      ],
    })

    expect(() => parseRuntimeTaskFindings(payload)).toThrow()
  })

  test("treats empty-string fingerprint and suppression identity as absent and regenerates them", () => {
    const payload = JSON.stringify({
      findings: [
        {
          category: "correctness",
          severity: "major",
          confidence: "high",
          title: "blank identities",
          summary: "producer emitted empty identity strings",
          evidence: [{ path: "src/a.ts", start_line: 1, end_line: 2 }],
          remediation: { intent: "add-guard" },
          fingerprint: "",
          suppression_identity: "",
        },
      ],
    })

    const result = parseRuntimeTaskFindings(payload)

    expect(result).toHaveLength(1)
    expect(result[0]?.fingerprint).toBeTruthy()
    expect(result[0]?.suppression_identity).toBeTruthy()
  })

  test("throws when lane output omits findings array", () => {
    expect(() => parseRuntimeTaskFindings('{"status":"ok"}')).toThrow(
      "Runtime lane output must contain a findings array",
    )
  })

  describe("#given markdown-wrapped JSON output", () => {
    test("#then extracts JSON anchored on findings key despite surrounding braces in prose", () => {
      const json = JSON.stringify({ findings: [] })
      const markdown = `Use {name} templates.\n\n${json}\n\nDone {great}!`
      const result = parseRuntimeTaskFindings(markdown)
      expect(result).toEqual([])
    })

    test("#then extracts JSON object from markdown with asterisks", () => {
      const json = JSON.stringify({ findings: [] })
      const markdown = `* Here are the review findings:\n\n${json}\n\n* That's all.`
      const result = parseRuntimeTaskFindings(markdown)
      expect(result).toEqual([])
    })

    test("#then extracts fenced code block without json tag", () => {
      const json = JSON.stringify({ findings: [] })
      const markdown = `Some preamble\n\n\`\`\`\n${json}\n\`\`\`\n\nMore text`
      const result = parseRuntimeTaskFindings(markdown)
      expect(result).toEqual([])
    })

    test("#then extracts fenced json code block", () => {
      const json = JSON.stringify({ findings: [] })
      const markdown = `\`\`\`json\n${json}\n\`\`\``
      const result = parseRuntimeTaskFindings(markdown)
      expect(result).toEqual([])
    })
  })
})
