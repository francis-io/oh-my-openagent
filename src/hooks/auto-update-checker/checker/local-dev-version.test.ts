import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { getLocalDevVersion } from "./local-dev-version"

describe("getLocalDevVersion", () => {
  let temporaryDirectory: string
  let configPath: string
  let pluginDirectory: string

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "omo-local-dev-version-test-"))
    const opencodeDirectory = path.join(temporaryDirectory, ".opencode")
    fs.mkdirSync(opencodeDirectory, { recursive: true })
    configPath = path.join(opencodeDirectory, "opencode.json")
    pluginDirectory = path.join(temporaryDirectory, "vendor", "oh-my-openagent")
    fs.mkdirSync(pluginDirectory, { recursive: true })
    fs.writeFileSync(
      path.join(pluginDirectory, "package.json"),
      JSON.stringify({ name: "oh-my-opencode", version: "3.14.0-dev" }),
    )
  })

  afterEach(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  test("returns local dev version for canonical file plugin entry", () => {
    fs.writeFileSync(configPath, JSON.stringify({ plugin: [`file://${pluginDirectory}`] }))

    const version = getLocalDevVersion(temporaryDirectory)

    expect(version).toBe("3.14.0-dev")
  })
})
