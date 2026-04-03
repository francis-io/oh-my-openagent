import { z } from "zod"
import type { ReviewWaveFinding } from "../../features/review-loop"
import {
  FindingCategorySchema,
  FindingConfidenceSchema,
  FindingEvidenceAnchorSchema,
  FindingSeveritySchema,
} from "../../features/review-artifacts/finding-schema"
import { parseJsonFromText } from "../../shared"

const PersistedRuntimeLaneFindingSchema = z.object({
  fingerprint: z.string().min(1),
  suppression_identity: z.string().min(1),
  category: FindingCategorySchema,
  severity: FindingSeveritySchema,
  confidence: FindingConfidenceSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  remediation_intent: z.string().min(1),
  evidence: z.array(FindingEvidenceAnchorSchema),
})

export function parsePersistedRuntimeLaneFindings(text: string): ReviewWaveFinding[] {
  const parsed = parseJsonFromText(text)
  if (!Array.isArray(parsed)) {
    throw new Error("Persisted lane findings must be a JSON array")
  }

  return z.array(PersistedRuntimeLaneFindingSchema).parse(parsed)
}
