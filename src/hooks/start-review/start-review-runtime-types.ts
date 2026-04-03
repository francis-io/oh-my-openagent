import type { BackgroundTask } from "../../features/background-agent"
import type { SessionPermissionRule } from "../../shared/question-denied-session-permission"

export type RuntimeShowToast = (input: {
  body: {
    title: string
    message: string
    variant: "info" | "success" | "warning" | "error"
    duration: number
  }
}) => Promise<unknown>

export type RuntimeBackgroundManager = {
  launch: (input: {
    description: string
    prompt: string
    agent: string
    model?: {
      providerID: string
      modelID: string
      variant: string
    }
    parentSessionID: string
    parentMessageID: string
    sessionPermission?: SessionPermissionRule[]
  }) => Promise<BackgroundTask>
  getTask: (id: string) => BackgroundTask | undefined
  getSessionMessages?: (sessionID: string) => Promise<unknown>
}
