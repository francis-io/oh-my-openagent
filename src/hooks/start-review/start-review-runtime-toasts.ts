import type { RuntimeShowToast } from "./start-review-runtime-types"

type RuntimeToastClient = {
  showToast: RuntimeShowToast
}

type ReviewToastEvent =
  | { type: "review-started"; profile: string; mode: string; reviewRunId: string }
  | { type: "wave-started"; wave: number }
  | { type: "wave-complete"; wave: number; findingCount: number; newHighCount: number }
  | { type: "convergence-complete"; completedWaves: number; stopReason: string; totalFindings: number }
  | { type: "merge-started"; laneFindingCount: number; retrying: boolean }
  | { type: "tie-break-started"; conflictCount: number }
  | { type: "review-complete"; acceptedCount: number; remediationPath: string }
  | { type: "review-needs-input"; conflictCount: number }
  | { type: "review-error"; message: string; recoveryAttempted: boolean }

function formatReviewToast(event: ReviewToastEvent): {
  title: string
  message: string
  variant: "info" | "success" | "warning" | "error"
  duration: number
} {
  switch (event.type) {
    case "review-started":
      return {
        title: "Review Started",
        message: `${event.profile} • ${event.mode} • ${event.reviewRunId}`,
        variant: "info",
        duration: 4000,
      }
    case "wave-started":
      return {
        title: `Wave ${event.wave} Started`,
        message: "Launching argus",
        variant: "info",
        duration: 3000,
      }
    case "wave-complete":
      return {
        title: `Wave ${event.wave} Complete`,
        message: event.newHighCount > 0
          ? `${event.findingCount} findings • ${event.newHighCount} new high-severity`
          : `${event.findingCount} findings • dry wave`,
        variant: "info",
        duration: 3500,
      }
    case "convergence-complete":
      return {
        title: "Convergence Complete",
        message: `${event.completedWaves} waves • ${event.totalFindings} findings • ${event.stopReason}`,
        variant: "info",
        duration: 4000,
      }
    case "merge-started":
      return {
        title: "Merge Phase",
        message: event.retrying
          ? `Retrying with ${event.laneFindingCount} persisted lane findings`
          : `${event.laneFindingCount} lane findings under review`,
        variant: "info",
        duration: 3500,
      }
    case "tie-break-started":
      return {
        title: "Tie-Break Phase",
        message: `${event.conflictCount} conflicts need Oracle`,
        variant: "info",
        duration: 3500,
      }
    case "review-complete":
      return {
        title: "Review Complete",
        message: `${event.acceptedCount} accepted findings • ${event.remediationPath}`,
        variant: "success",
        duration: 5000,
      }
    case "review-needs-input":
      return {
        title: "Review Needs Input",
        message: `${event.conflictCount} unresolved conflicts await decision`,
        variant: "warning",
        duration: 4500,
      }
    case "review-error":
      return {
        title: "Review Error",
        message: event.recoveryAttempted
          ? `${event.message} • recovery attempted`
          : event.message,
        variant: "error",
        duration: 5000,
      }
  }
}

export function emitReviewToast(showToast: RuntimeShowToast | undefined, event: ReviewToastEvent): void {
  if (!showToast) {
    return
  }

  const { title, message, variant, duration } = formatReviewToast(event)
  try {
    void showToast({
      body: { title, message, variant, duration },
    }).catch(() => {})
  } catch {
    return
  }
}

export function createRuntimeShowToast(tui: RuntimeToastClient | undefined): RuntimeShowToast | undefined {
  if (!tui) {
    return undefined
  }

  return (input: Parameters<RuntimeShowToast>[0]) => tui.showToast(input)
}
