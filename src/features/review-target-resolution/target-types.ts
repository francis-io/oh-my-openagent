import { createHash } from "node:crypto"
import { z } from "zod"

export const ReviewModeSchema = z.enum(["plan+git-diff", "repo-wide"])

export const MaterializedSymbolSchema = z.object({
  path: z.string().min(1),
  symbol: z.string().min(1),
  kind: z.enum(["function", "class", "interface", "type", "const"]),
  line: z.number().int().min(1),
})

export const MaterializedBatchSchema = z.object({
  ordinal: z.number().int().min(1),
  paths: z.array(z.string().min(1)),
})

export const MaterializedReviewTargetSchema = z.object({
  version: z.literal(1),
  mode: ReviewModeSchema,
  review_scope_key: z.string().min(1),
  suppression_scope_key: z.string().min(1),
  ref_identity: z.object({
    base_ref: z.string().min(1).nullable(),
    head_ref: z.string().min(1).nullable(),
  }),
  generated_at: z.string().min(1),
  plan_context: z
    .object({
      plan_path: z.string().min(1),
      role: z.literal("context-only"),
    })
    .optional(),
  diff: z.object({
    source_kind: z.enum(["head_ref", "working_tree", "repo_snapshot"]),
    source_commands: z.array(z.string().min(1)),
    text: z.string(),
    changed_files: z.array(z.string().min(1)),
  }),
  scope: z.object({
    include_paths: z.array(z.string().min(1)),
    exclude_paths: z.array(z.string().min(1)),
    default_exclusions: z.array(z.string().min(1)),
    out_of_scope_patterns: z.array(z.string().min(1)),
    included_files: z.array(z.string().min(1)),
    excluded_files: z.array(z.string().min(1)),
  }),
  symbols: z.array(MaterializedSymbolSchema),
  batches: z.array(MaterializedBatchSchema),
  materialization: z.object({
    deterministic_sort: z.literal("path-lexicographic"),
    batch_size: z.number().int().min(1),
    seed: z.string().min(1),
    hash: z.string().min(1),
  }),
})

export type ReviewMode = z.infer<typeof ReviewModeSchema>
export type MaterializedReviewTarget = z.infer<typeof MaterializedReviewTargetSchema>

export function createMaterializationHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}
