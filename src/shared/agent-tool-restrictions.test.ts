import { describe, expect, test } from "bun:test"
import { getAgentToolRestrictions, hasAgentToolRestrictions } from "./agent-tool-restrictions"

describe("agent-tool-restrictions", () => {
  test("keeps Themis orchestration tools enabled for background sessions", () => {
    const restrictions = getAgentToolRestrictions("themis")

    expect(restrictions["task"]).toBe(true)
    expect(restrictions["call_omo_agent"]).toBe(true)
    expect(restrictions["question"]).toBe(true)
  })

  test("reports Themis as having explicit tool restrictions", () => {
    expect(hasAgentToolRestrictions("themis")).toBe(true)
  })
})
