import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
declare const require: (name: string) => any
const { describe, expect, test } = require("bun:test")
import { writeCanonicalRemediationPlan } from "./write-remediation-plan"

describe("writeCanonicalRemediationPlan", () => {
  test("writes canonical remediation path and review snapshot path", () => {
    const root = mkdtempSync(join(tmpdir(), "themis-remediation-"))

    try {
      const output = writeCanonicalRemediationPlan({
        project_root: root,
        review_run_id: "run-123",
        review_scope_key: "scope-a",
        suppression_scope_key: "suppression-a",
        generated_at: "2026-04-01T10:00:00.000Z",
        consensus_findings: [
          {
            fingerprint: "f-consensus",
            source_lanes: ["argus"],
            finding: {
              fingerprint: "f-consensus",
              suppression_identity: "f-consensus",
              category: "correctness",
              severity: "major",
              confidence: "high",
              title: "Consensus issue",
              summary: "Consensus summary",
              remediation_intent: "fix-consensus",
              evidence: [{ path: "src/a.ts" }],
            },
          },
        ],
        accepted_open_findings: [
          {
            fingerprint: "f-accepted",
            suppression_identity: "f-accepted",
            category: "best-practice",
            severity: "minor",
            confidence: "high",
            title: "Accepted open issue",
            summary: "Accepted open summary",
            remediation_intent: "keep-visible",
            evidence: [{ path: "src/b.ts" }],
            state: "accepted_open",
            first_seen_at: "2026-04-01T09:00:00.000Z",
            updated_at: "2026-04-01T09:00:00.000Z",
            state_events: [{ to: "accepted_open", at: "2026-04-01T09:00:00.000Z" }],
            seen_by: [],
          },
        ],
      })

      const canonicalContent = readFileSync(output.canonical_path, "utf-8")
      const snapshotContent = readFileSync(output.snapshot_path, "utf-8")
      const referencePath = join(root, ".sisyphus", "reviews", "run-123", "canonical-remediation-path.txt")

      expect(output.canonical_path).toBe(
        join(root, ".sisyphus", "plans", "review-remediation-run-123.md"),
      )
      expect(output.snapshot_path).toBe(
        join(root, ".sisyphus", "reviews", "run-123", "remediation-plan.snapshot.md"),
      )
      expect(existsSync(referencePath)).toBe(true)
      expect(canonicalContent).toContain("f-consensus")
      expect(canonicalContent).toContain("f-accepted")
      expect(canonicalContent).toContain("state: accepted_open")
      expect(snapshotContent).toBe(canonicalContent)
      expect(readFileSync(referencePath, "utf-8")).toBe(output.canonical_path)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("renders seen_by from persisted findings sorted by wave then lane", () => {
    const root = mkdtempSync(join(tmpdir(), "themis-remediation-seen-by-"))

    try {
      const output = writeCanonicalRemediationPlan({
        project_root: root,
        review_run_id: "run-seen-by",
        review_scope_key: "scope-seen-by",
        suppression_scope_key: "suppression-seen-by",
        generated_at: "2026-04-01T10:00:00.000Z",
        consensus_findings: [
          {
            fingerprint: "f-consensus",
            source_lanes: ["argus"],
            finding: {
              fingerprint: "f-consensus",
              suppression_identity: "f-consensus",
              category: "correctness",
              severity: "major",
              confidence: "high",
              title: "Consensus issue",
              summary: "Consensus summary",
              remediation_intent: "fix-consensus",
              evidence: [{ path: "src/a.ts" }],
            },
          },
        ],
        accepted_open_findings: [],
        persisted_findings: {
          "f-consensus": {
            seen_by: [
              { lane: "argus", wave: 3 },
              { lane: "argus", wave: 2 },
              { lane: "argus", wave: 2 },
            ],
          },
        },
      })

      const canonicalContent = readFileSync(output.canonical_path, "utf-8")

      expect(canonicalContent).toContain(
        "- seen_by: argus (wave 2), argus (wave 2), argus (wave 3)",
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("omits seen_by line when persisted findings are not provided", () => {
    const root = mkdtempSync(join(tmpdir(), "themis-remediation-no-seen-by-"))

    try {
      const output = writeCanonicalRemediationPlan({
        project_root: root,
        review_run_id: "run-no-seen-by",
        review_scope_key: "scope-no-seen-by",
        suppression_scope_key: "suppression-no-seen-by",
        generated_at: "2026-04-01T10:00:00.000Z",
        consensus_findings: [
          {
            fingerprint: "f-consensus",
            source_lanes: ["argus"],
            finding: {
              fingerprint: "f-consensus",
              suppression_identity: "f-consensus",
              category: "correctness",
              severity: "major",
              confidence: "high",
              title: "Consensus issue",
              summary: "Consensus summary",
              remediation_intent: "fix-consensus",
              evidence: [{ path: "src/a.ts" }],
            },
          },
        ],
        accepted_open_findings: [],
      })

      expect(readFileSync(output.canonical_path, "utf-8")).not.toContain("- seen_by:")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("writes explicit empty output when no findings are present", () => {
    const root = mkdtempSync(join(tmpdir(), "themis-remediation-empty-"))

    try {
      const output = writeCanonicalRemediationPlan({
        project_root: root,
        review_run_id: "run-empty",
        review_scope_key: "scope-empty",
        suppression_scope_key: "suppression-empty",
        generated_at: "2026-04-01T10:00:00.000Z",
        consensus_findings: [],
        accepted_open_findings: [],
      })

      const canonicalContent = readFileSync(output.canonical_path, "utf-8")
      expect(canonicalContent).toContain("No remediation findings were emitted.")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
