export const START_REVIEW_TEMPLATE = `You are bootstrapping a Themis-led review session.

## ARGUMENTS

- \`/start-review [context]\`
  - Examples:
    - \`/start-review .sisyphus/plans/my-plan.md\`
    - \`/start-review .\`
    - \`/start-review repository-wide api and auth\`

## WHAT TO DO

1. Use the dedicated start-review hook-injected context to infer review mode.
2. If the hook marks the inference as ambiguous or soft, confirm intent through the existing \`question\` tool before starting review-target materialization.
3. Do not create review state or review artifacts before confirmation is complete when confirmation is required.
4. Hand off orchestration to Themis lifecycle flow using existing review modules (target resolution, state, routing, loop, merge/question, resume).

## OUTPUT

- Keep bootstrap output concise.
- Echo the inferred mode and reason.
- If confirmation is required, ask exactly once with the provided options order.
`
