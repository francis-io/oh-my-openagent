import { applyFindingStateTransition, type PersistedReviewFinding, type PersistedReviewState } from "../review-state"
import type { ReviewProfileName } from "../../shared/model-requirements"
import { appendWaveProvenanceToFinding } from "./finding-provenance"
import { resolveReviewPassCap } from "./pass-cap"
import type { ReviewConvergenceWaveResult, ReviewWaveFinding, ReviewWaveProvenanceMap } from "./types"

function isHighSeverity(severity: PersistedReviewFinding["severity"]): boolean {
  return severity === "blocking" || severity === "major"
}

function createWaveFindingDeterministicKey(finding: ReviewWaveFinding): string {
  const evidence = [...finding.evidence]
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

  return JSON.stringify({
    suppression_identity: finding.suppression_identity,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    title: finding.title.trim().toLowerCase(),
    summary: finding.summary.trim().toLowerCase(),
    remediation_intent: finding.remediation_intent.trim().toLowerCase(),
    evidence,
  })
}

function createWaveFindingRawTieBreakKey(finding: ReviewWaveFinding): string {
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

function toDeterministicUniqueWaveFindings(findings: ReviewWaveFinding[]): ReviewWaveFinding[] {
  const byFingerprint = new Map<string, ReviewWaveFinding>()

  for (const finding of findings) {
    const existing = byFingerprint.get(finding.fingerprint)
    if (!existing) {
      byFingerprint.set(finding.fingerprint, finding)
      continue
    }

    const existingKey = createWaveFindingDeterministicKey(existing)
    const candidateKey = createWaveFindingDeterministicKey(finding)
    if (candidateKey.localeCompare(existingKey) < 0) {
      byFingerprint.set(finding.fingerprint, finding)
      continue
    }

    if (candidateKey === existingKey) {
      const existingTieBreakKey = createWaveFindingRawTieBreakKey(existing)
      const candidateTieBreakKey = createWaveFindingRawTieBreakKey(finding)
      if (candidateTieBreakKey.localeCompare(existingTieBreakKey) < 0) {
        byFingerprint.set(finding.fingerprint, finding)
      }
    }
  }

  return [...byFingerprint.values()].sort((left, right) => left.fingerprint.localeCompare(right.fingerprint))
}

function createCandidateFinding(finding: ReviewWaveFinding, at: string): PersistedReviewFinding {
  return {
    ...finding,
    state: "candidate",
    first_seen_at: at,
    updated_at: at,
    state_events: [{ to: "candidate", at, reason: "wave-normalized" }],
    seen_by: [],
  }
}

export function applyConvergenceWave(input: {
  state: PersistedReviewState
  profile: ReviewProfileName
  wave_findings: ReviewWaveFinding[]
  wave_provenance?: ReviewWaveProvenanceMap
  now?: string
  pass_cap_override?: number
}): ReviewConvergenceWaveResult {
  const at = input.now ?? new Date().toISOString()
  const passCap = resolveReviewPassCap(input.profile, input.pass_cap_override)
  const waveFindings = toDeterministicUniqueWaveFindings(input.wave_findings)
  const findings: PersistedReviewState["findings"] = { ...input.state.findings }
  const newHighSeverityFingerprints: string[] = []

  for (const waveFinding of waveFindings) {
    const existing = findings[waveFinding.fingerprint]

    if (!existing) {
      findings[waveFinding.fingerprint] = appendWaveProvenanceToFinding({
        finding: createCandidateFinding(waveFinding, at),
        state: input.state,
        waveFinding,
        wave_provenance: input.wave_provenance,
      })
      if (isHighSeverity(waveFinding.severity)) {
        newHighSeverityFingerprints.push(waveFinding.fingerprint)
      }
      continue
    }

    if (existing.state === "dismissed" || existing.state === "accepted_open") {
      continue
    }

    if (existing.state === "resolved_by_code_change") {
      const reopened = applyFindingStateTransition(existing, "candidate", {
        at,
        reason: "reopened-from-wave",
      })
      findings[waveFinding.fingerprint] = appendWaveProvenanceToFinding({
        finding: {
        ...reopened,
        ...waveFinding,
        },
        state: input.state,
        waveFinding,
        wave_provenance: input.wave_provenance,
      })
      if (isHighSeverity(waveFinding.severity)) {
        newHighSeverityFingerprints.push(waveFinding.fingerprint)
      }
      continue
    }

    findings[waveFinding.fingerprint] = appendWaveProvenanceToFinding({
      finding: {
        ...existing,
        ...waveFinding,
        state: existing.state,
        first_seen_at: existing.first_seen_at,
        state_events: existing.state_events,
        updated_at: at,
      },
      state: input.state,
      waveFinding,
      wave_provenance: input.wave_provenance,
    })
  }

  const completedWaves = input.state.wave_counters.completed_waves + 1
  const dryWave = newHighSeverityFingerprints.length === 0
  const dryWaves = input.state.wave_counters.dry_waves + (dryWave ? 1 : 0)
  const reachedCap = completedWaves >= passCap
  const stopReason = dryWave ? "dry-wave-complete" : reachedCap ? "pass-cap-reached" : undefined

  const nextState: PersistedReviewState = {
    ...input.state,
    phase: "pass_boundary",
    updated_at: at,
    findings,
    wave_counters: {
      completed_waves: completedWaves,
      dry_waves: dryWaves,
    },
    stop_reason: stopReason,
    stop_wave: stopReason ? completedWaves : undefined,
  }

  return {
    state: nextState,
    should_continue: !stopReason,
    stop_reason: stopReason,
    new_high_severity_fingerprints: newHighSeverityFingerprints,
  }
}
