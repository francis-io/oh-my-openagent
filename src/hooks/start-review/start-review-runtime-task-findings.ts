import { normalizeFinding } from "../../features/review-artifacts/finding-schema"
import type { ReviewWaveFinding } from "../../features/review-loop"
import { parseJsonFromText } from "../../shared"

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

export function parseRuntimeTaskFindings(resultText: string): ReviewWaveFinding[] {
  const parsed = parseJsonFromText(resultText) as unknown
  const findingItems = Array.isArray(parsed)
    ? parsed
    : (typeof parsed === "object"
        && parsed !== null
        && "findings" in parsed
        && Array.isArray((parsed as { findings: unknown[] }).findings)
        ? (parsed as { findings: unknown[] }).findings
        : undefined)

  if (!findingItems) {
    throw new Error("Runtime lane output must contain a findings array")
  }

  return findingItems.map((item) => {
    const normalized = normalizeFinding(coerceEmptyIdentityFields(item))
    if (!normalized.fingerprint || !normalized.suppression_identity) {
      throw new Error("Runtime lane finding must include fingerprint and suppression_identity")
    }

    return {
      fingerprint: normalized.fingerprint,
      suppression_identity: normalized.suppression_identity,
      category: normalized.category,
      severity: normalized.severity,
      confidence: normalized.confidence,
      title: normalized.title,
      summary: normalized.summary,
      remediation_intent: normalized.remediation.intent,
      evidence: normalized.evidence,
    }
  })
}
