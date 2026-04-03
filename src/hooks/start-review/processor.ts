import type { PluginInput } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../../features/background-agent"
import { isAgentRegistered, updateSessionAgent } from "../../features/claude-code-session-state"
import { getAgentDisplayName } from "../../shared/agent-display-names"
import { log } from "../../shared/logger"
import { createAsyncRuntimeBootstrapBlock, createConfirmationBlock, createDirectBootstrapBlock, createDirectStartReviewPreamble, createRuntimeBootstrapBlock } from "./bootstrap-text"
import { isRawStartReviewCommand, isTopLevelThemisSession, looksLikeExplicitReviewRequest } from "./detection"
import { resolvePendingFinalConflictContext } from "./final-conflict-handler"
import { inferStartReviewMode } from "./mode-inference"
import { parseStartReviewUserRequest } from "./parse-user-request"
import { extractRawStartReviewRequest, getCommandExecutionEventID, isCommandExecuteInput, readLatestUserRequestFromSession } from "./request-reader"
import { createStartReviewRunId } from "./start-review-run-id"
import { inferRuntimeReviewProfile } from "./start-review-runtime-profile"
import { startReviewRuntimeFlow } from "./start-review-runtime-flow"
import { createRuntimeShowToast } from "./start-review-runtime-toasts"
import type { StartReviewStateStore } from "./state"
import type { StartReviewCommandExecuteBeforeInput, StartReviewHookInput, StartReviewHookOutput } from "./types"

const START_REVIEW_TEMPLATE_MARKER = "You are bootstrapping a Themis-led review session."

