import type { ReviewWaveFinding } from "../review-loop"

function normalizeText(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeEvidence(input: ReviewWaveFinding["evidence"]) {
  return [...input]
    .map((anchor) => ({
      path: anchor.path.trim().replace(/\\/g, "/"),
      symbol: anchor.symbol?.trim() ?? "",
      start_line: anchor.start_line ?? 0,
      end_line: anchor.end_line ?? 0,
      hunk_header: anchor.hunk_header?.trim() ?? "",
    }))
    .sort((left, right) => {
      const leftKey = `${left.path}|${left.symbol}|${left.start_line}|${left.end_line}|${left.hunk_header}`
      const rightKey = `${right.path}|${right.symbol}|${right.start_line}|${right.end_line}|${right.hunk_header}`
      return leftKey.localeCompare(rightKey)
    })
}

export function createFindingMergeSignature(finding: ReviewWaveFinding): string {
  return JSON.stringify({
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    remediation_intent: normalizeText(finding.remediation_intent),
    title: normalizeText(finding.title),
    summary: normalizeText(finding.summary),
    evidence: normalizeEvidence(finding.evidence),
  })
}
