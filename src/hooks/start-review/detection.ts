import { getSessionAgent, subagentSessions } from "../../features/claude-code-session-state"
import { isCommandExecuteInput } from "./request-reader"
import type { StartReviewCommandExecuteBeforeInput, StartReviewHookInput } from "./types"

export function isTopLevelThemisSession(input: StartReviewHookInput | StartReviewCommandExecuteBeforeInput): boolean {
  if (isCommandExecuteInput(input)) {
    return false
  }

  if (subagentSessions.has(input.sessionID)) {
    return false
  }

  const agent = (input.agent ?? getSessionAgent(input.sessionID) ?? "").trim().toLowerCase()
  return agent === "themis"
}

export function looksLikeExplicitReviewRequest(requestedInput: string): boolean {
  const normalized = requestedInput.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  if (normalized === ".") {
    return true
  }

  return /\breview\b|\brepository\b|\brepo\b|\bcodebase\b|\.sisyphus\/plans\/|\.md\b/.test(normalized)
}

export function isRawStartReviewCommand(
  input: StartReviewHookInput | StartReviewCommandExecuteBeforeInput,
  promptText: string,
): boolean {
  if (isCommandExecuteInput(input)) {
    return input.command.trim().toLowerCase() === "start-review"
  }

  return /^\/start-review\b/i.test(promptText.trim())
}
