import { basename } from "node:path"

function toTimestampToken(now: string): string {
  return now.replace(/[^0-9]/g, "").slice(0, 14) || `${Date.now()}`
}

export function createStartReviewRunId(sessionID: string, now?: string): string {
  const sanitizedSession = sessionID.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-")
  const tail = basename(sanitizedSession).slice(-40) || "session"
  return `run-${tail}-${toTimestampToken(now ?? new Date().toISOString())}`
}
