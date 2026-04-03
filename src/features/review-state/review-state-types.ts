import { z } from "zod"
import {
  FindingCategorySchema,
  FindingConfidenceSchema,
  FindingEvidenceAnchorSchema,
  FindingSeveritySchema,
} from "../review-artifacts/finding-schema"
import type { LockedReviewModelTuple, LockedReviewRole, ReviewProfileName } from "../../shared/model-requirements"

export const ReviewFindingLifecycleStateSchema = z.enum([
  "candidate",
  "merged",
  "tie-broken",
  "accepted_open",
  "dismissed",
  "resolved_by_code_change",
])

export const ReviewStatePhaseSchema = z.enum([
  "pass_boundary",
  "merge_pending",
  "tie_break_pending",
  "completed",
])

export const ReviewLoopStopReasonSchema = z.enum([
  "dry-wave-complete",
  "pass-cap-reached",
])

export const PersistedReviewProfileSchema = z.enum(["test", "production"])

export const ReviewWaveCountersSchema = z.object({
  completed_waves: z.number().int().min(0),
  dry_waves: z.number().int().min(0),
})

export const ReviewFindingStateEventSchema = z.object({
  from: ReviewFindingLifecycleStateSchema.optional(),
  to: ReviewFindingLifecycleStateSchema,
  at: z.string().min(1),
  reason: z.string().min(1).optional(),
})

export const PendingFinalConflictSchema = z.object({
  fingerprint: z.string().min(1),
  summary: z.string().min(1),
  options: z.array(z.string().min(1)).min(1),
})

export const PendingFinalConflictBatchSchema = z.object({
  batch_id: z.literal("final-user-question-wave"),
  conflicts: z.array(PendingFinalConflictSchema),
})

export const FindingProvenanceSchema = z.object({
  lane: z.enum(["argus", "argus-gpt", "argus-claude"]),
  wave: z.number().int().min(1),
})

export const PersistedReviewFindingSchema = z.object({
  fingerprint: z.string().min(1),
  suppression_identity: z.string().min(1),
  category: FindingCategorySchema,
  severity: FindingSeveritySchema,
  confidence: FindingConfidenceSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  remediation_intent: z.string().min(1),
  evidence: z.array(FindingEvidenceAnchorSchema).min(1),
  state: ReviewFindingLifecycleStateSchema,
  first_seen_at: z.string().min(1),
  updated_at: z.string().min(1),
  state_events: z.array(ReviewFindingStateEventSchema),
  seen_by: z.array(FindingProvenanceSchema).default([]),
})

export const PersistedReviewStateSchema = z.object({
  version: z.literal(1),
  profile: PersistedReviewProfileSchema,
  review_run_id: z.string().min(1),
  coordinator_session_id: z.string().min(1).optional(),
  review_scope_key: z.string().min(1),
  suppression_scope_key: z.string().min(1),
  ref_identity: z.object({
    base_ref: z.string().min(1).nullable(),
    head_ref: z.string().min(1).nullable(),
  }),
  phase: ReviewStatePhaseSchema,
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  wave_counters: ReviewWaveCountersSchema,
  stop_reason: ReviewLoopStopReasonSchema.optional(),
  stop_wave: z.number().int().min(1).optional(),
  pending_final_conflict_batch: PendingFinalConflictBatchSchema.optional(),
  findings: z.record(z.string().min(1), PersistedReviewFindingSchema),
  locked_session_markers: z.object({
    argus_lane_sessions: z.array(z.string().min(1)),
    merge_session: z.string().min(1).optional(),
    tie_break_session: z.string().min(1).optional(),
  }),
  lane_lineage_by_wave: z.record(z.string().min(1), z.array(z.object({
    invocation_type: z.literal("lane"),
    profile: z.enum(["test", "production"]),
    wave: z.number().int().min(1),
    role: z.literal("argus-lane"),
    lane: z.enum(["argus", "argus-gpt", "argus-claude"]),
    lock_marker: z.string().min(1),
    model_tuple: z.object({
      agent: z.enum(["argus", "themis", "oracle"]),
      provider: z.string().min(1),
      model: z.string().min(1),
      variant: z.string().min(1),
      reasoningEffort: z.string().min(1).optional(),
      thinking: z.object({
        type: z.enum(["enabled", "disabled"]),
        budgetTokens: z.number().optional(),
      }).optional(),
    }),
    surface: z.literal("task-background"),
    task_id: z.string().min(1).optional(),
    session_id: z.string().min(1).optional(),
    created_at: z.string().min(1),
  }))),
  locked_role_invocations: z.array(z.object({
    invocation_type: z.enum(["lane", "merge", "tie-break"]),
    profile: z.enum(["test", "production"]),
    wave: z.number().int().min(1),
    role: z.enum(["argus-lane", "merge", "tie-break"]),
    lane: z.enum(["argus", "argus-gpt", "argus-claude"]).nullable(),
    lock_marker: z.string().min(1),
    model_tuple: z.object({
      agent: z.enum(["argus", "themis", "oracle"]),
      provider: z.string().min(1),
      model: z.string().min(1),
      variant: z.string().min(1),
      reasoningEffort: z.string().min(1).optional(),
      thinking: z.object({
        type: z.enum(["enabled", "disabled"]),
        budgetTokens: z.number().optional(),
      }).optional(),
    }),
    surface: z.literal("task-background"),
    task_id: z.string().min(1).optional(),
    session_id: z.string().min(1).optional(),
    created_at: z.string().min(1),
  })),
})

export type ReviewFindingLifecycleState = z.infer<typeof ReviewFindingLifecycleStateSchema>
export type ReviewLoopStopReason = z.infer<typeof ReviewLoopStopReasonSchema>
export type ReviewWaveCounters = z.infer<typeof ReviewWaveCountersSchema>
export type FindingProvenance = z.infer<typeof FindingProvenanceSchema>
export type PersistedReviewFinding = z.infer<typeof PersistedReviewFindingSchema>
export type PersistedReviewState = z.infer<typeof PersistedReviewStateSchema>
export type PendingFinalConflictBatch = z.infer<typeof PendingFinalConflictBatchSchema>
export type PersistedLockedReviewModelTuple = LockedReviewModelTuple
export type PersistedLockedReviewRole = LockedReviewRole
export type PersistedReviewProfileName = ReviewProfileName
