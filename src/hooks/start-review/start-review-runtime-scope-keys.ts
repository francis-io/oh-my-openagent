import { createHash } from "node:crypto"
import type { MaterializedReviewTarget } from "../../features/review-target-resolution"

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 20)
}

export function deriveRuntimeScopeKeys(input: { target: MaterializedReviewTarget }) {
  const targetIdentity = [
    input.target.mode,
    input.target.ref_identity.base_ref ?? "",
    input.target.ref_identity.head_ref ?? "",
    input.target.diff.source_kind,
    input.target.diff.source_commands.join("|"),
    input.target.diff.changed_files.join("|"),
    input.target.scope.include_paths.join("|"),
    input.target.scope.exclude_paths.join("|"),
    input.target.plan_context?.plan_path ?? "",
  ].join("\n")

  return {
    review_scope_key: `review-scope-${shortHash(targetIdentity)}`,
    suppression_scope_key: `suppression-scope-${shortHash(targetIdentity)}`,
  }
}
