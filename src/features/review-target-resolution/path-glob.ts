import { normalize } from "node:path"

function escapeRegexSegment(input: string): string {
  return input.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
}

function globToRegex(pattern: string): RegExp {
  const normalized = normalize(pattern).replace(/\\/g, "/")
  const escaped = escapeRegexSegment(normalized)
  const withDoubleStar = escaped.replace(/\*\*/g, "::DOUBLE_STAR::")
  const withSingleStar = withDoubleStar.replace(/\*/g, "[^/]*")
  const withAny = withSingleStar.replace(/::DOUBLE_STAR::/g, ".*")
  const withQuestion = withAny.replace(/\?/g, "[^/]")
  return new RegExp(`^${withQuestion}$`)
}

export function toPosixPath(path: string): string {
  return normalize(path).replace(/\\/g, "/").replace(/^\.\//, "")
}

export function matchesAnyGlob(path: string, patterns: readonly string[]): boolean {
  const normalizedPath = toPosixPath(path)
  return patterns.some((pattern) => {
    const normalizedPattern = toPosixPath(pattern)
    const anchoredPattern = normalizedPattern.startsWith("**/")
      ? normalizedPattern
      : `**/${normalizedPattern}`
    return globToRegex(anchoredPattern).test(normalizedPath) || globToRegex(normalizedPattern).test(normalizedPath)
  })
}
