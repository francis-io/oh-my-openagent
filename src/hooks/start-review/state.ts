import type { ReviewMode } from "../../features/review-target-resolution"
import type {
  PendingDirectStartReview,
  PendingRuntimeConfirmationInput,
  StartReviewSessionState,
} from "./types"

function containsPlanSelection(text: string): boolean {
  return /\breview\s+completed\s+plan\b|\bplan\s*\+\s*git\s*-?\s*diff\b|\boption\s*2\b/i.test(text)
}

function containsRepoSelection(text: string): boolean {
  return /\breview\s+full\s+repository\b|\brepo(?:sitory)?-?wide\b|\boption\s*1\b/i.test(text)
}

export function createStartReviewStateStore() {
  const sessions = new Map<string, StartReviewSessionState>()

  function getState(sessionID: string): StartReviewSessionState {
    let state = sessions.get(sessionID)
    if (!state) {
      state = {}
      sessions.set(sessionID, state)
    }
    return state
  }

  function clearPendingRetryTimer(sessionID: string): void {
    const pending = sessions.get(sessionID)?.pendingDirectStart
    if (pending?.pendingRetryTimer) {
      clearTimeout(pending.pendingRetryTimer)
      pending.pendingRetryTimer = undefined
    }
  }

  function clearSession(sessionID: string): void {
    clearPendingRetryTimer(sessionID)
    sessions.delete(sessionID)
  }

  function setPendingConfirmation(sessionID: string, requestedInput: string): void {
    getState(sessionID).pendingConfirmationRequestedInput = requestedInput
  }

  function clearPendingConfirmation(sessionID: string): void {
    const state = sessions.get(sessionID)
    if (!state) {
      return
    }
    delete state.pendingConfirmationRequestedInput
    if (!state.pendingDirectStart && !state.lastEventWasAbortError) {
      sessions.delete(sessionID)
    }
  }

  function resolvePendingConfirmation(input: PendingRuntimeConfirmationInput): ReviewMode | null {
    const pending = sessions.get(input.sessionID)?.pendingConfirmationRequestedInput
    if (!pending) {
      return null
    }

    const merged = `${input.requestedInput}\n${input.promptText}`
    const hasPlan = containsPlanSelection(merged)
    const hasRepo = containsRepoSelection(merged)

    if (hasPlan && hasRepo) {
      return null
    }
    if (hasPlan) {
      return "plan+git-diff"
    }
    if (hasRepo) {
      return "repo-wide"
    }

    return null
  }

  function setPendingDirectStart(sessionID: string, pending: PendingDirectStartReview): void {
    getState(sessionID).pendingDirectStart = pending
  }

  function getPendingDirectStart(sessionID: string): PendingDirectStartReview | undefined {
    return sessions.get(sessionID)?.pendingDirectStart
  }

  function clearPendingDirectStart(sessionID: string): void {
    const state = sessions.get(sessionID)
    if (!state) {
      return
    }
    clearPendingRetryTimer(sessionID)
    delete state.pendingDirectStart
    if (!state.pendingConfirmationRequestedInput && !state.lastEventWasAbortError) {
      sessions.delete(sessionID)
    }
  }

  return {
    sessions,
    getState,
    clearSession,
    clearPendingRetryTimer,
    setPendingConfirmation,
    clearPendingConfirmation,
    resolvePendingConfirmation,
    setPendingDirectStart,
    getPendingDirectStart,
    clearPendingDirectStart,
  }
}

export type StartReviewStateStore = ReturnType<typeof createStartReviewStateStore>
