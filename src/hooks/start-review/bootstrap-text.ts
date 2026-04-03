import type { StartReviewModeInference } from "./mode-inference"

export function createConfirmationBlock(inference: StartReviewModeInference): string {
  const [firstOption, secondOption] = inference.options
  const planHintLine = inference.plan_path_hint
    ? `- Plan cue: \`${inference.plan_path_hint}\``
    : ""

  return `
## Review Mode Confirmation Required

Inference summary:
- Requested input: \`${inference.requested_input || "(empty)"}\`
- Inferred mode: \`${inference.mode}\`
- Signal strength: \`${inference.strength}\`
- Reason: ${inference.reason}
${planHintLine}

Before review-target materialization, call the existing \`question\` tool with exactly these options in this exact order:
1. ${firstOption}
2. ${secondOption}

Question text: "I inferred ${inference.mode} review from your start-review input. Confirm how you want this run to proceed."

Do not create review state, review artifacts, or suppression updates until this confirmation is answered.`
}

export function createDirectBootstrapBlock(inference: StartReviewModeInference): string {
  const planHintLine = inference.plan_path_hint
    ? `- Plan cue: \`${inference.plan_path_hint}\``
    : ""

  return `
## Review Bootstrap

Inference summary:
- Requested input: \`${inference.requested_input || "(empty)"}\`
- Inferred mode: \`${inference.mode}\`
- Reason: ${inference.reason}
${planHintLine}

Proceed with Themis review coordination using existing review-target-resolution, review-state, review-routing, review-loop, and review-merge/question contracts.`
}

export function createRuntimeBootstrapBlock(result: {
  started: boolean
  profile: string
  mode: string
  review_run_id: string
  review_root_relative_path: string
  stop_reason?: string | null
  final_conflict_count: number
  remediation_plan_relative_path: string
  target_materialization_hash?: string | null
}): string {
  return `
## Runtime Review Bootstrap

- Runtime started: \`${result.started}\`
- Active profile: \`${result.profile}\`
- Runtime mode: \`${result.mode}\`
- Review run id: \`${result.review_run_id}\`
- Review artifacts root: \`${result.review_root_relative_path}\`
- Convergence stop reason: \`${result.stop_reason ?? "none"}\`
- Final conflict count: \`${result.final_conflict_count}\`
- Remediation plan: \`${result.remediation_plan_relative_path}\`
${result.target_materialization_hash ? `- Target materialization hash: \`${result.target_materialization_hash}\`` : ""}

The start-review command has already materialized target/state and executed convergence + merge/question/remediation orchestration via the live runtime path.`
}

export function createAsyncRuntimeBootstrapBlock(input: {
  review_run_id: string
  profile: string
  mode: string
}): string {
  return `
## Runtime Review Bootstrap

- Runtime start requested: \`true\`
- Active profile: \`${input.profile}\`
- Runtime mode: \`${input.mode}\`
- Review run id: \`${input.review_run_id}\`
- Review artifacts root: \`.sisyphus/reviews/${input.review_run_id}\`
- Remediation plan (when complete): \`.sisyphus/plans/review-remediation-${input.review_run_id}.md\`

The runtime review has been launched asynchronously so the session body stays visible while Themis coordinates the review in the background.`
}

export function createFinalAdjudicationResolvedBlock(input: {
  review_run_id: string
  selected_options: string[]
}): string {
  return `
## Final Review Adjudication Resolved

- Review run id: \`${input.review_run_id}\`
- Applied decisions: ${input.selected_options.map((option) => `\`${option}\``).join(", ")}

Pending final conflicts were applied to review state and the canonical remediation plan has been regenerated.`
}

export function createDirectStartReviewPreamble(requestedInput: string): string {
  return [
    "You are bootstrapping a Themis-led review session.",
    "",
    `The user invoked /start-review${requestedInput ? ` ${requestedInput}` : ""}.`,
  ].join("\n")
}

export function createDirectStartReviewVisiblePrompt(input: {
  requestedInput: string
  notification: string
}): string {
  return [
    "You are Themis, the native top-level review coordinator.",
    "",
    "The user has just invoked /start-review.",
    input.requestedInput ? `Requested review: ${input.requestedInput}` : "Requested review: (empty)",
    "",
    "Respond to the user with the following markdown block exactly and nothing else:",
    input.notification,
  ].join("\n")
}

export function createDirectStartReviewStatusMessage(input: {
  review_run_id: string
  profile: string
  mode: string
}): string {
  return [
    "<system-reminder>",
    "[START-REVIEW BOOTSTRAP]",
    "",
    `- Review run id: \`${input.review_run_id}\``,
    `- Active profile: \`${input.profile}\``,
    `- Runtime mode: \`${input.mode}\``,
    `- Review artifacts root: \`.sisyphus/reviews/${input.review_run_id}\``,
    "",
    "Themis has started the review runtime asynchronously. Visible progress and completion updates will appear in this session.",
    "</system-reminder>",
  ].join("\n")
}
