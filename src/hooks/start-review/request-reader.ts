import type { PluginInput } from "@opencode-ai/plugin"
import { normalizeSDKResponse } from "../../shared"
import type { SessionMessage, StartReviewCommandExecuteBeforeInput, StartReviewHookInput } from "./types"

export function extractMessageText(message: SessionMessage | undefined): string {
  return (message?.parts ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
}

export function findLastUserMessage(messages: SessionMessage[]): SessionMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.info?.role !== "user") {
      continue
    }
    if (!extractMessageText(message)) {
      continue
    }
    return message
  }

  return undefined
}

export async function readLatestUserRequestFromSession(ctx: PluginInput, sessionID: string): Promise<string> {
  const messagesApi = (ctx.client as {
    session?: {
      messages?: (input: { path: { id: string }; query?: { directory: string } }) => Promise<unknown>
    }
  }).session?.messages

  if (typeof messagesApi !== "function") {
    return ""
  }

  try {
    const response = await messagesApi({
      path: { id: sessionID },
      query: { directory: ctx.directory },
    })
    const messages = normalizeSDKResponse(response, [] as SessionMessage[], {
      preferResponseOnMissingData: true,
    })

    if (!Array.isArray(messages)) {
      return ""
    }

    return extractMessageText(findLastUserMessage(messages)).trim()
  } catch {
    return ""
  }
}

export function extractRawStartReviewRequest(promptText: string): string {
  const match = promptText.trim().match(/^\/start-review\b([\s\S]*)$/i)
  if (!match) {
    return ""
  }

  return match[1]?.trim() ?? ""
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function getCommandExecutionEventID(input: StartReviewCommandExecuteBeforeInput): string | null {
  const candidateKeys = [
    "messageID",
    "messageId",
    "eventID",
    "eventId",
    "invocationID",
    "invocationId",
    "commandID",
    "commandId",
  ]

  const recordInput = input as unknown
  if (!isRecord(recordInput)) {
    return null
  }

  for (const key of candidateKeys) {
    const value = recordInput[key]
    if (typeof value === "string" && value.length > 0) {
      return value
    }
  }

  return null
}

export function isCommandExecuteInput(
  input: StartReviewHookInput | StartReviewCommandExecuteBeforeInput,
): input is StartReviewCommandExecuteBeforeInput {
  return "command" in input
}
