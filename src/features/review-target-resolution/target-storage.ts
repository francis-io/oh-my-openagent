import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { dirname } from "node:path"
import { MaterializedReviewTargetSchema, type MaterializedReviewTarget } from "./target-types"

function ensureDirectory(filePath: string): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function sortDeterministic(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeterministic)
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const input = value as Record<string, unknown>
  const keys = Object.keys(input).sort((left, right) => left.localeCompare(right))
  const sorted: Record<string, unknown> = {}
  for (const key of keys) {
    sorted[key] = sortDeterministic(input[key])
  }

  return sorted
}

export function readMaterializedReviewTarget(path: string): MaterializedReviewTarget | null {
  if (!existsSync(path)) {
    return null
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"))
    const result = MaterializedReviewTargetSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch (error) {
    void error
    return null
  }
}

export function createReviewTargetTempPath(path: string): string {
  return `${path}.tmp.${Date.now()}.${process.pid}.${randomUUID()}`
}

export function writeMaterializedReviewTargetAtomic(path: string, target: MaterializedReviewTarget): void {
  ensureDirectory(path)
  const tempPath = createReviewTargetTempPath(path)

  try {
    writeFileSync(tempPath, JSON.stringify(sortDeterministic(target), null, 2), "utf-8")
    renameSync(tempPath, path)
  } catch (error) {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath)
      }
    } catch (_cleanupError) {
      void _cleanupError
    }
    throw error
  }
}