export async function processStartReviewInput(input: {
  ctx: PluginInput
  processedDirectCommands: ReturnType<typeof import("../auto-slash-command/processed-command-store").createProcessedCommandStore>
  stateStore: StartReviewStateStore
  hookInput: StartReviewHookInput | StartReviewCommandExecuteBeforeInput
  output: StartReviewHookOutput
  backgroundManager?: Pick<BackgroundManager, "launch" | "getTask"> & { getTasksByParentSession?: (sessionID: string) => Array<{ status: string }> }
}): Promise<void> {
  const { ctx, processedDirectCommands, stateStore, hookInput, output, backgroundManager } = input
  const promptText = output.parts
    ?.filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n")
    .trim() || ""

  const isAuthoritativeCommandDirectStart =
    isCommandExecuteInput(hookInput)
    && hookInput.command.trim().toLowerCase() === "start-review"
  const isBootstrapTemplate =
    !isAuthoritativeCommandDirectStart
    && promptText.includes("<session-context>")
    && promptText.includes(START_REVIEW_TEMPLATE_MARKER)
  const isPlainThemisTabBootstrap = !isBootstrapTemplate && isTopLevelThemisSession(hookInput)
  const isDirectStartReview = isAuthoritativeCommandDirectStart || (!isBootstrapTemplate && isRawStartReviewCommand(hookInput, promptText))

  log("[start-review] Input classification", {
    sessionID: hookInput.sessionID,
    source: isCommandExecuteInput(hookInput) ? "command.execute.before" : "chat.message",
    isAuthoritativeCommandDirectStart,
    isBootstrapTemplate,
    isPlainThemisTabBootstrap,
    isDirectStartReview,
    promptTextLength: promptText.length,
  })

  if (!isBootstrapTemplate && !isPlainThemisTabBootstrap && !isDirectStartReview) {
    return
  }

  const activeAgent = isAgentRegistered("themis") ? "themis" : "sisyphus"
  updateSessionAgent(hookInput.sessionID, activeAgent)
  if (output.message) {
    output.message.agent = getAgentDisplayName(activeAgent)
  }

  const sessionId = hookInput.sessionID
  const timestamp = new Date().toISOString()
  const parsedRequest = parseStartReviewUserRequest(promptText)
  const requestedInput = parsedRequest
    || (isCommandExecuteInput(hookInput)
      ? hookInput.arguments.trim()
      : isPlainThemisTabBootstrap
        ? await readLatestUserRequestFromSession(ctx, hookInput.sessionID)
        : isDirectStartReview
          ? extractRawStartReviewRequest(promptText)
          : "")

  if (isDirectStartReview) {
    const existingPending = stateStore.getPendingDirectStart(hookInput.sessionID)
    if (!isCommandExecuteInput(hookInput) && existingPending?.authoritativeSource === "command") {
      return
    }

    const commandEventID = isCommandExecuteInput(hookInput) ? getCommandExecutionEventID(hookInput) : null
    const directCommandKey = isCommandExecuteInput(hookInput)
      ? commandEventID ?? `${hookInput.sessionID}:start-review:${hookInput.arguments}`
      : hookInput.messageID
        ? `${hookInput.sessionID}:${hookInput.messageID}:start-review`
        : `${hookInput.sessionID}:start-review:${promptText.trim()}`

    if (processedDirectCommands.has(directCommandKey)) {
      log("[start-review] Skipped duplicate direct start-review", {
        sessionID: hookInput.sessionID,
        directCommandKey,
      })
      return
    }
    processedDirectCommands.add(directCommandKey, commandEventID ? undefined : 100)
    log("[start-review] Registered direct start-review command", {
      sessionID: hookInput.sessionID,
      commandEventID,
      directCommandKey,
    })
  }

  const pendingFinalContext = await resolvePendingFinalConflictContext({
    ctx,
    sessionID: hookInput.sessionID,
    promptText,
    requestedInput,
    isBootstrapTemplate,
    now: timestamp,
  })
  if (pendingFinalContext) {
    const textPartIndex = output.parts.findIndex((part) => part.type === "text" && part.text)
    if (textPartIndex >= 0 && output.parts[textPartIndex].text) {
      output.parts[textPartIndex].text += `\n\n---\n${pendingFinalContext}`
    } else {
      output.parts.unshift({ type: "text", text: pendingFinalContext })
    }
    return
  }

  if (!requestedInput && isPlainThemisTabBootstrap) {
    return
  }

  const confirmedMode = stateStore.resolvePendingConfirmation({
    sessionID: hookInput.sessionID,
    requestedInput,
    promptText,
  })

  if (!isBootstrapTemplate && isPlainThemisTabBootstrap && !confirmedMode && !looksLikeExplicitReviewRequest(requestedInput)) {
    return
  }

  const inference = confirmedMode
    ? {
        ...inferStartReviewMode(requestedInput),
        mode: confirmedMode,
        shouldConfirm: false,
        strength: "high" as const,
        reason: "Resolved prior ambiguous /start-review confirmation into runtime execution.",
      }
      : inferStartReviewMode(requestedInput)

  log("[start-review] Mode inference resolved", {
    sessionID: hookInput.sessionID,
    requestedInput,
    mode: inference.mode,
    strength: inference.strength,
    shouldConfirm: inference.shouldConfirm,
    reason: inference.reason,
    confirmedMode,
  })

  let contextInfo = inference.shouldConfirm
    ? createConfirmationBlock(inference)
    : createDirectBootstrapBlock(inference)

  if (inference.shouldConfirm) {
    stateStore.setPendingConfirmation(hookInput.sessionID, requestedInput)
  } else {
    stateStore.clearPendingConfirmation(hookInput.sessionID)
    if (isDirectStartReview) {
      const authoritativeSource = isCommandExecuteInput(hookInput) ? "command" : "chat"
      const review_run_id = createStartReviewRunId(sessionId, timestamp)
      const profile = inferRuntimeReviewProfile(requestedInput)
      contextInfo += `\n\n${createAsyncRuntimeBootstrapBlock({
        review_run_id,
        profile,
        mode: inference.mode,
      })}`
      stateStore.setPendingDirectStart(hookInput.sessionID, {
        sessionID: hookInput.sessionID,
        requestedInput,
        timestamp,
        review_run_id,
        profile,
        inference,
        authoritativeSource,
        runtimeStarted: false,
        degradedRuntimeStart: false,
        visibleBootstrapInjected: false,
        visibleBootstrapFailedTerminally: false,
        promptFailureCount: 0,
      })
      log("[start-review] Pending direct start-review created", {
        sessionID: hookInput.sessionID,
        review_run_id,
        profile,
        mode: inference.mode,
        authoritativeSource,
      })
    } else {
      const runtime = await startReviewRuntimeFlow({
        workspaceRoot: ctx.directory,
        mode: inference.mode,
        requestedInput,
        sessionID: sessionId,
        planPathHint: inference.plan_path_hint,
        backgroundManager,
        showToast: createRuntimeShowToast(ctx.client.tui),
        now: timestamp,
      })
      contextInfo += `\n\n${createRuntimeBootstrapBlock(runtime)}`
      log("[start-review] Inline runtime bootstrap completed", {
        sessionID: hookInput.sessionID,
        review_run_id: runtime.review_run_id,
        mode: runtime.mode,
        profile: runtime.profile,
        stop_reason: runtime.stop_reason ?? "none",
        final_conflict_count: runtime.final_conflict_count,
      })
    }
  }

  const textPartIndex = output.parts.findIndex((part) => part.type === "text" && part.text)
  if (textPartIndex < 0) {
    output.parts.unshift({
      type: "text",
      text: isDirectStartReview ? createDirectStartReviewPreamble(requestedInput) : contextInfo,
    })
  }

  const resolvedTextPartIndex = output.parts.findIndex((part) => part.type === "text" && part.text)
  if (isDirectStartReview && resolvedTextPartIndex >= 0 && output.parts[resolvedTextPartIndex].text) {
    output.parts[resolvedTextPartIndex].text = createDirectStartReviewPreamble(requestedInput)
  }
  if (resolvedTextPartIndex >= 0 && output.parts[resolvedTextPartIndex].text) {
    output.parts[resolvedTextPartIndex].text = output.parts[resolvedTextPartIndex].text
      .replace(/\$SESSION_ID/g, sessionId)
      .replace(/\$TIMESTAMP/g, timestamp)
    output.parts[resolvedTextPartIndex].text += `\n\n---\n${contextInfo}`
  }

  log("[start-review] Context injected", {
    sessionID: hookInput.sessionID,
    mode: inference.mode,
    strength: inference.strength,
    shouldConfirm: inference.shouldConfirm,
    workspace: ctx.directory,
  })
}
