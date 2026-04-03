import { join } from "node:path"
import { createReviewArtifactPaths } from "../review-artifacts"
import type { FindingProvenance, PersistedReviewFinding } from "../review-state"
import type { ReviewConsensusFinding, WriteRemediationPlanInput, WriteRemediationPlanResult } from "./types"
import { writeTextFileAtomic } from "../../hooks/start-review/start-review-runtime-file-write"

const SEVERITY_RANK: Record<string, number> = {
  blocking: 0,
  major: 1,
  minor: 2,
  nit: 3,
}

function toRemediationRows(input: {
  consensus_findings: ReviewConsensusFinding[]
  accepted_open_findings: PersistedReviewFinding[]
  persisted_findings?: WriteRemediationPlanInput["persisted_findings"]
}) {
  const fromConsensus = input.consensus_findings.map((entry) => ({
    fingerprint: entry.fingerprint,
    state: "merged",
    category: entry.finding.category,
    severity: entry.finding.severity,
    title: entry.finding.title,
    summary: entry.finding.summary,
    remediation_intent: entry.finding.remediation_intent,
    seen_by: input.persisted_findings?.[entry.fingerprint]?.seen_by ?? [],
  }))

  const fromAcceptedOpen = input.accepted_open_findings.map((entry) => ({
    fingerprint: entry.fingerprint,
    state: "accepted_open",
    category: entry.category,
    severity: entry.severity,
    title: entry.title,
    summary: entry.summary,
    remediation_intent: entry.remediation_intent,
    seen_by: entry.seen_by ?? [],
  }))

  const merged = [...fromConsensus, ...fromAcceptedOpen]
  const byFingerprint = new Map<string, typeof merged[number]>()
  for (const finding of merged) {
    if (!byFingerprint.has(finding.fingerprint)) {
      byFingerprint.set(finding.fingerprint, finding)
    }
  }

  return [...byFingerprint.values()].sort((left, right) => {
    const severityCompare = (SEVERITY_RANK[left.severity] ?? 9) - (SEVERITY_RANK[right.severity] ?? 9)
    if (severityCompare !== 0) {
      return severityCompare
    }
    return left.fingerprint.localeCompare(right.fingerprint)
  })
}

function formatSeenBy(seenBy: FindingProvenance[]): string {
  return [...seenBy]
    .sort((left, right) => left.wave - right.wave || left.lane.localeCompare(right.lane))
    .map((entry) => `${entry.lane} (wave ${entry.wave})`)
    .join(", ")
}

function renderRemediationMarkdown(input: {
  review_run_id: string
  generated_at: string
  rows: ReturnType<typeof toRemediationRows>
}): string {
  const lines: string[] = [
    `# Review Remediation Plan (${input.review_run_id})`,
    "",
    `Generated at: ${input.generated_at}`,
    "",
    "## Findings",
    "",
  ]

  if (input.rows.length === 0) {
    lines.push("No remediation findings were emitted.")
    lines.push("")
    return lines.join("\n")
  }

  for (const row of input.rows) {
    lines.push(`### ${row.title}`)
    lines.push(`- fingerprint: ${row.fingerprint}`)
    lines.push(`- state: ${row.state}`)
    lines.push(`- severity: ${row.severity}`)
    lines.push(`- category: ${row.category}`)
    if (row.seen_by.length > 0) {
      lines.push(`- seen_by: ${formatSeenBy(row.seen_by)}`)
    }
    lines.push(`- remediation_intent: ${row.remediation_intent}`)
    lines.push(`- summary: ${row.summary}`)
    lines.push("")
  }

  return lines.join("\n")
}

export function writeCanonicalRemediationPlan(input: WriteRemediationPlanInput): WriteRemediationPlanResult {
  const generatedAt = input.generated_at ?? new Date().toISOString()
  const artifactPaths = createReviewArtifactPaths({
    projectRoot: input.project_root,
    review_run_id: input.review_run_id,
    review_scope_key: input.review_scope_key,
    suppression_scope_key: input.suppression_scope_key,
  })

  const canonicalPath = join(
    input.project_root,
    ".sisyphus",
    "plans",
    `review-remediation-${input.review_run_id}.md`,
  )
  const rows = toRemediationRows({
    consensus_findings: input.consensus_findings,
    accepted_open_findings: input.accepted_open_findings,
    persisted_findings: input.persisted_findings,
  })
  const markdown = renderRemediationMarkdown({
    review_run_id: input.review_run_id,
    generated_at: generatedAt,
    rows,
  })

  writeTextFileAtomic(canonicalPath, markdown)
  writeTextFileAtomic(artifactPaths.remediationPlanSnapshotPath, markdown)
  writeTextFileAtomic(artifactPaths.canonicalRemediationPathRefPath, canonicalPath)

  return {
    canonical_path: canonicalPath,
    snapshot_path: artifactPaths.remediationPlanSnapshotPath,
  }
}
