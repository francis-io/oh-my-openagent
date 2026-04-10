import type { ReviewLaneName } from "../../features/review-routing"
import type { MaterializedReviewTarget, ReviewMode } from "../../features/review-target-resolution"
import type { ReviewProfileName } from "../../shared/model-requirements"

type PriorFindingHint = {
  fingerprint: string
  title: string
  summary: string
}

function toGroundedTargetSection(target: MaterializedReviewTarget): string {
  const changedFiles = target.diff.changed_files.slice(0, 200)
  const symbols = target.symbols.slice(0, 200)
  const batches = target.batches.slice(0, 50).map((batch) => ({ ordinal: batch.ordinal, paths: batch.paths }))
  const diffText = target.diff.text.trim()
  const diffExcerpt = diffText.length > 12_000 ? `${diffText.slice(0, 12_000)}\n...[truncated]` : diffText

  return [
    "## REVIEW TARGET MATERIALIZATION",
    JSON.stringify(
      {
        mode: target.mode,
        review_scope_key: target.review_scope_key,
        suppression_scope_key: target.suppression_scope_key,
        ref_identity: target.ref_identity,
        changed_files: changedFiles,
        symbols,
        batches,
      },
      null,
      2,
    ),
    "## MATERIALIZED DIFF CONTEXT",
    diffExcerpt || "(repo-wide snapshot mode; no unified git diff text available)",
  ].join("\n")
}

function toPriorFindingsSection(priorFindings: PriorFindingHint[] | undefined): string | undefined {
  if (!priorFindings || priorFindings.length === 0) {
    return undefined
  }

  const cappedFindings = priorFindings.slice(0, 200)
  return [
    "## PRIOR FINDINGS (do not re-report)",
    ...cappedFindings.map((finding) => `- ${finding.fingerprint} | ${finding.title} | ${finding.summary}`),
  ].join("\n")
}

export function createStartReviewRuntimeLanePrompts(input: {
  wave: number
  mode: ReviewMode
  profile: ReviewProfileName
  target: MaterializedReviewTarget
  review_run_id: string
  prior_findings?: PriorFindingHint[]
}): Record<ReviewLaneName, string> {
  const groundedTarget = toGroundedTargetSection(input.target)
  const priorFindingsSection = toPriorFindingsSection(input.prior_findings)
  const basePrompt = [
    "Themis runtime review flow",
    `review_run_id=${input.review_run_id}`,
    `profile=${input.profile}`,
    `mode=${input.mode}`,
    `wave=${input.wave}`,
    `target_hash=${input.target.materialization.hash}`,
    groundedTarget,
    "Use grounded target material only; do not invent files or symbols.",
    "Return ONLY JSON (no prose, no markdown fence).",
    "JSON shape: {\"findings\":[{category,severity,confidence,title,summary,evidence:[{path,symbol?,start_line?,end_line?,hunk_header?,rationale?}],remediation:{intent,summary?}}]}",
    "If no findings, return {\"findings\":[]}",
    priorFindingsSection,
  ].join("\n")

  return {
    "argus-claude": `${basePrompt}\nlane=argus-claude`,
    "argus-gpt": `${basePrompt}\nlane=argus-gpt`,
  }
}
