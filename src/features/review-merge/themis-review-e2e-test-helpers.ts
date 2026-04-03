import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"

const tempDirs: string[] = []

export function createTempProject(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(root)
  return root
}

export function writeProjectFile(root: string, relativePath: string, content: string): void {
  const absolutePath = join(root, relativePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content, "utf-8")
}

export function cleanupTempProjects(): void {
  while (tempDirs.length > 0) {
    const root = tempDirs.pop()
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  }
}
