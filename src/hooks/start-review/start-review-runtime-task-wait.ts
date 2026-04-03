import type { BackgroundTask } from "../../features/background-agent"
import type { RuntimeBackgroundManager } from "./start-review-runtime-types"
import { log } from "../../shared/logger"

const TERMINAL_STATUS = new Set(["completed", "error", "cancelled", "interrupt"])
const DEFAULT_RUNTIME_TASK_TIMEOUT_MS = 600_000
const DEFAULT_RUNTIME_TASK_POLL_INTERVAL_MS = 500

export async function waitForRuntimeTaskTerminal(
  manager: RuntimeBackgroundManager,
  taskId: string,
  options?: { timeout_ms?: number; poll_interval_ms?: number; label?: string },
): Promise<BackgroundTask> {
  const timeoutMs = options?.timeout_ms ?? DEFAULT_RUNTIME_TASK_TIMEOUT_MS
  const label = options?.label ?? "runtime task"
  const timeoutAt = Date.now() + timeoutMs
  const pollIntervalMs = options?.poll_interval_ms ?? DEFAULT_RUNTIME_TASK_POLL_INTERVAL_MS
  log("[start-review] waitForRuntimeTaskTerminal begin", {
    taskId,
    label,
    timeoutMs,
    pollIntervalMs,
  })
  while (Date.now() < timeoutAt) {
    const task = manager.getTask(taskId)
    if (task && TERMINAL_STATUS.has(task.status)) {
      log("[start-review] waitForRuntimeTaskTerminal terminal", {
        taskId,
        label,
        status: task.status,
      })
      return task
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  const lastTask = manager.getTask(taskId)
  log("[start-review] waitForRuntimeTaskTerminal timeout", {
    taskId,
    label,
    timeoutMs,
    lastKnownStatus: lastTask?.status,
    lastKnownProgress: lastTask?.progress,
  })

  throw new Error(`Timed out waiting for ${label} completion after ${timeoutMs}ms: ${taskId}`)
}
