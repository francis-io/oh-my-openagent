import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { dirname } from "node:path"

function ensureDirectory(filePath: string): void {
  const parentDirectory = dirname(filePath)
  if (!existsSync(parentDirectory)) {
    mkdirSync(parentDirectory, { recursive: true })
  }
}

function createTempPath(filePath: string): string {
  return `${filePath}.tmp.${Date.now()}.${process.pid}.${randomUUID()}`
}

export function writeTextFileAtomic(filePath: string, content: string): void {
  ensureDirectory(filePath)
  const tempPath = createTempPath(filePath)

  try {
    writeFileSync(tempPath, content, "utf-8")
    renameSync(tempPath, filePath)
  } catch (error) {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath)
      }
    } catch {}

    throw error
  }
}

export function writeJsonFileAtomic(filePath: string, value: unknown): void {
  writeTextFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
