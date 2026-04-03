import type { ReviewMode } from "../../features/review-target-resolution"
import type { ReviewProfileName } from "../../shared/model-requirements"
import type { StartReviewModeInference } from "./mode-inference"

export type StartReviewHookInput = {
  sessionID: string
  agent?: string
  messageID?: string
}

export type StartReviewCommandExecuteBeforeInput = {
  sessionID: string
  command: string
  arguments: string
  messageID?: string
  messageId?: string
  eventID?: string
  eventId?: string
  invocationID?: string
  invocationId?: string
  commandID?: string
  commandId?: string
}

export type StartReviewHookOutput = {
  message?: Record<string, unknown>
  parts: Array<{ type: string; text?: string }>
}

export type SessionMessagePart = { type?: string; text?: string }

export type SessionMessage = {
  info?: { role?: string }
  parts?: SessionMessagePart[]
}

export type DirectStartAuthority = "command" | "chat"

export type PendingDirectStartReview = {
  sessionID: string
  requestedInput: string
  timestamp: string
  review_run_id: string
  profile: ReviewProfileName
  inference: StartReviewModeInference
  authoritativeSource: DirectStartAuthority
  runtimeStarted: boolean
  degradedRuntimeStart: boolean
  visibleBootstrapInjected: boolean
  visibleBootstrapFailedTerminally: boolean
  promptFailureCount: number
  lastFailureAt?: number
  lastInjectionAttemptAt?: number
  lastBootstrapInjectedAt?: number
  pendingRetryTimer?: ReturnType<typeof setTimeout>
}

export type StartReviewSessionState = {
  lastEventWasAbortError?: boolean
  pendingConfirmationRequestedInput?: string
  pendingDirectStart?: PendingDirectStartReview
}

export type PendingRuntimeConfirmationInput = {
  sessionID: string
  requestedInput: string
  promptText: string
}

export type PendingRuntimeConfirmationResolver = (input: PendingRuntimeConfirmationInput) => ReviewMode | null
