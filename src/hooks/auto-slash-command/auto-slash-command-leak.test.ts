import { describe, expect, it, spyOn } from "bun:test"
import type { LoadedSkill } from "../../features/opencode-skill-loader"
import { AUTO_SLASH_COMMAND_TAG_OPEN } from "./constants"
import { createAutoSlashCommandHook } from "./hook"
import type { AutoSlashCommandHookInput, AutoSlashCommandHookOutput, CommandExecuteBeforeInput, CommandExecuteBeforeOutput } from "./types"

function createSkill(name: string): LoadedSkill {
  return {
    name,
    definition: {
      name,
      description: `${name} description`,
      template: `${name} template`,
    },
    scope: "user",
  }
}

function createChatInput(sessionID: string, messageID: string): AutoSlashCommandHookInput {
  return { sessionID, messageID }
}

function createChatOutput(text: string): AutoSlashCommandHookOutput {
  return { message: {}, parts: [{ type: "text", text }] }
}

function createCommandInput(sessionID: string, command: string): CommandExecuteBeforeInput {
  return { sessionID, command, arguments: "" }
}

function createCommandOutput(text: string): CommandExecuteBeforeOutput {
  return { parts: [{ type: "text", text }] }
}

describe("createAutoSlashCommandHook leak prevention", () => {
  it("suppresses fallback duplicate command.execute.before invocations within dedup window", async () => {
    const nowSpy = spyOn(Date, "now")
    try {
      const hook = createAutoSlashCommandHook({ skills: [createSkill("leak-test-command")] })
      const input = createCommandInput("session-dedup", "leak-test-command")
      const firstOutput = createCommandOutput("first")
      const secondOutput = createCommandOutput("second")

      nowSpy.mockReturnValue(0)
      await hook["command.execute.before"](input, firstOutput)
      nowSpy.mockReturnValue(99)
      await hook["command.execute.before"](input, secondOutput)

      expect(firstOutput.parts[0].text).toContain(AUTO_SLASH_COMMAND_TAG_OPEN)
      expect(secondOutput.parts[0].text).toBe("second")
    } finally {
      nowSpy.mockRestore()
    }
  })

  it("allows intentional fallback rerun after dedup window", async () => {
    const nowSpy = spyOn(Date, "now")
    try {
      const hook = createAutoSlashCommandHook({ skills: [createSkill("leak-test-command")] })
      const input = createCommandInput("session-dedup", "leak-test-command")
      const firstOutput = createCommandOutput("first")
      const secondOutput = createCommandOutput("second")

      nowSpy.mockReturnValue(0)
      await hook["command.execute.before"](input, firstOutput)
      nowSpy.mockReturnValue(101)
      await hook["command.execute.before"](input, secondOutput)

      expect(firstOutput.parts[0].text).toContain(AUTO_SLASH_COMMAND_TAG_OPEN)
      expect(secondOutput.parts[0].text).toContain(AUTO_SLASH_COMMAND_TAG_OPEN)
    } finally {
      nowSpy.mockRestore()
    }
  })

  it("deduplicates command.execute.before by stable event id", async () => {
    const hook = createAutoSlashCommandHook({ skills: [createSkill("event-command")] })
    const input: CommandExecuteBeforeInput = {
      ...createCommandInput("session-event", "event-command"),
      eventID: "evt-1",
    }
    const firstOutput = createCommandOutput("first")
    const secondOutput = createCommandOutput("second")

    await hook["command.execute.before"](input, firstOutput)
    await hook["command.execute.before"](input, secondOutput)

    expect(firstOutput.parts[0].text).toContain(AUTO_SLASH_COMMAND_TAG_OPEN)
    expect(secondOutput.parts[0].text).toBe("second")
  })

  it("leaves start-review command.execute.before untouched for direct hook handoff", async () => {
    const hook = createAutoSlashCommandHook({ skills: [createSkill("start-review")] })
    const output = createCommandOutput("before")

    await hook["command.execute.before"](
      { ...createCommandInput("session-start-review", "start-review"), arguments: "review full repository" },
      output,
    )

    expect(output.parts[0].text).toBe("before")
  })

  it("dispose clears per-session processed command stores", async () => {
    const hook = createAutoSlashCommandHook({ skills: [createSkill("leak-chat"), createSkill("leak-command")] })
    await hook["chat.message"](
      createChatInput("session-chat", "message-chat"),
      createChatOutput("/leak-chat"),
    )
    await hook["command.execute.before"](
      createCommandInput("session-command", "leak-command"),
      createCommandOutput("before"),
    )

    hook.dispose()

    const chatOutputAfterDispose = createChatOutput("/leak-chat")
    const commandOutputAfterDispose = createCommandOutput("after")
    await hook["chat.message"](
      createChatInput("session-chat", "message-chat"),
      chatOutputAfterDispose,
    )
    await hook["command.execute.before"](
      createCommandInput("session-command", "leak-command"),
      commandOutputAfterDispose,
    )

    expect(chatOutputAfterDispose.parts[0].text).toContain(AUTO_SLASH_COMMAND_TAG_OPEN)
    expect(commandOutputAfterDispose.parts[0].text).toContain(AUTO_SLASH_COMMAND_TAG_OPEN)
  })
})
