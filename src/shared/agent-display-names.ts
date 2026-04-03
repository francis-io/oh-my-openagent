import { BUILTIN_AGENT_IDENTITY_METADATA } from "../config/schema/agent-names"

/**
 * Agent config keys to display names mapping.
 * Config keys are lowercase (e.g., "sisyphus", "atlas").
 * Display names include suffixes for UI/logs (e.g., "Sisyphus (Ultraworker)").
 */
const LEGACY_AGENT_DISPLAY_NAMES: Record<string, string> = {
  athena: "Athena (Council)",
  "athena-junior": "Athena-Junior (Council)",
  "council-member": "council-member",
}

const BUILTIN_AGENT_DISPLAY_NAMES = Object.fromEntries(
  Object.entries(BUILTIN_AGENT_IDENTITY_METADATA).map(([key, metadata]) => [
    key,
    metadata.displayName,
  ]),
)

export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  ...BUILTIN_AGENT_DISPLAY_NAMES,
  ...LEGACY_AGENT_DISPLAY_NAMES,
}

export const AGENT_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(BUILTIN_AGENT_IDENTITY_METADATA)
    .filter(([, metadata]) => metadata.color)
    .map(([key, metadata]) => [key, metadata.color as string]),
)

const AGENT_LIST_SORT_PREFIXES: Record<string, string> = {
  atlas: "\u200B",
}

function stripAgentListSortPrefix(agentName: string): string {
  return agentName.replace(/^\u200B+/, "")
}

/**
 * Get display name for an agent config key.
 * Uses case-insensitive lookup for backward compatibility.
 * Returns original key if not found.
 */
export function getAgentDisplayName(configKey: string): string {
  // Try exact match first
  const exactMatch = AGENT_DISPLAY_NAMES[configKey]
  if (exactMatch !== undefined) return exactMatch
  
  // Fall back to case-insensitive search
  const lowerKey = configKey.toLowerCase()
  for (const [k, v] of Object.entries(AGENT_DISPLAY_NAMES)) {
    if (k.toLowerCase() === lowerKey) return v
  }
  
  // Unknown agent: return original key
  return configKey
}

export function getAgentListDisplayName(configKey: string): string {
  const displayName = getAgentDisplayName(configKey)
  const prefix = AGENT_LIST_SORT_PREFIXES[configKey.toLowerCase()]

  return prefix ? `${prefix}${displayName}` : displayName
}

const REVERSE_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(AGENT_DISPLAY_NAMES).map(([key, displayName]) => [displayName.toLowerCase(), key]),
)

/**
 * Resolve an agent name (display name or config key) to its lowercase config key.
 * "Atlas (Plan Executor)" → "atlas", "atlas" → "atlas", "unknown" → "unknown"
 */
export function getAgentConfigKey(agentName: string): string {
  const lower = stripAgentListSortPrefix(agentName).toLowerCase()
  const reversed = REVERSE_DISPLAY_NAMES[lower]
  if (reversed !== undefined) return reversed
  if (AGENT_DISPLAY_NAMES[lower] !== undefined) return lower
  return lower
}

export function getAgentColor(agentName: string): string | undefined {
  const configKey = getAgentConfigKey(agentName)
  return AGENT_COLORS[configKey]
}

/**
 * Normalize an agent name for prompt APIs.
 * - Known display names -> canonical display names
 * - Known config keys (any case) -> canonical display names
 * - Unknown/custom names -> preserved as-is (trimmed)
 */
export function normalizeAgentForPrompt(agentName: string | undefined): string | undefined {
  if (typeof agentName !== "string") {
    return undefined
  }

  const trimmed = stripAgentListSortPrefix(agentName.trim())
  if (!trimmed) {
    return undefined
  }

  const lower = trimmed.toLowerCase()
  const reversed = REVERSE_DISPLAY_NAMES[lower]
  if (reversed !== undefined) {
    return AGENT_DISPLAY_NAMES[reversed] ?? trimmed
  }
  if (AGENT_DISPLAY_NAMES[lower] !== undefined) {
    return AGENT_DISPLAY_NAMES[lower]
  }

  return trimmed
}
