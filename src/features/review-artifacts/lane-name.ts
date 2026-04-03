import { createHash } from "node:crypto"

const MAX_LANE_SEGMENT_LENGTH = 48

function toSafeLaneBase(laneName: string): string {
  const normalized = laneName
    .normalize("NFKC")
    .trim()
    .toLowerCase()

  const collapsed = normalized
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")

  return collapsed || "lane"
}

export function sanitizeLaneName(laneName: string): string {
  const base = toSafeLaneBase(laneName)

  if (base.length <= MAX_LANE_SEGMENT_LENGTH) {
    return base
  }

  const suffix = createHash("sha256").update(base).digest("hex").slice(0, 8)
  const sliceLength = MAX_LANE_SEGMENT_LENGTH - (suffix.length + 1)
  return `${base.slice(0, sliceLength)}-${suffix}`
}
