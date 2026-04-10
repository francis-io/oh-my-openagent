declare const require: (name: string) => any
const { afterEach, describe, expect, test } = require("bun:test")
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runReviewConvergenceLoop } from "../review-loop"
import { buildFinalQuestionBatch } from "../review-questions"
import {
  createInitialReviewState,
  normalizeReviewStateForResumeAtPassBoundary,
  readReviewState,
  withPendingFinalConflictBatch,
  writeReviewStateAtomic,
} from "../review-state"
import { resolveReviewTarget, writeMaterializedReviewTargetAtomic } from "../review-target-resolution"
import { createReviewArtifactPaths } from "../review-artifacts"
import { mergeReviewFindings, writeCanonicalRemediationPlan } from "./index"
import {
  createPlanModeWaveFindingsForConvergence,
  createPlanModeWaveOneLaneFindings,
  seedSuppressionLifecycleState,
} from "./themis-review-e2e-fixtures"
import { cleanupTempProjects, createTempProject, writeProjectFile } from "./themis-review-e2e-test-helpers"

afterEach(() => {
  cleanupTempProjects()
})

describe("themis -> argus e2e (plan mode)", () => {
  test("covers routing, convergence, tie-break, suppression, restart, and remediation output", async () => {
    const root = createTempProject("themis-review-e2e-plan-")
    writeProjectFile(root, "src/review-flow.ts", "export const reviewFlow = () => true\n")
    writeProjectFile(root, ".sisyphus/plans/feature.md", "# feature\n")

    const target = resolveReviewTarget(
      {
        mode: "plan+git-diff",
        project_root: root,
        review_scope_key: "scope-plan",
        suppression_scope_key: "suppression-plan",
        plan_path: join(root, ".sisyphus/plans/feature.md"),
        base_ref: "main",
        head_ref: "feature/themis",
      },
      {
        git: (args) => {
          const command = args.join(" ")
          if (command === "diff main...feature/themis") {
            return "diff --git a/src/review-flow.ts b/src/review-flow.ts"
          }
          if (command === "diff --name-only main...feature/themis") {
            return "src/review-flow.ts\n.sisyphus/plans/feature.md"
          }
          return ""
        },
      },
    )

    const artifacts = createReviewArtifactPaths({
      projectRoot: root,
      review_run_id: "run-plan",
      review_scope_key: target.review_scope_key,
      suppression_scope_key: target.suppression_scope_key,
    })
    writeMaterializedReviewTargetAtomic(artifacts.targetPath, target)

    const state = createInitialReviewState({
      profile: "test",
      review_run_id: "run-plan",
      review_scope_key: target.review_scope_key,
      suppression_scope_key: target.suppression_scope_key,
      now: "2026-04-01T12:00:00.000Z",
    })
    seedSuppressionLifecycleState(state)

    const launches: Array<{ description: string; modelID?: string; variant?: string; reasoningEffort?: string; thinking?: { type: string; budgetTokens?: number } }> = []
    const convergence = await runReviewConvergenceLoop({
      state,
      profile: "test",
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      manager: {
        launch: async (input: {
          description: string
          model?: {
            modelID?: string
            variant?: string
            reasoningEffort?: string
            thinking?: { type: string; budgetTokens?: number }
          }
        }) => {
          launches.push({
            description: input.description,
            modelID: input.model?.modelID,
            variant: input.model?.variant,
            reasoningEffort: input.model?.reasoningEffort,
            thinking: input.model?.thinking,
          })
          return { id: `bg_${launches.length}`, sessionID: `ses_${launches.length}` }
        },
      } as never,
      lanePromptsForWave: (wave) => ({ "argus-claude": `argus-claude-${wave}`, "argus-gpt": `argus-gpt-${wave}` }),
      collectWaveFindings: ({ wave }) => createPlanModeWaveFindingsForConvergence(wave),
      nowForWave: (wave) => `2026-04-01T12:00:0${wave}.000Z`,
    })

    const merge = mergeReviewFindings({
      profile: "test",
      wave: 1,
      state: convergence.state,
      lane_findings: createPlanModeWaveOneLaneFindings(),
    })
    const batch = buildFinalQuestionBatch({
      state: convergence.state,
      unresolved_conflicts: [
        { fingerprint: "f-dismissed", summary: "suppressed", options: ["dismiss", "accept"] },
        { fingerprint: "f-accepted-open", summary: "already accepted", options: ["dismiss", "accept"] },
        { fingerprint: "f-conflict", summary: "requires tie-break", options: ["major", "blocking"] },
      ],
    })

    const withBatch = withPendingFinalConflictBatch(convergence.state, batch ?? undefined, "2026-04-01T12:00:09.000Z")
    withBatch.lane_lineage_by_wave["99"] = withBatch.lane_lineage_by_wave["2"] ?? []
    withBatch.locked_role_invocations.push({ ...withBatch.locked_role_invocations[0]!, wave: 99 })
    writeReviewStateAtomic(artifacts.statePath, withBatch)
    const restarted = normalizeReviewStateForResumeAtPassBoundary(readReviewState(artifacts.statePath)!, "2026-04-01T12:00:10.000Z")

    const remediation = writeCanonicalRemediationPlan({
      project_root: root,
      review_run_id: withBatch.review_run_id,
      review_scope_key: withBatch.review_scope_key,
      suppression_scope_key: withBatch.suppression_scope_key,
      generated_at: "2026-04-01T12:00:11.000Z",
      consensus_findings: merge.consensus_findings,
      accepted_open_findings: merge.carried_accepted_open_findings,
    })

    expect(target.mode).toBe("plan+git-diff")
    expect(target.plan_context?.role).toBe("context-only")
    expect(target.diff.changed_files).toEqual(["src/review-flow.ts"])
    expect(convergence.stop_reason).toBe("dry-wave-complete")
    expect(launches).toEqual([
      { description: "argus argus-claude wave 1", modelID: "anthropic.claude-opus-4-6-v1", variant: "max", reasoningEffort: undefined, thinking: { type: "enabled", budgetTokens: 32000 } },
      { description: "argus argus-gpt wave 1", modelID: "gpt-5.4", variant: "high", reasoningEffort: "high", thinking: undefined },
      { description: "argus argus-claude wave 2", modelID: "anthropic.claude-opus-4-6-v1", variant: "max", reasoningEffort: undefined, thinking: { type: "enabled", budgetTokens: 32000 } },
      { description: "argus argus-gpt wave 2", modelID: "gpt-5.4", variant: "high", reasoningEffort: "high", thinking: undefined },
      { description: "argus argus-claude wave 3", modelID: "anthropic.claude-opus-4-6-v1", variant: "max", reasoningEffort: undefined, thinking: { type: "enabled", budgetTokens: 32000 } },
      { description: "argus argus-gpt wave 3", modelID: "gpt-5.4", variant: "high", reasoningEffort: "high", thinking: undefined },
    ])
    expect(merge.consensus_findings.map((entry) => entry.fingerprint)).toEqual(["f-conflict", "f-consensus"])
    expect(merge.conflicts_for_tie_break).toHaveLength(0)
    expect(merge.tie_break_route.model_tuple).toEqual({ agent: "oracle", provider: "openai", model: "gpt-5.4", variant: "xhigh", reasoningEffort: "xhigh" })
    expect(merge.suppressed_dismissed_fingerprints).toEqual(["f-dismissed"])
    expect(merge.carried_accepted_open_findings.map((entry) => entry.fingerprint)).toEqual(["f-accepted-open"])
    expect(batch?.conflicts.map((entry) => entry.fingerprint)).toEqual(["f-conflict"])
    expect(batch?.conflicts[0]?.options).toContain("Dismiss finding")
    expect(restarted.phase).toBe("tie_break_pending")
    expect(Object.keys(restarted.lane_lineage_by_wave)).toEqual(["1", "2", "3"])
    expect(restarted.locked_role_invocations.every((record) => record.wave <= 3)).toBe(true)
    expect(readFileSync(remediation.canonical_path, "utf-8")).toContain("f-consensus")
    expect(readFileSync(remediation.canonical_path, "utf-8")).toContain("f-accepted-open")
  })
})
