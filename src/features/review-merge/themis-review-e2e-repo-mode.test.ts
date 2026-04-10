declare const require: (name: string) => any
const { afterEach, describe, expect, test } = require("bun:test")
import { runReviewConvergenceLoop } from "../review-loop"
import { createInitialReviewState, assertReviewProfileInvariant } from "../review-state"
import { resolveReviewTarget } from "../review-target-resolution"
import { createPlanModeWaveFindingsForConvergence } from "./themis-review-e2e-fixtures"
import { cleanupTempProjects, createTempProject, writeProjectFile } from "./themis-review-e2e-test-helpers"

afterEach(() => {
  cleanupTempProjects()
})

describe("themis -> argus e2e (repo-wide mode)", () => {
  test("keeps deterministic production routing and profile lock", async () => {
    const root = createTempProject("themis-review-e2e-repo-")
    writeProjectFile(root, "src/a.ts", "export const a = 1\n")
    writeProjectFile(root, "src/b.ts", "export const b = 2\n")
    writeProjectFile(root, "dist/bundle.js", "ignored\n")

    const target = resolveReviewTarget({
      mode: "repo-wide",
      project_root: root,
      review_scope_key: "scope-repo",
      suppression_scope_key: "suppression-repo",
      batch_size: 1,
    })
    const state = createInitialReviewState({
      profile: "production",
      review_run_id: "run-repo",
      review_scope_key: target.review_scope_key,
      suppression_scope_key: target.suppression_scope_key,
      now: "2026-04-01T13:00:00.000Z",
    })
    assertReviewProfileInvariant(state, "production")

    const launches: Array<{ modelID?: string; variant?: string }> = []
    const convergence = await runReviewConvergenceLoop({
      state,
      profile: "production",
      pass_cap_override: 1,
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      manager: {
        launch: async (input: { model?: { modelID?: string; variant?: string } }) => {
          launches.push({ modelID: input.model?.modelID, variant: input.model?.variant })
          return { id: `bg_${launches.length}`, sessionID: `ses_${launches.length}` }
        },
      } as never,
      lanePromptsForWave: () => ({ "argus-claude": "repo-argus", "argus-gpt": "repo-argus" }),
      collectWaveFindings: () => createPlanModeWaveFindingsForConvergence(1).slice(0, 1),
      nowForWave: () => "2026-04-01T13:00:01.000Z",
    })

    expect(target.mode).toBe("repo-wide")
    expect(target.scope.included_files).toEqual(["src/a.ts", "src/b.ts"])
    expect(target.batches).toEqual([{ ordinal: 1, paths: ["src/a.ts"] }, { ordinal: 2, paths: ["src/b.ts"] }])
    expect(launches).toEqual([
      { modelID: "claude-opus-4-6", variant: "max" },
      { modelID: "gpt-5.4", variant: "high" },
    ])
    expect(convergence.stop_reason).toBe("pass-cap-reached")
  })
})
