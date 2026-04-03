import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
declare const require: (name: string) => any
const { describe, expect, test } = require("bun:test")
import { resolveReviewTarget } from "../review-target-resolution"
import { createInitialReviewState } from "../review-state"
import { mergeReviewFindings } from "./merge-findings"
import { writeCanonicalRemediationPlan } from "./write-remediation-plan"

describe("themis review smoke", () => {
  test("executes minimal plan+git-diff vertical slice", () => {
    const root = mkdtempSync(join(tmpdir(), "themis-review-smoke-"))

    try {
      const target = resolveReviewTarget(
        {
          mode: "plan+git-diff",
          project_root: root,
          review_scope_key: "scope-smoke",
          suppression_scope_key: "suppression-smoke",
          plan_path: join(root, ".sisyphus", "plans", "feature-a.md"),
          base_ref: "main",
          head_ref: "HEAD",
        },
        {
          git: (args) => {
            const command = args.join(" ")
            if (command.startsWith("diff --name-only")) {
              return "src/foo.ts"
            }
            return "diff --git a/src/foo.ts b/src/foo.ts\n@@ -1 +1 @@\n-a\n+b\n"
          },
          read_file: () => "export function foo() { return 1 }",
        },
      )
      const state = createInitialReviewState({
        review_run_id: "run-smoke",
        review_scope_key: target.review_scope_key,
        suppression_scope_key: target.suppression_scope_key,
        now: "2026-04-01T12:00:00.000Z",
      })
      const merge = mergeReviewFindings({
        profile: "test",
        wave: 1,
        state,
        lane_findings: [
          {
            lane: "argus",
            finding: {
              fingerprint: "f-smoke",
              suppression_identity: "f-smoke",
              category: "correctness",
              severity: "major",
              confidence: "high",
              title: "Smoke issue",
              summary: "Detected by smoke test",
              remediation_intent: "fix-smoke",
              evidence: [{ path: "src/foo.ts", start_line: 1, end_line: 1 }],
            },
          },
          {
            lane: "argus",
            finding: {
              fingerprint: "f-smoke",
              suppression_identity: "f-smoke",
              category: "correctness",
              severity: "major",
              confidence: "high",
              title: "Smoke issue",
              summary: "Detected by smoke test",
              remediation_intent: "fix-smoke",
              evidence: [{ path: "src/foo.ts", start_line: 1, end_line: 1 }],
            },
          },
        ],
      })
      const remediation = writeCanonicalRemediationPlan({
        project_root: root,
        review_run_id: state.review_run_id,
        review_scope_key: state.review_scope_key,
        suppression_scope_key: state.suppression_scope_key,
        generated_at: "2026-04-01T12:00:01.000Z",
        consensus_findings: merge.consensus_findings,
        accepted_open_findings: merge.carried_accepted_open_findings,
      })

      expect(target.mode).toBe("plan+git-diff")
      expect(target.plan_context?.role).toBe("context-only")
      expect(merge.consensus_findings).toHaveLength(1)
      expect(merge.conflicts_for_tie_break).toHaveLength(0)
      expect(remediation.canonical_path.endsWith(".sisyphus/plans/review-remediation-run-smoke.md")).toBe(true)
      expect(remediation.snapshot_path.endsWith(".sisyphus/reviews/run-smoke/remediation-plan.snapshot.md")).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
