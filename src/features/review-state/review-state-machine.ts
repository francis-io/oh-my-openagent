import type {
  PersistedReviewFinding,
  ReviewFindingLifecycleState,
} from "./review-state-types"

const TRANSITIONS: Record<ReviewFindingLifecycleState, ReadonlySet<ReviewFindingLifecycleState>> = {
  candidate: new Set(["merged", "accepted_open", "dismissed", "resolved_by_code_change"]),
  merged: new Set(["tie-broken", "accepted_open", "dismissed", "resolved_by_code_change"]),
  "tie-broken": new Set(["accepted_open", "dismissed", "resolved_by_code_change"]),
  accepted_open: new Set(["accepted_open", "dismissed", "resolved_by_code_change"]),
  dismissed: new Set(["dismissed", "resolved_by_code_change"]),
  resolved_by_code_change: new Set(["resolved_by_code_change", "candidate"]),
}

export function canTransitionFindingState(
  from: ReviewFindingLifecycleState,
  to: ReviewFindingLifecycleState,
): boolean {
  return TRANSITIONS[from].has(to)
}

export function transitionFindingState(
  from: ReviewFindingLifecycleState,
  to: ReviewFindingLifecycleState,
): ReviewFindingLifecycleState {
  if (!canTransitionFindingState(from, to)) {
    throw new Error(`Invalid review finding state transition: ${from} -> ${to}`)
  }
  return to
}

export function applyFindingStateTransition(
  finding: PersistedReviewFinding,
  nextState: ReviewFindingLifecycleState,
  options?: { at?: string; reason?: string },
): PersistedReviewFinding {
  const at = options?.at ?? new Date().toISOString()

  if (finding.state !== nextState) {
    transitionFindingState(finding.state, nextState)
  }

  return {
    ...finding,
    state: nextState,
    updated_at: at,
    state_events: [
      ...finding.state_events,
      {
        from: finding.state,
        to: nextState,
        at,
        reason: options?.reason,
      },
    ],
  }
}
