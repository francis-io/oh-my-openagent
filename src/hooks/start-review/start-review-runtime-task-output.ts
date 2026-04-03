import type { BackgroundTask } from "../../features/background-agent"
import { normalizeSDKResponse } from "../../shared"
import type { RuntimeBackgroundManager } from "./start-review-runtime-types"

type RuntimeTaskMessage = {
  info?: {
    role?: string
    time?: {
      created?: number
    }
  }
  parts?: Array<
    | { type?: "text" | "reasoning"; text?: string }
    | { type?: "tool_result"; content?: string | Array<{ type?: string; text?: string }> }
  >
}

function extractContentFromMessage(message: RuntimeTaskMessage): string {
  return (message.parts ?? [])
    .flatMap((part) => {
      if ((part.type === "text" || part.type === "reasoning") && typeof part.text === "string") {
        return [part.text]
      }

      if (part.type === "tool_result") {
        if (typeof part.content === "string") {
          return [part.content]
        }

        if (Array.isArray(part.content)) {
          return part.content
            .filter((block) => typeof block?.text === "string")
            .map((block) => block.text as string)
        }
      }

      return []
    })
    .filter((text) => text.trim().length > 0)
    .join("\n")
}

export async function resolveRuntimeTaskResultText(
  manager: RuntimeBackgroundManager,
  task: BackgroundTask,
): Promise<string | undefined> {
  if (typeof task.result === "string") {
    return task.result
  }

  if (!task.sessionID || typeof manager.getSessionMessages !== "function") {
    return undefined
  }

  const messagesResult = await manager.getSessionMessages(task.sessionID)
  const messages = normalizeSDKResponse(messagesResult, [] as RuntimeTaskMessage[], {
    preferResponseOnMissingData: true,
  })

  const assistantMessages = messages
    .filter((message) => message.info?.role === "assistant")
    .sort((left, right) => (right.info?.time?.created ?? 0) - (left.info?.time?.created ?? 0))

  for (const message of assistantMessages) {
    const text = extractContentFromMessage(message)
    if (text) {
      return text
    }
  }

  const toolMessages = messages
    .filter((message) => message.info?.role === "tool")
    .sort((left, right) => (right.info?.time?.created ?? 0) - (left.info?.time?.created ?? 0))

  for (const message of toolMessages) {
    const text = extractContentFromMessage(message)
    if (text) {
      return text
    }
  }

  return undefined
}
