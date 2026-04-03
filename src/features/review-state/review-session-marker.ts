import {
  LOCKED_REVIEW_ROLE_SESSION_MARKER,
  parseLockedReviewRoleSession,
  type LockedReviewRole,
  type ReviewProfileName,
} from "../../shared/model-requirements"

export function buildLockedReviewSessionMarker(profile: ReviewProfileName, role: LockedReviewRole): string {
  return `${LOCKED_REVIEW_ROLE_SESSION_MARKER}${profile}:${role}`
}

export function isLockedReviewSessionMarker(sessionID: string | undefined): boolean {
  return parseLockedReviewRoleSession(sessionID) !== undefined
}
