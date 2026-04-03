import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { LoadedSkill } from "../../features/opencode-skill-loader"
import { executeSlashCommand } from "./executor"

const ENV_KEYS = ["CLAUDE_CONFIG_DIR"] as const
type EnvKey = (typeof ENV_KEYS)[number]
type EnvSnapshot = Record<EnvKey, string | undefined>

function createRestrictedSkill(): LoadedSkill {
  return {
    name: "restricted-skill",
    definition: {
      name: "restricted-skill",
      description: "restricted",
      template: "restricted template",
      agent: "hephaestus",
    },
    scope: "user",
  }
}

describe("executeSlashCommand resolution semantics", () => {
  let tempDir = ""
  let envSnapshot: EnvSnapshot

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "omo-executor-resolution-test-"))
    envSnapshot = { CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR }
    process.env.CLAUDE_CONFIG_DIR = join(tempDir, "claude-config")
    mkdirSync(join(process.env.CLAUDE_CONFIG_DIR, "commands"), { recursive: true })
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = envSnapshot[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    rmSync(tempDir, { recursive: true, force: true })
  })

  it("returns project command when project and user names collide", async () => {
    const projectDir = join(tempDir, "project")
    mkdirSync(join(projectDir, ".claude", "commands"), { recursive: true })
    writeFileSync(
      join(projectDir, ".claude", "commands", "shadowed.md"),
      "---\ndescription: project\n---\nproject template\n",
    )
    writeFileSync(
      join(process.env.CLAUDE_CONFIG_DIR!, "commands", "shadowed.md"),
      "---\ndescription: user\n---\nuser template\n",
    )

    const result = await executeSlashCommand(
      { command: "shadowed", args: "", raw: "/shadowed" },
      { skills: [], directory: projectDir },
    )

    expect(result.success).toBe(true)
    expect(result.replacementText).toContain("**Scope**: project")
    expect(result.replacementText).toContain("project template")
    expect(result.replacementText).not.toContain("user template")
  })

  it("blocks slash skill invocation when invoking agent is missing", async () => {
    const result = await executeSlashCommand(
      { command: "restricted-skill", args: "", raw: "/restricted-skill" },
      { skills: [createRestrictedSkill()] },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Skill "restricted-skill" is restricted to agent "hephaestus"')
  })

  it("allows slash skill invocation when invoking agent matches restriction", async () => {
    const result = await executeSlashCommand(
      { command: "restricted-skill", args: "", raw: "/restricted-skill" },
      { skills: [createRestrictedSkill()], agent: "hephaestus" },
    )

    expect(result.success).toBe(true)
    expect(result.replacementText).toContain("restricted template")
  })
})
