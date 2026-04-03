import type { z } from "zod"
import {
  type FindingEvidenceAnchorSchema,
  type FindingCategorySchema,
  type FindingConfidenceSchema,
  type FindingSeveritySchema,
} from "../review-artifacts"
import type { PersistedReviewState, ReviewLoopStopReason } from "../review-state"
import type { ReviewLaneName, SpawnLockedReviewWaveInput } from "../review-routing"
import type { ReviewProfileName } from "../../shared/model-requirements"

export type ReviewWaveFinding = {
  fingerprint: string
  suppression_identity: string
  category: z.infer<typeof FindingCategorySchema>
  severity: z.infer<typeof FindingSeveritySchema>
  confidence: z.infer<typeof FindingConfidenceSchema>
  title: string
  summary: string
  remediation_intent: string
  evidence: Array<z.infer<typeof FindingEvidenceAnchorSchema>>
}

export type ReviewWaveProvenanceMap = Map<string, Array<{
  lane: "argus" | "argus-gpt" | "argus-claude"
}>>

export type ReviewConvergenceWaveResult = {
  state: PersistedReviewState
  should_continue: boolean
  stop_reason?: ReviewLoopStopReason
  new_high_severity_fingerprints: string[]
}

export type ReviewConvergenceLoopResult = {
  state: PersistedReviewState
  stop_reason: ReviewLoopStopReason
}

export type ReviewConvergenceLoopInput = {
  state: PersistedReviewState
  profile: ReviewProfileName
  pass_cap_override?: number
  parentSessionID: string
  parentMessageID: string
  manager: SpawnLockedReviewWaveInput["manager"]
  lanePromptsForWave: (wave: number) => Record<ReviewLaneName, string>
  collectWaveFindings: (input: {
    wave: number
    state: PersistedReviewState
  }) => Promise<ReviewWaveFinding[]> | ReviewWaveFinding[]
  collectWaveProvenance?: (input: {
    wave: number
    state: PersistedReviewState
  }) => ReviewWaveProvenanceMap | undefined
  onWaveStarted?: (wave: number) => void | Promise<void>
  onWaveSpawned?: (state: PersistedReviewState) => void | Promise<void>
  onWaveComplete?: (input: {
    wave: number
    findings: ReviewWaveFinding[]
    decision: ReviewConvergenceWaveResult
  }) => void | Promise<void>
  onStateUpdate?: (state: PersistedReviewState) => void | Promise<void>
  now?: string
  nowForWave?: (wave: number) => string
}
