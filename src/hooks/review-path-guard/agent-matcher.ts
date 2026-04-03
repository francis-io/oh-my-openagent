import { REVIEW_AGENT_NAMES } from "./constants"

function includesAgentName(agentName: string | undefined, expected: string): boolean {
  return agentName?.toLowerCase().includes(expected) ?? false
}

export function isThemisAgent(agentName: string | undefined): boolean {
  return includesAgentName(agentName, REVIEW_AGENT_NAMES.themis)
}

export function isArgusAgent(agentName: string | undefined): boolean {
  return includesAgentName(agentName, REVIEW_AGENT_NAMES.argus)
}
