import type { PluginInput } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../../features/background-agent"
import { getAgentDisplayName } from "../../shared/agent-display-names"
import { log } from "../../shared/logger"
import { isAgentRegistered, subagentSessions } from "../../features/claude-code-session-state"
import { startReviewRuntimeFlow } from "./start-review-runtime-flow"
import { createRuntimeShowToast } from "./start-review-runtime-toasts"
import { createDirectStartReviewStatusMessage, createDirectStartReviewVisiblePrompt } from "./bootstrap-text"
import { injectDirectStartReviewStatus } from "./prompt-injector"
import type { StartReviewStateStore } from "./state"

const CONTINUATION_COOLDOWN_MS = 5000
const FAILURE_BACKOFF_MS = 5 * 60 * 1000
const MAX_CONSECUTIVE_PROMPT_FAILURES = 10
const RETRY_DELAY_MS = CONTINUATION_COOLDOWN_MS + 1000

function hasRunningBackgroundTasks(
  sessionID: string,
  backgroundManager?: Pick<BackgroundManager, "getTask"> & { getTasksByParentSession?: (sessionID: string) => Array<{ status: string }> },
): boolean {
  if (!backgroundManager || typeof backgroundManager.getTasksByParentSession !== "function") {
    return false
  }
  return backgroundManager.getTasksByParentSession(sessionID).some((task) => task.status === "running")
}

function markRuntimeStartedDegraded(stateStore: StartReviewStateStore, sessionID: string): void {
  const pending = stateStore.getPendingDirectStart(sessionID)
  if (!pending) {
    return
  }
  pending.degradedRuntimeStart = true
  pending.visibleBootstrapFailedTerminally = true
}

function scheduleRetry(input: {
  ctx: PluginInput
  sessionID: string
  stateStore: StartReviewStateStore
  backgroundManager?: Pick<BackgroundManager, "launch" | "getTask"> & { getTasksByParentSession?: (sessionID: string) => Array<{ status: string }> }
}): void {
  const pending = input.stateStore.getPendingDirectStart(input.sessionID)
  if (!pending || pending.pendingRetryTimer || pending.runtimeStarted) {
    return
  }

  pending.pendingRetryTimer = setTimeout(() => {
    const current = input.stateStore.getPendingDirectStart(input.sessionID)
    if (current) {
      current.pendingRetryTimer = undefined
    }
    log("[start-review] Retry timer fired", {
      sessionID: input.sessionID,
      review_run_id: current?.review_run_id,
    })
    void handleStartReviewSessionIdle(input)
  }, RETRY_DELAY_MS)

  log("[start-review] Retry scheduled", {
    sessionID: input.sessionID,
    review_run_id: pending.review_run_id,
    retryDelayMs: RETRY_DELAY_MS,
    promptFailureCount: pending.promptFailureCount,
  })
}

