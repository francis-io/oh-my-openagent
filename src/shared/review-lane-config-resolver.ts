import type { LockedReviewModelTuple } from "./model-requirements"

function extractProvider(modelString: string): string {
  const slashIndex = modelString.indexOf("/")
  if (slashIndex === -1) {
    throw new Error(`Invalid model string format, expected "provider/model": ${modelString}`)
  }
  return modelString.slice(0, slashIndex)
}

function extractModelName(modelString: string): string {
  const slashIndex = modelString.indexOf("/")
  if (slashIndex === -1) {
    throw new Error(`Invalid model string format, expected "provider/model": ${modelString}`)
  }
  return modelString.slice(slashIndex + 1)
}

export const DEFAULT_ARGUS_LANE_TUPLES: LockedReviewModelTuple[] = [
  {
    agent: "argus",
    provider: "anthropic",
    model: "claude-opus-4-6",
    variant: "max",
    thinking: { type: "enabled", budgetTokens: 32000 },
  },
  {
    agent: "argus",
    provider: "openai",
    model: "gpt-5.4",
    variant: "high",
    reasoningEffort: "high",
  },
]

export function resolveArgusLaneTuples(
  pluginConfig: { agents?: { argus?: { lanes?: Array<{ model: string; variant?: string; thinking?: { budgetTokens?: number }; reasoningEffort?: string }>; model?: string; variant?: string } } } | null | undefined
): LockedReviewModelTuple[] {
  const argusConfig = pluginConfig?.agents?.argus

  if (argusConfig?.lanes && argusConfig.lanes.length > 0) {
    return argusConfig.lanes.map((lane) => ({
      agent: "argus" as const,
      provider: extractProvider(lane.model),
      model: extractModelName(lane.model),
      variant: lane.variant ?? "medium",
      ...(lane.thinking
        ? { thinking: { type: "enabled" as const, budgetTokens: lane.thinking.budgetTokens ?? 32000 } }
        : {}),
      ...(lane.reasoningEffort ? { reasoningEffort: lane.reasoningEffort } : {}),
    }))
  }

  if (argusConfig?.model) {
    return [
      {
        agent: "argus" as const,
        provider: extractProvider(argusConfig.model),
        model: extractModelName(argusConfig.model),
        variant: argusConfig.variant ?? "medium",
      },
    ]
  }

  return DEFAULT_ARGUS_LANE_TUPLES
}
