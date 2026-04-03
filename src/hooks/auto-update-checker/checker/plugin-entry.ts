import * as fs from "node:fs"
import type { OpencodeConfig } from "../types"
import { PACKAGE_NAME } from "../constants"
import { PLUGIN_NAME, LEGACY_PLUGIN_NAME } from "../../../shared/plugin-identity"
import { getConfigPaths } from "./config-paths"
import { stripJsonComments } from "./jsonc-strip"

export interface PluginEntryInfo {
  entry: string
  isPinned: boolean
  pinnedVersion: string | null
  configPath: string
}

const EXACT_SEMVER_REGEX = /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/

function isBarePluginPackage(entry: string): boolean {
  return entry === PACKAGE_NAME || entry === PLUGIN_NAME || entry === LEGACY_PLUGIN_NAME
}

function getPinnedPluginVersion(entry: string): string | null {
  for (const prefix of [PACKAGE_NAME, PLUGIN_NAME, LEGACY_PLUGIN_NAME]) {
    if (entry.startsWith(`${prefix}@`)) {
      return entry.slice(prefix.length + 1)
    }
  }

  return null
}

function isLocalFilePluginEntry(entry: string): boolean {
  return entry.startsWith("file://")
    && (entry.includes(PACKAGE_NAME) || entry.includes(PLUGIN_NAME) || entry.includes(LEGACY_PLUGIN_NAME))
}

export function findPluginEntry(directory: string): PluginEntryInfo | null {
  for (const configPath of getConfigPaths(directory)) {
    try {
      if (!fs.existsSync(configPath)) continue
      const content = fs.readFileSync(configPath, "utf-8")
      const config = JSON.parse(stripJsonComments(content)) as OpencodeConfig
      const plugins = config.plugin ?? []

      for (const entry of plugins) {
        if (isBarePluginPackage(entry) || isLocalFilePluginEntry(entry)) {
          return { entry, isPinned: false, pinnedVersion: null, configPath }
        }
        const pinnedVersion = getPinnedPluginVersion(entry)
        if (pinnedVersion) {
          const isPinned = EXACT_SEMVER_REGEX.test(pinnedVersion.trim())
          return { entry, isPinned, pinnedVersion, configPath }
        }
      }
    } catch {
      continue
    }
  }

  return null
}
