import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { createInitialReviewState } from "../../features/review-state"
import { createReviewArtifactPaths } from "../../features/review-artifacts"
import { collectRuntimeLaneFindingsForWave } from "./start-review-runtime-lane-findings"

function writeProjectFile(root: string, relativePath: string, content: string): void {
  const absolutePath = join(root, relativePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content, "utf-8")
}

describe("start-review runtime lane persistence", () => {
  test("writes raw markdown and validated json for each lane", async () => {
    const root = mkdtempSync(join(tmpdir(), "start-review-runtime-lane-persist-"))
    writeProjectFile(root, "src/a.ts", "export const a = 1\n")

    const state = createInitialReviewState({
      profile: "test",
      review_run_id: "run-1",
      coordinator_session_id: "ses-main",
      review_scope_key: "repo-wide",
      suppression_scope_key: "repo-wide",
      ref_identity: { base_ref: null, head_ref: null },
      now: "2026-04-01T10:00:00.000Z",
    })
    state.lane_lineage_by_wave["1"] = [
      {
        invocation_type: "lane",
        profile: "test",
        wave: 1,
        role: "argus-lane",
        lane: "argus",
        lock_marker: "lock-1",
        model_tuple: { agent: "argus", provider: "openai", model: "gpt-5.4", variant: "xhigh", reasoningEffort: "xhigh" },
        surface: "task-background",
        task_id: "task-gpt",
        session_id: "ses-task-gpt",
        created_at: "2026-04-01T10:00:00.000Z",
      },
      {
        invocation_type: "lane",
        profile: "test",
        wave: 1,
        role: "argus-lane",
        lane: "argus",
        lock_marker: "lock-2",
        model_tuple: { agent: "argus", provider: "anthropic", model: "claude-opus-4-6", variant: "max", thinking: { type: "enabled", budgetTokens: 32000 } },
        surface: "task-background",
        task_id: "task-claude",
        session_id: "ses-task-claude",
        created_at: "2026-04-01T10:00:00.000Z",
      },
    ]

    const payload = JSON.stringify({
      findings: [{
        category: "correctness",
        severity: "major",
        confidence: "high",
        title: "runtime",
        summary: "runtime",
        evidence: [{ path: "src/a.ts", start_line: 1, end_line: 1 }],
        remediation: { intent: "fix-runtime" },
      }],
    })
    const tasks = new Map([
      ["task-gpt", { id: "task-gpt", status: "completed", result: payload }],
      ["task-claude", { id: "task-claude", status: "completed", result: payload }],
    ])
    const paths = createReviewArtifactPaths({
      projectRoot: root,
      review_run_id: "run-1",
      review_scope_key: "repo-wide",
      suppression_scope_key: "repo-wide",
    })

    const findings = await collectRuntimeLaneFindingsForWave({
      wave: 1,
      state,
      manager: { launch: async () => { throw new Error("unused") }, getTask: (id: string) => tasks.get(id) } as never,
      paths,
    })

    expect(findings).toHaveLength(2)
    expect(readFileSync(paths.lanePassMarkdownPath("argus", 1), "utf-8")).toContain("findings")
    expect(JSON.parse(readFileSync(paths.lanePassJsonPath("argus", 1), "utf-8"))).toHaveLength(1)

    rmSync(root, { recursive: true, force: true })
  })
})
