import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export type MaterializedSymbol = {
  path: string
  symbol: string
  kind: "function" | "class" | "interface" | "type" | "const"
  line: number
}

const SYMBOL_PATTERNS: Array<{ kind: MaterializedSymbol["kind"]; regex: RegExp }> = [
  { kind: "function", regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/ },
  { kind: "class", regex: /^\s*(?:export\s+)?class\s+([A-Za-z0-9_$]+)/ },
  { kind: "interface", regex: /^\s*(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/ },
  { kind: "type", regex: /^\s*(?:export\s+)?type\s+([A-Za-z0-9_$]+)/ },
  { kind: "const", regex: /^\s*(?:export\s+)?const\s+([A-Za-z0-9_$]+)/ },
]

export function materializeSymbols(input: {
  project_root: string
  paths: string[]
  read_file?: (absolutePath: string) => string
}): MaterializedSymbol[] {
  const readFile = input.read_file ?? ((absolutePath: string) => readFileSync(absolutePath, "utf-8"))
  const symbols: MaterializedSymbol[] = []

  for (const path of input.paths) {
    const absolutePath = join(input.project_root, path)
    if (!existsSync(absolutePath)) {
      continue
    }

    let content = ""
    try {
      content = readFile(absolutePath)
    } catch (error) {
      void error
      continue
    }

    const lines = content.split("\n")
    for (const [index, line] of lines.entries()) {
      for (const entry of SYMBOL_PATTERNS) {
        const matched = line.match(entry.regex)
        if (matched) {
          symbols.push({
            path,
            symbol: matched[1],
            kind: entry.kind,
            line: index + 1,
          })
          break
        }
      }
    }
  }

  return symbols.sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path)
    if (pathCompare !== 0) {
      return pathCompare
    }

    const lineCompare = left.line - right.line
    if (lineCompare !== 0) {
      return lineCompare
    }

    return left.symbol.localeCompare(right.symbol)
  })
}
