import { Dirent, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { DEFAULT_OUT_OF_SCOPE_PATTERNS, REPO_WIDE_DEFAULT_EXCLUSIONS } from "./default-scope-rules"
import { matchesAnyGlob, toPosixPath } from "./path-glob"

export type ScopeRules = {
  include_paths: string[]
  exclude_paths: string[]
  default_exclusions: string[]
  out_of_scope_patterns: string[]
}

function sortedDirectoryEntries(root: string): Dirent[] {
  return readdirSync(root, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )
}

function collectFilesRecursively(projectRoot: string, currentDirectory: string, acc: string[], rules: ScopeRules): void {
  for (const entry of sortedDirectoryEntries(currentDirectory)) {
    const absolutePath = join(currentDirectory, entry.name)
    const relativePath = toPosixPath(relative(projectRoot, absolutePath))

    if (entry.isSymbolicLink()) {
      continue
    }

    if (entry.isDirectory()) {
      const explicitlyIncluded = rules.include_paths.length > 0 && matchesAnyGlob(`${relativePath}/`, rules.include_paths)
      const shouldSkipDir =
        !explicitlyIncluded &&
        (matchesAnyGlob(`${relativePath}/`, rules.default_exclusions) ||
          matchesAnyGlob(`${relativePath}/`, rules.exclude_paths) ||
          matchesAnyGlob(`${relativePath}/`, rules.out_of_scope_patterns))
      if (!shouldSkipDir) {
        collectFilesRecursively(projectRoot, absolutePath, acc, rules)
      }
      continue
    }

    if (entry.isFile()) {
      acc.push(relativePath)
    }
  }
}

function shouldIncludePath(path: string, rules: ScopeRules): boolean {
  const explicitlyIncluded = rules.include_paths.length > 0 && matchesAnyGlob(path, rules.include_paths)
  if (explicitlyIncluded) {
    return true
  }

  if (matchesAnyGlob(path, rules.exclude_paths)) {
    return false
  }

  if (matchesAnyGlob(path, rules.default_exclusions)) {
    return false
  }

  if (matchesAnyGlob(path, rules.out_of_scope_patterns)) {
    return false
  }

  return true
}

export function filterPathsByScope(paths: string[], rules: ScopeRules): {
  included_files: string[]
  excluded_files: string[]
} {
  const normalizedPaths = [...paths].map(toPosixPath)
  const includedFiles = normalizedPaths.filter((path) => shouldIncludePath(path, rules)).sort((left, right) =>
    left.localeCompare(right),
  )
  const excludedFiles = normalizedPaths.filter((path) => !includedFiles.includes(path)).sort((left, right) =>
    left.localeCompare(right),
  )

  return {
    included_files: includedFiles,
    excluded_files: excludedFiles,
  }
}

export function createScopeRules(input?: {
  include_paths?: string[]
  exclude_paths?: string[]
}): ScopeRules {
  return {
    include_paths: [...(input?.include_paths ?? [])].sort((left, right) => left.localeCompare(right)),
    exclude_paths: [...(input?.exclude_paths ?? [])].sort((left, right) => left.localeCompare(right)),
    default_exclusions: [...REPO_WIDE_DEFAULT_EXCLUSIONS],
    out_of_scope_patterns: [...DEFAULT_OUT_OF_SCOPE_PATTERNS],
  }
}

export function materializeFilesByScope(projectRoot: string, rules: ScopeRules): {
  all_files: string[]
  included_files: string[]
  excluded_files: string[]
} {
  const allFiles: string[] = []
  collectFilesRecursively(projectRoot, projectRoot, allFiles, rules)

  const filtered = filterPathsByScope(allFiles, rules)

  return {
    all_files: allFiles.sort((left, right) => left.localeCompare(right)),
    included_files: filtered.included_files,
    excluded_files: filtered.excluded_files,
  }
}

export function materializeDeterministicBatches(paths: string[], batchSize: number): string[][] {
  const normalizedBatchSize = Math.max(1, Math.floor(batchSize || 50))
  const sortedPaths = [...paths].sort((left, right) => left.localeCompare(right))
  const batches: string[][] = []

  for (let index = 0; index < sortedPaths.length; index += normalizedBatchSize) {
    batches.push(sortedPaths.slice(index, index + normalizedBatchSize))
  }

  return batches
}
