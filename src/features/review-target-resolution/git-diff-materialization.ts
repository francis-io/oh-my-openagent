import { execFileSync } from "node:child_process"

export type GitCommandRunner = (args: string[]) => string

export type DiffMaterialization = {
  diff_source_kind: "head_ref" | "working_tree"
  commands: string[]
  diff_text: string
  changed_files: string[]
}

function parseLines(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function dedupeSorted(paths: string[]): string[] {
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right))
}

export function createDefaultGitRunner(projectRoot: string): GitCommandRunner {
  return (args) => {
    try {
      return execFileSync("git", args, {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 8000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trimEnd()
    } catch (error) {
      void error
      return ""
    }
  }
}

export function materializePlanDiff(input: {
  base_ref?: string
  head_ref?: string
  git: GitCommandRunner
}): DiffMaterialization {
  const baseRef = input.base_ref?.trim() || "HEAD"
  const headRef = input.head_ref?.trim()

  if (headRef) {
    const range = `${baseRef}...${headRef}`
    const diffCommand = ["diff", range]
    const namesCommand = ["diff", "--name-only", range]

    return {
      diff_source_kind: "head_ref",
      commands: [`git ${diffCommand.join(" ")}`, `git ${namesCommand.join(" ")}`],
      diff_text: input.git(diffCommand),
      changed_files: dedupeSorted(parseLines(input.git(namesCommand))),
    }
  }

  const committedDiffCommand = ["diff", `${baseRef}...HEAD`]
  const committedNamesCommand = ["diff", "--name-only", `${baseRef}...HEAD`]
  const stagedDiffCommand = ["diff", "--cached"]
  const stagedNamesCommand = ["diff", "--cached", "--name-only"]
  const unstagedDiffCommand = ["diff"]
  const unstagedNamesCommand = ["diff", "--name-only"]

  const committedDiff = input.git(committedDiffCommand)
  const stagedDiff = input.git(stagedDiffCommand)
  const unstagedDiff = input.git(unstagedDiffCommand)
  const diffText = [
    `### committed (${baseRef}...HEAD)`,
    committedDiff,
    "",
    "### staged (--cached)",
    stagedDiff,
    "",
    "### unstaged (working tree)",
    unstagedDiff,
  ]
    .join("\n")
    .trim()

  return {
    diff_source_kind: "working_tree",
    commands: [
      `git ${committedDiffCommand.join(" ")}`,
      `git ${committedNamesCommand.join(" ")}`,
      `git ${stagedDiffCommand.join(" ")}`,
      `git ${stagedNamesCommand.join(" ")}`,
      `git ${unstagedDiffCommand.join(" ")}`,
      `git ${unstagedNamesCommand.join(" ")}`,
    ],
    diff_text: diffText,
    changed_files: dedupeSorted([
      ...parseLines(input.git(committedNamesCommand)),
      ...parseLines(input.git(stagedNamesCommand)),
      ...parseLines(input.git(unstagedNamesCommand)),
    ]),
  }
}
