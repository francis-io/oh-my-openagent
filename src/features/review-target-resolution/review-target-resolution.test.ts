import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { REPO_WIDE_DEFAULT_EXCLUSIONS, resolveReviewTarget } from "./index"

const tempDirs: string[] = []

function createTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "omo-review-target-resolution-"))
  tempDirs.push(dir)
  return dir
}

function writeProjectFile(projectRoot: string, relativePath: string, content = ""): void {
  const absolutePath = join(projectRoot, relativePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content, "utf-8")
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe("review-target-resolution", () => {
  test("plan+diff resolves head_ref precedence over working tree materialization", () => {
    //#given
    const projectRoot = createTempProject()
    writeProjectFile(projectRoot, "src/a.ts", "export function alpha() { return 1 }\n")
    writeProjectFile(projectRoot, ".sisyphus/plans/plan.md", "# plan\n")

    const gitCalls: string[] = []
    const git = (args: string[]) => {
      const command = args.join(" ")
      gitCalls.push(command)
      if (command === "diff main...feature") return "@@ -1,1 +1,1 @@"
      if (command === "diff --name-only main...feature") return "src/a.ts\n.sisyphus/plans/plan.md"
      return ""
    }

    //#when
    const target = resolveReviewTarget(
      {
        mode: "plan+git-diff",
        project_root: projectRoot,
        review_scope_key: "scope-1",
        suppression_scope_key: "suppression-1",
        base_ref: "main",
        head_ref: "feature",
        plan_path: join(projectRoot, ".sisyphus/plans/plan.md"),
      },
      { git },
    )

    //#then
    expect(target.diff.source_kind).toBe("head_ref")
    expect(target.ref_identity).toEqual({ base_ref: "main", head_ref: "feature" })
    expect(gitCalls).toEqual(["diff main...feature", "diff --name-only main...feature"])
    expect(target.plan_context?.role).toBe("context-only")
    expect(target.diff.changed_files).toEqual(["src/a.ts"])
    expect(target.scope.excluded_files).toContain(".sisyphus/plans/plan.md")
  })

  test("plan+diff falls back to working tree materialization when head_ref is absent", () => {
    //#given
    const projectRoot = createTempProject()
    writeProjectFile(projectRoot, "src/a.ts", "export function alpha() { return 1 }\n")
    writeProjectFile(projectRoot, "docs/readme.md", "# docs\n")

    const git = (args: string[]) => {
      const command = args.join(" ")
      if (command === "diff main...HEAD") return "@@ -1,1 +1,2 @@"
      if (command === "diff --name-only main...HEAD") return "src/a.ts\ndocs/readme.md"
      if (command === "diff --cached") return ""
      if (command === "diff --cached --name-only") return ""
      if (command === "diff") return ""
      if (command === "diff --name-only") return ""
      return ""
    }

    //#when
    const target = resolveReviewTarget(
      {
        mode: "plan+git-diff",
        project_root: projectRoot,
        review_scope_key: "scope-2",
        suppression_scope_key: "suppression-2",
        base_ref: "main",
      },
      { git },
    )

    //#then
    expect(target.diff.source_kind).toBe("working_tree")
    expect(target.ref_identity).toEqual({ base_ref: "main", head_ref: null })
    expect(target.diff.source_commands.some((command) => command.includes("--cached"))).toBe(true)
    expect(target.diff.source_commands.some((command) => command === "git diff")).toBe(true)
    expect(target.diff.changed_files).toEqual(["src/a.ts"])
    expect(target.scope.excluded_files).toContain("docs/readme.md")
  })

  test("repo-wide scope applies locked exclusions and deterministic batch order", () => {
    //#given
    const projectRoot = createTempProject()
    writeProjectFile(projectRoot, "src/c.ts", "export const c = 3\n")
    writeProjectFile(projectRoot, "src/a.ts", "export const a = 1\n")
    writeProjectFile(projectRoot, "src/b.ts", "export const b = 2\n")
    writeProjectFile(projectRoot, "dist/bundle.js", "console.log('dist')\n")
    writeProjectFile(projectRoot, "local-ignore/dev.ts", "export const ignored = true\n")
    writeProjectFile(projectRoot, "docs/guide.md", "# guide\n")

    //#when
    const target = resolveReviewTarget({
      mode: "repo-wide",
      project_root: projectRoot,
      review_scope_key: "scope-3",
      suppression_scope_key: "suppression-3",
      batch_size: 2,
    })

    //#then
    expect(target.scope.default_exclusions).toEqual([...REPO_WIDE_DEFAULT_EXCLUSIONS])
    expect(target.ref_identity).toEqual({ base_ref: null, head_ref: null })
    expect(target.scope.included_files).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"])
    expect(target.batches).toEqual([
      { ordinal: 1, paths: ["src/a.ts", "src/b.ts"] },
      { ordinal: 2, paths: ["src/c.ts"] },
    ])
  })

  test("repo-wide explicit include can override default out-of-scope exclude rules", () => {
    //#given
    const projectRoot = createTempProject()
    writeProjectFile(projectRoot, "docs/design.md", "# design\n")
    writeProjectFile(projectRoot, "src/__fixtures__/sample.ts", "export const fixture = true\n")

    //#when
    const target = resolveReviewTarget({
      mode: "repo-wide",
      project_root: projectRoot,
      review_scope_key: "scope-4",
      suppression_scope_key: "suppression-4",
      include_paths: ["docs/**", "src/__fixtures__/**"],
    })

    //#then
    expect(target.scope.included_files).toEqual(["docs/design.md", "src/__fixtures__/sample.ts"])
  })

  test("scope materialization metadata is deterministic for equivalent inputs", () => {
    //#given
    const projectRoot = createTempProject()
    writeProjectFile(projectRoot, "src/a.ts", "export function alpha() { return 1 }\n")

    //#when
    const first = resolveReviewTarget({
      mode: "repo-wide",
      project_root: projectRoot,
      review_scope_key: "scope-5",
      suppression_scope_key: "suppression-5",
      now: "2026-04-01T00:00:00.000Z",
    })
    const second = resolveReviewTarget({
      mode: "repo-wide",
      project_root: projectRoot,
      review_scope_key: "scope-5",
      suppression_scope_key: "suppression-5",
      now: "2026-04-01T00:00:00.000Z",
    })

    //#then
    expect(first.materialization.seed).toBe(second.materialization.seed)
    expect(first.materialization.hash).toBe(second.materialization.hash)
    expect(first.batches).toEqual(second.batches)
  })
})
