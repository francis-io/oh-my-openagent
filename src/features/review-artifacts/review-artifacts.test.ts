import { describe, expect, test } from "bun:test"
import { buildFindingFingerprint, buildSuppressionIdentity } from "./finding-fingerprint"
import { normalizeFinding } from "./finding-schema"
import { sanitizeLaneName } from "./lane-name"
import { createReviewArtifactPaths } from "./review-artifact-paths"

describe("review-artifacts", () => {
  test("sanitizes lane names deterministically", () => {
    //#given
    const laneName = "  Argus Lane / GPT-5.4 🔍  "

    //#when
    const first = sanitizeLaneName(laneName)
    const second = sanitizeLaneName(laneName)

    //#then
    expect(first).toBe("argus-lane-gpt-5.4")
    expect(second).toBe(first)
  })

  test("derives deterministic artifact paths from run and scope identities", () => {
    //#given
    const input = {
      projectRoot: "/repo",
      review_run_id: "run-2026-04-01",
      review_scope_key: "feature-auth-flow",
      suppression_scope_key: "branch-main-auth",
    }

    //#when
    const paths = createReviewArtifactPaths(input)

    //#then
    expect(paths.reviewRootDir).toBe("/repo/.sisyphus/reviews/run-2026-04-01")
    expect(paths.targetPath).toBe("/repo/.sisyphus/reviews/run-2026-04-01/target.json")
    expect(paths.statePath).toBe("/repo/.sisyphus/reviews/run-2026-04-01/state.json")
    expect(paths.mergedFindingsPath).toBe("/repo/.sisyphus/reviews/run-2026-04-01/merged-findings.json")
    expect(paths.conflictsPath).toBe("/repo/.sisyphus/reviews/run-2026-04-01/conflicts.json")
    expect(paths.remediationPlanSnapshotPath).toBe(
      "/repo/.sisyphus/reviews/run-2026-04-01/remediation-plan.snapshot.md",
    )
    expect(paths.canonicalRemediationPathRefPath).toBe(
      "/repo/.sisyphus/reviews/run-2026-04-01/canonical-remediation-path.txt",
    )
    expect(paths.lanePassJsonPath("Argus Lane #1", 2)).toBe(
      "/repo/.sisyphus/reviews/run-2026-04-01/lanes/argus-lane-1/pass-2.json",
    )
    expect(paths.lanePassMarkdownPath("Argus Lane #1", 2)).toBe(
      "/repo/.sisyphus/reviews/run-2026-04-01/lanes/argus-lane-1/pass-2.md",
    )
    expect(paths.review_scope_key).toBe("feature-auth-flow")
    expect(paths.suppression_scope_key).toBe("branch-main-auth")
    expect(paths.statePath.includes("scope-")).toBe(false)
    expect(paths.statePath.includes("suppression-")).toBe(false)
  })

  test("normalizes finding schema and creates stable fingerprint/suppression identity", () => {
    //#given
    const first = normalizeFinding({
      category: "correctness",
      severity: "major",
      confidence: "high",
      title: "Null check missing",
      summary: "A null guard is missing before reading config.user.id",
      evidence: [
        {
          path: "src/foo.ts",
          symbol: "applyConfig",
          start_line: 21,
          end_line: 26,
          rationale: "could throw when config.user is undefined",
        },
      ],
      remediation: {
        intent: "add-null-guard",
        summary: "Check config.user before dereferencing",
      },
    })

    const second = normalizeFinding({
      category: "correctness",
      severity: "major",
      confidence: "high",
      title: "Potential crash",
      summary: "Different prose should not affect identity",
      evidence: [
        {
          path: "src/foo.ts",
          symbol: "applyConfig",
          start_line: 21,
          end_line: 26,
          rationale: "different wording",
        },
      ],
      remediation: {
        intent: "add-null-guard",
        summary: "Alternative wording",
      },
    })

    //#then
    expect(first.fingerprint).toBe(second.fingerprint)
    expect(first.suppression_identity).toBe(second.suppression_identity)
  })

  test("treats empty-string fingerprint and suppression_identity as absent", () => {
    const normalized = normalizeFinding({
      category: "correctness",
      severity: "major",
      confidence: "high",
      title: "Blank identity fields",
      summary: "Producer emitted empty identity strings",
      evidence: [{ path: "src/foo.ts", start_line: 1, end_line: 2 }],
      remediation: { intent: "add-guard" },
      fingerprint: "",
      suppression_identity: "",
    })

    expect(normalized.fingerprint).toBeTruthy()
    expect(normalized.suppression_identity).toBeTruthy()
  })

  test("fingerprint construction ignores reviewer prose and remains stable", () => {
    //#given
    const base = {
      category: "best-practice",
      remediation_intent: "dedupe-cache-entry",
      anchors: [
        {
          path: "src/cache.ts",
          symbol: "buildCache",
          start_line: 80,
          end_line: 114,
        },
      ],
    } as const

    //#when
    const fingerprint = buildFindingFingerprint(base)
    const suppressionIdentity = buildSuppressionIdentity(base)

    //#then
    expect(fingerprint).toBe(suppressionIdentity)
    expect(fingerprint).toHaveLength(64)
  })
})
