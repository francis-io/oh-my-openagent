import { createHash } from "node:crypto"

export type FindingFingerprintAnchor = {
  path: string
  symbol?: string
  start_line?: number
  end_line?: number
}

export type FindingFingerprintMaterial = {
  category: string
  remediation_intent: string
  anchors: readonly FindingFingerprintAnchor[]
}

function normalizeToken(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ")
}

function normalizeAnchor(anchor: FindingFingerprintAnchor): FindingFingerprintAnchor {
  const normalized: FindingFingerprintAnchor = {
    path: normalizeToken(anchor.path),
  }

  const symbol = normalizeToken(anchor.symbol)
  if (symbol) normalized.symbol = symbol

  if (typeof anchor.start_line === "number" && Number.isFinite(anchor.start_line)) {
    normalized.start_line = Math.max(1, Math.floor(anchor.start_line))
  }

  if (typeof anchor.end_line === "number" && Number.isFinite(anchor.end_line)) {
    normalized.end_line = Math.max(1, Math.floor(anchor.end_line))
  }

  return normalized
}

function sortAnchors(anchors: readonly FindingFingerprintAnchor[]): FindingFingerprintAnchor[] {
  return [...anchors].sort((left, right) => {
    const leftKey = `${left.path}|${left.symbol ?? ""}|${left.start_line ?? 0}|${left.end_line ?? 0}`
    const rightKey = `${right.path}|${right.symbol ?? ""}|${right.start_line ?? 0}|${right.end_line ?? 0}`
    return leftKey.localeCompare(rightKey)
  })
}

export function buildFindingFingerprint(material: FindingFingerprintMaterial): string {
  const normalizedMaterial = {
    category: normalizeToken(material.category),
    remediation_intent: normalizeToken(material.remediation_intent) || "unspecified",
    anchors: sortAnchors(material.anchors.map(normalizeAnchor)).filter((anchor) => anchor.path.length > 0),
  }

  const serialized = JSON.stringify(normalizedMaterial)
  return createHash("sha256").update(serialized).digest("hex")
}

export function buildSuppressionIdentity(material: FindingFingerprintMaterial): string {
  return buildFindingFingerprint(material)
}
