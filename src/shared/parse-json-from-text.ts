function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (_parseError: unknown) {
    return { ok: false }
  }
}

function isEscaped(text: string, index: number): boolean {
  let backslashCount = 0
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
    backslashCount += 1
  }
  return backslashCount % 2 === 1
}

function extractBalancedJson(text: string, open: string, close: string, anchor?: string): string | undefined {
  const searchStart = anchor ? text.indexOf(anchor) : text.indexOf(open)
  if (searchStart === -1) {
    return undefined
  }

  let depth = 0
  let inString = false
  for (let i = searchStart; i < text.length; i++) {
    if (text[i] === '"' && !isEscaped(text, i)) {
      inString = !inString
      continue
    }
    if (inString) {
      continue
    }
    if (text[i] === open) {
      depth += 1
    }
    if (text[i] === close) {
      depth -= 1
    }
    if (depth === 0) {
      return text.slice(searchStart, i + 1)
    }
  }

  return undefined
}

export function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim()

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]
  if (fenced) {
    const result = tryParseJson(fenced)
    if (result.ok) {
      return result.value
    }
  }

  const direct = tryParseJson(trimmed)
  if (direct.ok) {
    return direct.value
  }

  const anchored = extractBalancedJson(trimmed, "{", "}", '{"findings"')
    ?? extractBalancedJson(trimmed, "{", "}", '{\n  "findings"')
    ?? extractBalancedJson(trimmed, "{", "}", '{"resolutions"')
    ?? extractBalancedJson(trimmed, "{", "}", '{\n  "resolutions"')
    ?? extractBalancedJson(trimmed, "{", "}", '{"status"')
    ?? extractBalancedJson(trimmed, "{", "}", '{\n  "status"')
  if (anchored) {
    const result = tryParseJson(anchored)
    if (result.ok) {
      return result.value
    }
  }

  const object = extractBalancedJson(trimmed, "{", "}")
  if (object) {
    const result = tryParseJson(object)
    if (result.ok) {
      return result.value
    }
  }

  const array = extractBalancedJson(trimmed, "[", "]")
  if (array) {
    const result = tryParseJson(array)
    if (result.ok) {
      return result.value
    }
  }

  throw new SyntaxError(`Failed to extract valid JSON from runtime task output (length=${trimmed.length})`)
}
