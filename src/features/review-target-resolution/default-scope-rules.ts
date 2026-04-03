export const REPO_WIDE_DEFAULT_EXCLUSIONS = [
  ".git/**",
  "node_modules/**",
  "dist/**",
  "coverage/**",
  ".sisyphus/reviews/**",
  ".sisyphus/evidence/**",
  "local-ignore/**",
] as const

export const DEFAULT_OUT_OF_SCOPE_PATTERNS = [
  "**/*.md",
  "**/*.mdx",
  "**/*.rst",
  "**/*.adoc",
  "**/*.txt",
  "**/*.snap",
  "**/*.min.js",
  "**/*.map",
  "**/*.generated.*",
  "**/generated/**",
  "**/__fixtures__/**",
  "**/fixtures/**",
  "**/tmp/**",
  "**/temp/**",
  "**/*.tmp",
  "**/*.temp",
  "**/*.bak",
] as const
