import { parseJsonFromText } from "../../shared"

export type LaneName = "argus" | "argus-gpt" | "argus-claude"

export type TieBreakResolution = {
  fingerprint: string
  selected_lane: LaneName
  rationale?: string
}

export type MergeValidationStatus = "ok" | "invalid"

export type MergeValidationResult = {
  status: MergeValidationStatus
  findings_considered: number
  notes: string
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

export function parseTieBreakResolutions(resultText: string): TieBreakResolution[] {
  const parsed = parseJsonFromText(resultText)
  const items = Array.isArray(parsed)
    ? parsed
    : (toRecord(parsed)?.["resolutions"] as unknown[] | undefined) ?? []

  return items.filter((entry): entry is TieBreakResolution => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return false
    }
    const record = entry as Record<string, unknown>
    return typeof record["fingerprint"] === "string"
      && (record["selected_lane"] === "argus" || record["selected_lane"] === "argus-gpt" || record["selected_lane"] === "argus-claude")
  })
}

export function parseMergeValidationResult(resultText: string, findingsCount: number): MergeValidationResult {
  const parsed = toRecord(parseJsonFromText(resultText))
  return {
    status: parsed?.["status"] === "ok" ? "ok" : "invalid",
    findings_considered:
      typeof parsed?.["findings_considered"] === "number"
        ? parsed["findings_considered"]
        : findingsCount,
    notes: typeof parsed?.["notes"] === "string" ? parsed["notes"] : "validated",
  }
}
