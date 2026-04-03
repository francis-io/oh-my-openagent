import type { PersistedReviewState } from "../review-state"
import { createReviewWaveRoutingPlan } from "../review-routing"
import { REVIEW_PROFILE_MODEL_POLICIES } from "../../shared/model-requirements"
import { createFindingMergeSignature } from "./finding-signature"
import type {
  LaneFindingInput,
  MergeConsensusResult,
  ReviewConsensusFinding,
  ReviewMergeConflict,
} from "./types"

function createLaneFindingRawTieBreakKey(finding: LaneFindingInput["finding"]): string {
  const evidence = [...finding.evidence]
    .map((anchor) => ({
      path: anchor.path,
      symbol: anchor.symbol ?? "",
      start_line: anchor.start_line ?? 0,
      end_line: anchor.end_line ?? 0,
      hunk_header: anchor.hunk_header ?? "",
    }))
    .sort((left, right) => {
      const leftKey = `${left.path}|${left.symbol}|${left.start_line}|${left.end_line}|${left.hunk_header}`
      const rightKey = `${right.path}|${right.symbol}|${right.start_line}|${right.end_line}|${right.hunk_header}`
      return leftKey.localeCompare(rightKey)
    })

  return JSON.stringify({
    suppression_identity: finding.suppression_identity,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    title: finding.title,
    summary: finding.summary,
    remediation_intent: finding.remediation_intent,
    evidence,
  })
}

function toDeterministicLaneFindings(findings: LaneFindingInput[]): LaneFindingInput[] {
  const dedupedByLaneFingerprint = new Map<string, LaneFindingInput>()

  for (const entry of findings) {
    const key = `${entry.lane}|${entry.finding.fingerprint}`

    const existing = dedupedByLaneFingerprint.get(key)
    if (!existing) {
      dedupedByLaneFingerprint.set(key, entry)
      continue
    }

    const existingKey = createFindingMergeSignature(existing.finding)
    const candidateKey = createFindingMergeSignature(entry.finding)
    if (candidateKey.localeCompare(existingKey) < 0) {
      dedupedByLaneFingerprint.set(key, entry)
      continue
    }

    if (candidateKey === existingKey) {
      const existingTieBreakKey = createLaneFindingRawTieBreakKey(existing.finding)
      const candidateTieBreakKey = createLaneFindingRawTieBreakKey(entry.finding)
      if (candidateTieBreakKey.localeCompare(existingTieBreakKey) < 0) {
        dedupedByLaneFingerprint.set(key, entry)
      }
    }
  }

  const deduped = [...dedupedByLaneFingerprint.values()]

  return deduped.sort((left, right) => {
    const laneCompare = left.lane.localeCompare(right.lane)
    if (laneCompare !== 0) {
      return laneCompare
    }
    return left.finding.fingerprint.localeCompare(right.finding.fingerprint)
  })
}

function assertOracleTieBreakRoute(
  profile: MergeConsensusResult["profile"],
  route: MergeConsensusResult["tie_break_route"],
): void {
  const tuple = route.model_tuple
  const expected = REVIEW_PROFILE_MODEL_POLICIES[profile].tieBreak
  if (
    tuple.agent !== expected.agent
    || tuple.provider !== expected.provider
    || tuple.model !== expected.model
    || tuple.variant !== expected.variant
    || tuple.reasoningEffort !== expected.reasoningEffort
    || JSON.stringify(tuple.thinking ?? null) !== JSON.stringify(expected.thinking ?? null)
  ) {
    throw new Error(`Tie-break route must stay pinned to ${expected.agent} ${expected.provider}/${expected.model} ${expected.variant}`)
  }
}

function selectDeterministicConsensus(candidates: LaneFindingInput[]): ReviewConsensusFinding {
  const sorted = [...candidates].sort((left, right) => left.lane.localeCompare(right.lane))
  const selected = sorted[0]

  return {
    fingerprint: selected.finding.fingerprint,
    source_lanes: sorted.map((entry) => entry.lane),
    finding: selected.finding,
  }
}

export function mergeReviewFindings(input: {
  profile: MergeConsensusResult["profile"]
  wave: number
  state: PersistedReviewState
  lane_findings: LaneFindingInput[]
}): MergeConsensusResult {
  const routing = createReviewWaveRoutingPlan(input.profile, input.wave)
  assertOracleTieBreakRoute(input.profile, routing.tie_break)

  const grouped = new Map<string, LaneFindingInput[]>()
  const deterministicLaneFindings = toDeterministicLaneFindings(input.lane_findings)
  const suppressedDismissedFingerprints = new Set<string>()
  const carriedAcceptedOpen = new Map<string, PersistedReviewState["findings"][string]>()

  for (const entry of deterministicLaneFindings) {
    const existing = input.state.findings[entry.finding.fingerprint]
    if (existing?.state === "dismissed") {
      suppressedDismissedFingerprints.add(entry.finding.fingerprint)
      continue
    }
    if (existing?.state === "accepted_open") {
      carriedAcceptedOpen.set(entry.finding.fingerprint, existing)
      continue
    }

    const current = grouped.get(entry.finding.fingerprint) ?? []
    grouped.set(entry.finding.fingerprint, [...current, entry])
  }

  const consensusFindings: ReviewConsensusFinding[] = []
  const conflicts: ReviewMergeConflict[] = []

  const fingerprints = [...grouped.keys()].sort((left, right) => left.localeCompare(right))
  for (const fingerprint of fingerprints) {
    const laneFindings = grouped.get(fingerprint) ?? []
    const uniqueSignatures = new Set(laneFindings.map((entry) => createFindingMergeSignature(entry.finding)))

    if (uniqueSignatures.size <= 1) {
      consensusFindings.push(selectDeterministicConsensus(laneFindings))
      continue
    }

    conflicts.push({
      fingerprint,
      lane_findings: laneFindings,
    })
  }

  return {
    profile: input.profile,
    wave: Math.max(1, Math.floor(input.wave)),
    consensus_findings: consensusFindings,
    conflicts_for_tie_break: conflicts,
    tie_break_route: routing.tie_break,
    suppressed_dismissed_fingerprints: [...suppressedDismissedFingerprints].sort((left, right) => left.localeCompare(right)),
    carried_accepted_open_findings: [...carriedAcceptedOpen.values()].sort((left, right) => left.fingerprint.localeCompare(right.fingerprint)),
  }
}
