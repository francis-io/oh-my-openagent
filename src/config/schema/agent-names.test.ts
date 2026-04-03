import { describe, expect, test } from "bun:test"
import {
  BUILTIN_AGENT_IDENTITY_METADATA,
  BuiltinAgentNameSchema,
  OverridableAgentNameSchema,
} from "./agent-names"

describe("BuiltinAgentNameSchema", () => {
  test("accepts themis and argus", () => {
    expect(BuiltinAgentNameSchema.safeParse("themis").success).toBe(true)
    expect(BuiltinAgentNameSchema.safeParse("argus").success).toBe(true)
  })
})

describe("OverridableAgentNameSchema", () => {
  test("accepts themis and argus override keys", () => {
    expect(OverridableAgentNameSchema.safeParse("themis").success).toBe(true)
    expect(OverridableAgentNameSchema.safeParse("argus").success).toBe(true)
  })
})

describe("BUILTIN_AGENT_IDENTITY_METADATA", () => {
  test("contains canonical colors for themis and argus", () => {
    expect(BUILTIN_AGENT_IDENTITY_METADATA.themis.color).toBe("#4C1D95")
    expect(BUILTIN_AGENT_IDENTITY_METADATA.argus.color).toBe("#1E40AF")
  })
})