function launchRuntime(input: {
  ctx: PluginInput
  sessionID: string
  stateStore: StartReviewStateStore
  backgroundManager?: Pick<BackgroundManager, "launch" | "getTask">
}): void {
  const pending = input.stateStore.getPendingDirectStart(input.sessionID)
  if (!pending || pending.runtimeStarted) {
    return
  }

  pending.runtimeStarted = true

  queueMicrotask(() => {
    log("[start-review] Launching review runtime", {
      sessionID: input.sessionID,
      review_run_id: pending.review_run_id,
      mode: pending.inference.mode,
      degradedRuntimeStart: pending.degradedRuntimeStart,
    })
    void startReviewRuntimeFlow({
      workspaceRoot: input.ctx.directory,
      mode: pending.inference.mode,
      requestedInput: pending.requestedInput,
      sessionID: input.sessionID,
      planPathHint: pending.inference.plan_path_hint,
      backgroundManager: input.backgroundManager,
      showToast: createRuntimeShowToast(input.ctx.client.tui),
      now: pending.timestamp,
    }).then((runtime) => {
      log("[start-review] Async runtime completed", {
        sessionID: input.sessionID,
        review_run_id: runtime.review_run_id,
        mode: runtime.mode,
        profile: runtime.profile,
      })
    }).catch((error) => {
      log("[start-review] Async runtime failed", {
        sessionID: input.sessionID,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  })

  input.stateStore.clearPendingDirectStart(input.sessionID)
  log("[start-review] Pending direct start cleared after runtime launch scheduling", {
    sessionID: input.sessionID,
    review_run_id: pending.review_run_id,
  })
}

export async function handleStartReviewSessionIdle(input: {
  ctx: PluginInput
  sessionID: string
  stateStore: StartReviewStateStore
  backgroundManager?: Pick<BackgroundManager, "launch" | "getTask"> & { getTasksByParentSession?: (sessionID: string) => Array<{ status: string }> }
}): Promise<void> {
  const pending = input.stateStore.getPendingDirectStart(input.sessionID)
  if (!pending) {
    log("[start-review] Idle received with no pending direct start", {
      sessionID: input.sessionID,
    })
    return
  }

  log("[start-review] Idle received for pending direct start", {
    sessionID: input.sessionID,
    review_run_id: pending.review_run_id,
    runtimeStarted: pending.runtimeStarted,
    degradedRuntimeStart: pending.degradedRuntimeStart,
    visibleBootstrapInjected: pending.visibleBootstrapInjected,
    visibleBootstrapFailedTerminally: pending.visibleBootstrapFailedTerminally,
    promptFailureCount: pending.promptFailureCount,
  })

  if (subagentSessions.has(input.sessionID)) {
    log("[start-review] Idle skipped: subagent session", { sessionID: input.sessionID })
    return
  }

  if (pending.visibleBootstrapInjected || pending.visibleBootstrapFailedTerminally || pending.runtimeStarted) {
    log("[start-review] Idle skipped: pending state already terminal", {
      sessionID: input.sessionID,
      review_run_id: pending.review_run_id,
      runtimeStarted: pending.runtimeStarted,
      visibleBootstrapInjected: pending.visibleBootstrapInjected,
      visibleBootstrapFailedTerminally: pending.visibleBootstrapFailedTerminally,
    })
    return
  }

  if (hasRunningBackgroundTasks(input.sessionID, input.backgroundManager)) {
    log("[start-review] Skipped idle bootstrap: background tasks running", { sessionID: input.sessionID })
    return
  }

  const sessionState = input.stateStore.getState(input.sessionID)
  if (sessionState.lastEventWasAbortError) {
    sessionState.lastEventWasAbortError = false
    log("[start-review] Skipped idle bootstrap: abort error immediately before idle", { sessionID: input.sessionID })
    return
  }

  const now = Date.now()
  if (pending.promptFailureCount >= MAX_CONSECUTIVE_PROMPT_FAILURES) {
    const timeSinceLastFailure = pending.lastFailureAt !== undefined
      ? now - pending.lastFailureAt
      : Number.POSITIVE_INFINITY

    if (timeSinceLastFailure < FAILURE_BACKOFF_MS) {
      markRuntimeStartedDegraded(input.stateStore, input.sessionID)
      launchRuntime(input)
      log("[start-review] Starting runtime in degraded mode after retry exhaustion", {
        sessionID: input.sessionID,
        backoffRemaining: FAILURE_BACKOFF_MS - timeSinceLastFailure,
      })
      return
    }

    pending.promptFailureCount = 0
    pending.lastFailureAt = undefined
  }

  if (pending.lastBootstrapInjectedAt && now - pending.lastBootstrapInjectedAt < CONTINUATION_COOLDOWN_MS) {
    scheduleRetry(input)
    log("[start-review] Skipped idle bootstrap: cooldown active", {
      sessionID: input.sessionID,
      cooldownRemaining: CONTINUATION_COOLDOWN_MS - (now - pending.lastBootstrapInjectedAt),
    })
    return
  }

  pending.lastInjectionAttemptAt = now
  const activeAgent = isAgentRegistered("themis") ? "themis" : "sisyphus"
  const notification = createDirectStartReviewStatusMessage({
    review_run_id: pending.review_run_id,
    profile: pending.profile,
    mode: pending.inference.mode,
  })

  const injected = await injectDirectStartReviewStatus({
    ctx: input.ctx,
    sessionID: input.sessionID,
    agentName: getAgentDisplayName(activeAgent),
    notification: createDirectStartReviewVisiblePrompt({
      requestedInput: pending.requestedInput,
      notification,
    }),
  })

  if (injected.status === "injected") {
    pending.visibleBootstrapInjected = true
    pending.lastBootstrapInjectedAt = now
    pending.promptFailureCount = 0
    pending.lastFailureAt = undefined
    launchRuntime(input)
    log("[start-review] Visible bootstrap injected successfully", {
      sessionID: input.sessionID,
      review_run_id: pending.review_run_id,
    })
    return
  }

  if (injected.status === "retryable_failure") {
    pending.promptFailureCount += 1
    pending.lastFailureAt = now
    scheduleRetry(input)
    log("[start-review] Idle bootstrap retryable failure", {
      sessionID: input.sessionID,
      reason: injected.reason,
      promptFailureCount: pending.promptFailureCount,
    })
    return
  }

  pending.visibleBootstrapFailedTerminally = true
  markRuntimeStartedDegraded(input.stateStore, input.sessionID)
  launchRuntime(input)
  log("[start-review] Idle bootstrap terminal failure; starting runtime degraded", {
    sessionID: input.sessionID,
    reason: injected.reason,
  })
}
