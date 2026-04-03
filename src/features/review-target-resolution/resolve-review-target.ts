import { isAbsolute, relative, resolve } from "node:path"
import {
  createScopeRules,
  filterPathsByScope,
  materializeDeterministicBatches,
  materializeFilesByScope,
} from "./file-materialization"
import { createDefaultGitRunner, type GitCommandRunner, materializePlanDiff } from "./git-diff-materialization"
import { toPosixPath } from "./path-glob"
import { materializeSymbols } from "./symbol-materialization"
import {
  createMaterializationHash,
  MaterializedReviewTargetSchema,
  type MaterializedReviewTarget,
  type ReviewMode,
} from "./target-types"

type ResolveInput = {
  mode: ReviewMode
  project_root: string
  review_scope_key: string
  suppression_scope_key: string
  plan_path?: string
  base_ref?: string
  head_ref?: string
  include_paths?: string[]
  exclude_paths?: string[]
  batch_size?: number
  now?: string
}

function toRelativeProjectPath(projectRoot: string, path: string): string {
  const absolutePath = isAbsolute(path) ? path : resolve(projectRoot, path)
  return toPosixPath(relative(projectRoot, absolutePath))
}

export function resolveReviewTarget(
  input: ResolveInput,
  deps?: {
    git?: GitCommandRunner
    read_file?: (absolutePath: string) => string
  },
): MaterializedReviewTarget {
  const now = input.now ?? new Date().toISOString()
  const scope = createScopeRules({
    include_paths: input.include_paths,
    exclude_paths: input.exclude_paths,
  })

  if (input.mode === "repo-wide") {
    const files = materializeFilesByScope(input.project_root, scope)
    const symbols = materializeSymbols({
      project_root: input.project_root,
      paths: files.included_files,
      read_file: deps?.read_file,
    })
    const batches = materializeDeterministicBatches(files.included_files, input.batch_size ?? 50).map(
      (paths, index) => ({ ordinal: index + 1, paths }),
    )
    const seed = createMaterializationHash({
      mode: input.mode,
      include_paths: scope.include_paths,
      exclude_paths: scope.exclude_paths,
      review_scope_key: input.review_scope_key,
      suppression_scope_key: input.suppression_scope_key,
    })

    const target = {
      version: 1,
      mode: input.mode,
      review_scope_key: input.review_scope_key,
      suppression_scope_key: input.suppression_scope_key,
      ref_identity: {
        base_ref: null,
        head_ref: null,
      },
      generated_at: now,
      ...(input.plan_path
        ? {
            plan_context: {
              plan_path: toRelativeProjectPath(input.project_root, input.plan_path),
              role: "context-only" as const,
            },
          }
        : {}),
      diff: {
        source_kind: "repo_snapshot" as const,
        source_commands: ["snapshot:repo-wide"],
        text: "",
        changed_files: files.included_files,
      },
      scope: {
        include_paths: scope.include_paths,
        exclude_paths: scope.exclude_paths,
        default_exclusions: scope.default_exclusions,
        out_of_scope_patterns: scope.out_of_scope_patterns,
        included_files: files.included_files,
        excluded_files: files.excluded_files,
      },
      symbols,
      batches,
      materialization: {
        deterministic_sort: "path-lexicographic" as const,
        batch_size: Math.max(1, Math.floor(input.batch_size ?? 50)),
        seed,
        hash: createMaterializationHash({
          mode: input.mode,
          changed_files: files.included_files,
          symbols,
          batches,
          scope,
          seed,
        }),
      },
    }

    return MaterializedReviewTargetSchema.parse(target)
  }

  const git = deps?.git ?? createDefaultGitRunner(input.project_root)
  const diff = materializePlanDiff({
    base_ref: input.base_ref,
    head_ref: input.head_ref,
    git,
  })

  const planContextPath = input.plan_path ? toRelativeProjectPath(input.project_root, input.plan_path) : undefined
  const planContextWasPresent = Boolean(planContextPath && diff.changed_files.includes(planContextPath))
  const changedFilesWithoutPlan = diff.changed_files.filter((path) => path !== planContextPath)
  const filteredChangedFiles = filterPathsByScope(changedFilesWithoutPlan, scope)
  const includedFiles = filteredChangedFiles.included_files

  const symbols = materializeSymbols({
    project_root: input.project_root,
    paths: includedFiles,
    read_file: deps?.read_file,
  })
  const batches = materializeDeterministicBatches(includedFiles, input.batch_size ?? 50).map((paths, index) => ({
    ordinal: index + 1,
    paths,
  }))
  const seed = createMaterializationHash({
    mode: input.mode,
    base_ref: input.base_ref ?? "HEAD",
    head_ref: input.head_ref ?? null,
    include_paths: scope.include_paths,
    exclude_paths: scope.exclude_paths,
    review_scope_key: input.review_scope_key,
    suppression_scope_key: input.suppression_scope_key,
  })

  const target = {
    version: 1,
    mode: input.mode,
    review_scope_key: input.review_scope_key,
    suppression_scope_key: input.suppression_scope_key,
    ref_identity: {
      base_ref: input.base_ref ?? "HEAD",
      head_ref: input.head_ref ?? null,
    },
    generated_at: now,
    ...(planContextPath
      ? {
          plan_context: {
            plan_path: planContextPath,
            role: "context-only" as const,
          },
        }
      : {}),
    diff: {
      source_kind: diff.diff_source_kind,
      source_commands: diff.commands,
      text: diff.diff_text,
      changed_files: includedFiles,
    },
    scope: {
      include_paths: scope.include_paths,
      exclude_paths: scope.exclude_paths,
      default_exclusions: scope.default_exclusions,
      out_of_scope_patterns: scope.out_of_scope_patterns,
      included_files: includedFiles,
      excluded_files: [
        ...filteredChangedFiles.excluded_files,
        ...(planContextWasPresent && planContextPath ? [planContextPath] : []),
      ].sort((left, right) => left.localeCompare(right)),
    },
    symbols,
    batches,
    materialization: {
      deterministic_sort: "path-lexicographic" as const,
      batch_size: Math.max(1, Math.floor(input.batch_size ?? 50)),
      seed,
      hash: createMaterializationHash({
        mode: input.mode,
        source_kind: diff.diff_source_kind,
        source_commands: diff.commands,
        changed_files: includedFiles,
        symbols,
        batches,
        scope,
        seed,
      }),
    },
  }

  return MaterializedReviewTargetSchema.parse(target)
}
