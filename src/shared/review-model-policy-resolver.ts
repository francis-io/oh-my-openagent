import { readConnectedProvidersCache } from "./connected-providers-cache"
import {
  REVIEW_PROFILE_MODEL_POLICIES,
  type LockedReviewModelTuple,
  type ReviewProfileModelPolicy,
  type ReviewProfileName,
} from "./model-requirements"

function hasAnyProvider(connectedProviders: string[], aliases: string[]): boolean {
  const connected = new Set(connectedProviders.map((provider) => provider.toLowerCase()))
  return aliases.some((alias) => connected.has(alias.toLowerCase()))
}

function createClaudeTuple(agent: LockedReviewModelTuple["agent"], provider: string): LockedReviewModelTuple {
  if (provider === "amazon-bedrock") {
    return {
      agent,
      provider: "amazon-bedrock",
      model: "anthropic.claude-opus-4-6-v1",
      variant: "max",
      thinking: { type: "enabled", budgetTokens: 32000 },
    }
  }

  if (provider === "github-copilot") {
    return {
      agent,
      provider: "github-copilot",
      model: "claude-opus-4.6",
      variant: "max",
      thinking: { type: "enabled", budgetTokens: 32000 },
    }
  }

  return {
    agent,
    provider: "anthropic",
    model: "claude-opus-4-6",
    variant: "max",
    thinking: { type: "enabled", budgetTokens: 32000 },
  }
}

function createGptTuple(agent: LockedReviewModelTuple["agent"], provider: string, variant: string, reasoningEffort: string): LockedReviewModelTuple {
  return {
    agent,
    provider,
    model: "gpt-5.4",
    variant,
    reasoningEffort,
  }
}

function resolvePreferredClaudeProvider(connectedProviders: string[]): string | null {
  if (hasAnyProvider(connectedProviders, ["amazon-bedrock"])) {
    return "amazon-bedrock"
  }
  if (hasAnyProvider(connectedProviders, ["anthropic", "aws-bedrock-anthropic", "google-vertex-anthropic"])) {
    return "anthropic"
  }
  return null
}

function resolveReviewLaneTuples(connectedProviders: string[]): LockedReviewModelTuple[] {
  const tuples: LockedReviewModelTuple[] = []
  const preferredClaudeProvider = resolvePreferredClaudeProvider(connectedProviders)

  if (preferredClaudeProvider) {
    tuples.push(createClaudeTuple("argus", preferredClaudeProvider))
  }

  if (hasAnyProvider(connectedProviders, ["openai"])) {
    tuples.push(createGptTuple("argus", "openai", "high", "high"))
  }

  if (tuples.length > 0) {
    return tuples
  }

  if (hasAnyProvider(connectedProviders, ["github-copilot"])) {
    return [
      createClaudeTuple("argus", "github-copilot"),
      createGptTuple("argus", "github-copilot", "high", "high"),
    ]
  }

  return REVIEW_PROFILE_MODEL_POLICIES.test.lockedArgusLanes
}

function resolveMergeTuple(connectedProviders: string[], fallback: LockedReviewModelTuple): LockedReviewModelTuple {
  const preferredClaudeProvider = resolvePreferredClaudeProvider(connectedProviders)
  if (preferredClaudeProvider) {
    return createClaudeTuple("themis", preferredClaudeProvider)
  }

  if (hasAnyProvider(connectedProviders, ["openai"])) {
    return createGptTuple("themis", "openai", "xhigh", "xhigh")
  }

  if (hasAnyProvider(connectedProviders, ["github-copilot"])) {
    return createClaudeTuple("themis", "github-copilot")
  }

  return fallback
}

function resolveTieBreakTuple(connectedProviders: string[], fallback: LockedReviewModelTuple): LockedReviewModelTuple {
  if (hasAnyProvider(connectedProviders, ["openai"])) {
    return createGptTuple("oracle", "openai", "xhigh", "xhigh")
  }

  const preferredClaudeProvider = resolvePreferredClaudeProvider(connectedProviders)
  if (preferredClaudeProvider) {
    return createClaudeTuple("oracle", preferredClaudeProvider)
  }

  if (hasAnyProvider(connectedProviders, ["github-copilot"])) {
    return createGptTuple("oracle", "github-copilot", "xhigh", "xhigh")
  }

  return fallback
}

export function resolveReviewProfileModelPolicy(profile: ReviewProfileName): ReviewProfileModelPolicy {
  const fallbackPolicy = REVIEW_PROFILE_MODEL_POLICIES[profile]
  const connectedProviders = readConnectedProvidersCache()

  if (!connectedProviders || connectedProviders.length === 0) {
    return fallbackPolicy
  }

  return {
    lockedArgusLanes: resolveReviewLaneTuples(connectedProviders),
    merge: resolveMergeTuple(connectedProviders, fallbackPolicy.merge),
    tieBreak: resolveTieBreakTuple(connectedProviders, fallbackPolicy.tieBreak),
  }
}
