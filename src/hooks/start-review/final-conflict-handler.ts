import type { PluginInput } from "@opencode-ai/plugin"
import {
  applyPendingFinalConflictDecisions,
  createPendingFinalConflictQuestionBlock,
  findPendingFinalReviewForSession,
  hasPendingFinalReviewQuestion,
} from "./final-conflict-adjudication"
import { createFinalAdjudicationResolvedBlock } from "./bootstrap-text"

export async function resolvePendingFinalConflictContext(input: {
  ctx: PluginInput
  sessionID: string
  promptText: string
  requestedInput: string
  isBootstrapTemplate: boolean
  now: string
}): Promise<string | null> {
  const pendingFinalReview = findPendingFinalReviewForSession(input.ctx.directory, input.sessionID)
  if (!pendingFinalReview) {
    return null
  }

  const resolved = !input.isBootstrapTemplate
    ? applyPendingFinalConflictDecisions({
        workspaceRoot: input.ctx.directory,
        pendingReview: pendingFinalReview,
        answerText: input.requestedInput || input.promptText,
        now: input.now,
      })
    : null

  return resolved
    ? createFinalAdjudicationResolvedBlock({
        review_run_id: resolved.state.review_run_id,
        selected_options: resolved.selected_options,
      })
    : createPendingFinalConflictQuestionBlock({
        pendingReview: pendingFinalReview,
        questionAlreadyPending: await hasPendingFinalReviewQuestion({
          messagesApi: (input.ctx.client as {
            session?: {
              messages?: (input: { path: { id: string }; query?: { directory: string } }) => Promise<unknown>
            }
          }).session?.messages,
          sessionID: input.sessionID,
          workspaceRoot: input.ctx.directory,
        }),
      })
}
