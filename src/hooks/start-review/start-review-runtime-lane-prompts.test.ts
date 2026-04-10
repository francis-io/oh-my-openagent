import { describe, expect, test } from "bun:test"
import { createStartReviewRuntimeLanePrompts } from "./start-review-runtime-lane-prompts"

describe("start-review runtime lane prompts", () => {
  const target = {
    mode: "repo-wide",
    review_scope_key: "scope",
    suppression_scope_key: "suppression",
    ref_identity: { base_ref: null, head_ref: null },
    diff: { changed_files: ["src/a.ts"], text: "diff --git a/src/a.ts b/src/a.ts" },
    symbols: [],
    batches: [],
    materialization: { hash: "hash-1" },
  } as const

  test("wave one omits prior findings section", () => {
    const prompts = createStartReviewRuntimeLanePrompts({
      wave: 1,
      mode: "repo-wide",
      profile: "test",
      target: target as never,
      review_run_id: "run-1",
    })
    expect(prompts["argus-claude"]).not.toContain("PRIOR FINDINGS")
  })

  test("later waves include prior finding hints", () => {
    const prompts = createStartReviewRuntimeLanePrompts({
      wave: 2,
      mode: "repo-wide",
      profile: "test",
      target: target as never,
      review_run_id: "run-1",
      prior_findings: [
        { fingerprint: "f-1", title: "Duplicate 1", summary: "Already reported" },
        { fingerprint: "f-2", title: "Duplicate 2", summary: "Already reported too" },
      ],
    })
    expect(prompts["argus-claude"]).toContain("## PRIOR FINDINGS")
    expect(prompts["argus-claude"]).toContain("- f-1 | Duplicate 1 | Already reported")
    expect(prompts["argus-claude"]).toContain("- f-2 | Duplicate 2 | Already reported too")
  })
})
