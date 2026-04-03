import type { PluginInput } from "@opencode-ai/plugin"
import { log } from "../../shared/logger"
import { injectTopLevelPrompt } from "../shared/top-level-prompt-injector"

export type StartReviewStatusInjectionResult =
  | { status: "injected" }
  | { status: "retryable_failure"; reason: string }
  | { status: "terminal_failure"; reason: string }

export async function injectDirectStartReviewStatus(input: {
  ctx: PluginInput
  sessionID: string
  agentName: string
  notification: string
}): Promise<StartReviewStatusInjectionResult> {
  const result = await injectTopLevelPrompt({
    ctx: input.ctx,
    sessionID: input.sessionID,
    agentName: input.agentName,
    prompt: input.notification,
  })

  if (result.status === "injected") {
    return { status: "injected" }
  }

  if (result.status === "retryable_failure") {
    log("[start-review] direct status injection retryable failure", {
      sessionID: input.sessionID,
      reason: result.reason,
    })
    return result
  }

  log("[start-review] direct status injection terminal failure", {
    sessionID: input.sessionID,
    reason: result.reason,
  })
  return result
}
