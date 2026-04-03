import {
  parseLockedReviewRoleSession,
  type LockedReviewRole,
  type ReviewProfileName,
} from "./model-requirements"

export type LockedReviewRuntimeSession = {
  profile: ReviewProfileName
  role: LockedReviewRole
  wave?: number
  lane?: "argus" | "argus-gpt" | "argus-claude"
}

const runtimeLockedSessions = new Map<string, LockedReviewRuntimeSession>()

export function registerLockedReviewRuntimeSession(
  sessionID: string | undefined,
  session: LockedReviewRuntimeSession,
): void {
  if (!sessionID) {
    return
  }

  runtimeLockedSessions.set(sessionID, session)
}

export function clearLockedReviewRuntimeSession(sessionID: string | undefined): void {
  if (!sessionID) {
    return
  }

  runtimeLockedSessions.delete(sessionID)
}

export function getLockedReviewRuntimeSession(
  sessionID: string | undefined,
): LockedReviewRuntimeSession | undefined {
  if (!sessionID) {
    return undefined
  }

  const runtime = runtimeLockedSessions.get(sessionID)
  if (runtime) {
    return runtime
  }

  const parsed = parseLockedReviewRoleSession(sessionID)
  if (!parsed) {
    return undefined
  }

  return parsed
}

export function isLockedReviewRuntimeSession(sessionID: string | undefined): boolean {
  return getLockedReviewRuntimeSession(sessionID) !== undefined
}

export function _resetLockedReviewRuntimeSessionRegistryForTesting(): void {
  runtimeLockedSessions.clear()
}
