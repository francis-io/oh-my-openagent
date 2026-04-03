import { log } from "./logger"
import { getAgentConfigKey, normalizeAgentForPrompt } from "./agent-display-names"
import { normalizeSDKResponse } from "./index"

type AgentListEntry = { name?: string }

export async function resolveRegisteredPromptAgent(input: {
  client: unknown
  agentName: string | undefined
}): Promise<string | undefined> {
  const normalized = normalizeAgentForPrompt(input.agentName)
  if (!normalized) {
    log("[resolve-registered-prompt-agent] no normalized agent", {
      requestedAgentName: input.agentName,
    })
    return undefined
  }

  const agentsApi = (input.client as {
    app?: {
      agents?: () => Promise<unknown>
    }
  }).app?.agents

  if (typeof agentsApi !== "function") {
    log("[resolve-registered-prompt-agent] agents api unavailable, falling back to normalized name", {
      requestedAgentName: input.agentName,
      normalized,
    })
    return normalized
  }

  try {
    const response = await agentsApi()
    const agents = normalizeSDKResponse(response, [] as AgentListEntry[], {
      preferResponseOnMissingData: true,
    })

    if (!Array.isArray(agents)) {
      log("[resolve-registered-prompt-agent] agents api returned non-array, falling back to normalized name", {
        requestedAgentName: input.agentName,
        normalized,
      })
      return normalized
    }

    const targetKey = getAgentConfigKey(normalized)
    const matches = agents.filter((agent) => {
      if (typeof agent?.name !== "string") {
        return false
      }
      return getAgentConfigKey(agent.name) === targetKey
    })

    if (matches.length !== 1) {
      log("[resolve-registered-prompt-agent] host registry match failure", {
        requestedAgentName: input.agentName,
        normalized,
        targetKey,
        agentCount: agents.length,
        matchingNames: matches.map((agent) => agent.name).filter((name): name is string => typeof name === "string"),
      })
      return undefined
    }

    log("[resolve-registered-prompt-agent] resolved prompt agent", {
      requestedAgentName: input.agentName,
      normalized,
      resolved: matches[0].name,
    })
    return typeof matches[0]?.name === "string" ? matches[0].name : undefined
  } catch {
    log("[resolve-registered-prompt-agent] agents api threw, falling back to normalized name", {
      requestedAgentName: input.agentName,
      normalized,
    })
    return normalized
  }
}
