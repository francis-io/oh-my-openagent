import type { PluginInput } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../../features/background-agent"
import { log } from "../../shared/logger"
import { isAbortError } from "../atlas/is-abort-error"
import { handleStartReviewSessionIdle } from "./idle-event"
import type { StartReviewStateStore } from "./state"

export function createStartReviewEventHandler(input: {
  ctx: PluginInput
  stateStore: StartReviewStateStore
  backgroundManager?: Pick<BackgroundManager, "launch" | "getTask"> & { getTasksByParentSession?: (sessionID: string) => Array<{ status: string }> }
}): (arg: { event: { type: string; properties?: unknown } }) => Promise<void> {
  const { ctx, stateStore, backgroundManager } = input

  return async ({ event }): Promise<void> => {
    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.error") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      const state = stateStore.getState(sessionID)
      state.lastEventWasAbortError = isAbortError(props?.error)
      log("[start-review] session.error", { sessionID, isAbort: state.lastEventWasAbortError })
      return
    }

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return
      await handleStartReviewSessionIdle({ ctx, sessionID, stateStore, backgroundManager })
      return
    }

    if (event.type === "message.updated") {
      const info = props?.info as Record<string, unknown> | undefined
      const sessionID = info?.sessionID as string | undefined
      if (!sessionID) return
      const state = stateStore.sessions.get(sessionID)
      if (!state) return
      state.lastEventWasAbortError = false
      return
    }

    if (event.type === "message.part.updated") {
      const info = props?.info as Record<string, unknown> | undefined
      const sessionID = info?.sessionID as string | undefined
      if (!sessionID) return
      const state = stateStore.sessions.get(sessionID)
      if (!state) return
      state.lastEventWasAbortError = false
      return
    }

    if (event.type === "tool.execute.before" || event.type === "tool.execute.after") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return
      const state = stateStore.sessions.get(sessionID)
      if (!state) return
      state.lastEventWasAbortError = false
      return
    }

    if (event.type === "session.deleted") {
      const sessionID = (props?.info as { id?: string } | undefined)?.id
      if (sessionID) {
        stateStore.clearSession(sessionID)
        log("[start-review] Session deleted: cleaned up", { sessionID })
      }
      return
    }

    if (event.type === "session.compacted") {
      const sessionID = (props?.sessionID ?? (props?.info as { id?: string } | undefined)?.id) as string | undefined
      if (sessionID) {
        stateStore.clearSession(sessionID)
        log("[start-review] Session compacted: cleaned up", { sessionID })
      }
    }
  }
}
