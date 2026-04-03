import type { PluginInput } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../../features/background-agent"
import { createProcessedCommandStore } from "../auto-slash-command/processed-command-store"
import { createStartReviewEventHandler } from "./event-handler"
import { processStartReviewInput } from "./processor"
import { createStartReviewStateStore } from "./state"
import type { StartReviewCommandExecuteBeforeInput, StartReviewHookInput, StartReviewHookOutput } from "./types"

export const HOOK_NAME = "start-review" as const
export function createStartReviewHook(
  ctx: PluginInput,
  deps?: { backgroundManager: Pick<BackgroundManager, "launch" | "getTask"> & { getTasksByParentSession?: (sessionID: string) => Array<{ status: string }> } },
) {
  const processedDirectCommands = createProcessedCommandStore()
  const stateStore = createStartReviewStateStore()
  const eventHandler = createStartReviewEventHandler({
    ctx,
    stateStore,
    backgroundManager: deps?.backgroundManager,
  })

  return {
    "chat.message": async (input: StartReviewHookInput, output: StartReviewHookOutput): Promise<void> => {
      await processStartReviewInput({
        ctx,
        processedDirectCommands,
        stateStore,
        hookInput: input,
        output,
        backgroundManager: deps?.backgroundManager,
      })
    },
    "command.execute.before": async (
      input: StartReviewCommandExecuteBeforeInput,
      output: StartReviewHookOutput,
    ): Promise<void> => {
      await processStartReviewInput({
        ctx,
        processedDirectCommands,
        stateStore,
        hookInput: input,
        output,
        backgroundManager: deps?.backgroundManager,
      })
    },
    event: eventHandler,
  }
}
