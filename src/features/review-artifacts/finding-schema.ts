import { z } from "zod"
import {
  buildFindingFingerprint,
  buildSuppressionIdentity,
  type FindingFingerprintAnchor,
} from "./finding-fingerprint"

export const FindingCategorySchema = z.enum([
  "correctness",
  "requirement-mismatch",
  "best-practice",
  "simplify-remove",
])

export const FindingSeveritySchema = z.enum(["blocking", "major", "minor", "nit"])

export const FindingConfidenceSchema = z.enum(["low", "medium", "high"])

export const FindingEvidenceAnchorSchema = z.object({
  path: z.string().min(1),
  symbol: z.string().min(1).optional(),
  start_line: z.number().int().min(1).optional(),
  end_line: z.number().int().min(1).optional(),
  hunk_header: z.string().min(1).optional(),
  rationale: z.string().min(1).optional(),
})

export const FindingRemediationSchema = z.object({
  intent: z.string().min(1),
  summary: z.string().min(1).optional(),
})

export const FindingSchema = z.object({
  category: FindingCategorySchema,
  severity: FindingSeveritySchema,
  confidence: FindingConfidenceSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  evidence: z.array(FindingEvidenceAnchorSchema).min(1),
  remediation: FindingRemediationSchema,
  fingerprint: z.string().min(1).optional(),
  suppression_identity: z.string().min(1).optional(),
})

export type NormalizedFinding = z.infer<typeof FindingSchema>

function normalizeLineNumber(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined
  }
  return Math.max(1, Math.floor(value))
}

function normalizeEvidenceAnchor(anchor: z.infer<typeof FindingEvidenceAnchorSchema>) {
  return {
    path: anchor.path.trim().replace(/\\/g, "/"),
    symbol: anchor.symbol?.trim(),
    start_line: normalizeLineNumber(anchor.start_line),
    end_line: normalizeLineNumber(anchor.end_line),
    hunk_header: anchor.hunk_header?.trim(),
    rationale: anchor.rationale?.trim(),
  }
}

function compareAnchors(a: { path: string; symbol?: string; start_line?: number; end_line?: number }, b: { path: string; symbol?: string; start_line?: number; end_line?: number }) {
  const aKey = `${a.path}|${a.symbol ?? ""}|${a.start_line ?? 0}|${a.end_line ?? 0}`
  const bKey = `${b.path}|${b.symbol ?? ""}|${b.start_line ?? 0}|${b.end_line ?? 0}`
  return aKey.localeCompare(bKey)
}

function toFingerprintAnchors(
  anchors: Array<{ path: string; symbol?: string; start_line?: number; end_line?: number }>,
): FindingFingerprintAnchor[] {
  return anchors.map((anchor) => ({
    path: anchor.path,
    symbol: anchor.symbol,
    start_line: anchor.start_line,
    end_line: anchor.end_line,
  }))
}

function coerceEmptyIdentityFields(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input
  }
  const record = input as Record<string, unknown>
  const patched = { ...record }
  if (typeof patched.fingerprint === "string" && patched.fingerprint.trim() === "") {
    delete patched.fingerprint
  }
  if (typeof patched.suppression_identity === "string" && patched.suppression_identity.trim() === "") {
    delete patched.suppression_identity
  }
  return patched
}

export function normalizeFinding(input: unknown): NormalizedFinding {
  const parsed = FindingSchema.parse(coerceEmptyIdentityFields(input))
  const normalizedEvidence = parsed.evidence
    .map(normalizeEvidenceAnchor)
    .sort(compareAnchors)

  const remediationIntent = parsed.remediation.intent.trim().toLowerCase()
  const fingerprintMaterial = {
    category: parsed.category,
    remediation_intent: remediationIntent,
    anchors: toFingerprintAnchors(normalizedEvidence),
  }

  const fingerprint = parsed.fingerprint ?? buildFindingFingerprint(fingerprintMaterial)
  const suppressionIdentity = parsed.suppression_identity ?? buildSuppressionIdentity(fingerprintMaterial)

  return {
    ...parsed,
    title: parsed.title.trim(),
    summary: parsed.summary.trim(),
    remediation: {
      intent: remediationIntent,
      summary: parsed.remediation.summary?.trim(),
    },
    evidence: normalizedEvidence,
    fingerprint,
    suppression_identity: suppressionIdentity,
  }
}
