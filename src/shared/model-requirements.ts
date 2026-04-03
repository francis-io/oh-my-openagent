export type FallbackEntry = {
  providers: string[];
  model: string;
  variant?: string; // Entry-specific variant (e.g., GPT→high, Opus→max)
  reasoningEffort?: string;
  temperature?: number;
  top_p?: number;
  maxTokens?: number;
  thinking?: { type: "enabled" | "disabled"; budgetTokens?: number };
};

export type ModelRequirement = {
  fallbackChain: FallbackEntry[];
  variant?: string; // Default variant (used when entry doesn't specify one)
  requiresModel?: string; // If set, only activates when this model is available (fuzzy match)
  requiresAnyModel?: boolean; // If true, requires at least ONE model in fallbackChain to be available (or empty availability treated as unavailable)
  requiresProvider?: string[]; // If set, only activates when any of these providers is connected
  requiresExactAvailability?: boolean;
};

export type ReviewProfileName = "test" | "production";

export type LockedReviewRole = "argus-lane" | "merge" | "tie-break";

export type LockedReviewModelTuple = {
  agent: "argus" | "themis" | "oracle";
  provider: string;
  model: string;
  variant: string;
  reasoningEffort?: string;
  thinking?: { type: "enabled" | "disabled"; budgetTokens?: number };
};

export type ReviewProfileModelPolicy = {
  lockedArgusLane: LockedReviewModelTuple;
  merge: LockedReviewModelTuple;
  tieBreak: LockedReviewModelTuple;
};

export const LOCKED_REVIEW_ROLE_SESSION_MARKER = "themis-review-role:";

const LOCKED_REVIEW_SESSION_PATTERN = /themis-review-role:(test|production):(argus-lane|merge|tie-break)/i;

export const REVIEW_PROFILE_MODEL_POLICIES: Record<ReviewProfileName, ReviewProfileModelPolicy> = {
  test: {
    lockedArgusLane: {
      agent: "argus",
      provider: "anthropic",
      model: "claude-opus-4-6",
      variant: "max",
      thinking: { type: "enabled", budgetTokens: 32000 },
    },
    merge: {
      agent: "themis",
      provider: "anthropic",
      model: "claude-opus-4-6",
      variant: "max",
      thinking: { type: "enabled", budgetTokens: 32000 },
    },
    tieBreak: {
      agent: "oracle",
      provider: "openai",
      model: "gpt-5.4",
      variant: "xhigh",
      reasoningEffort: "xhigh",
    },
  },
  production: {
    lockedArgusLane: {
      agent: "argus",
      provider: "anthropic",
      model: "claude-opus-4-6",
      variant: "max",
      thinking: { type: "enabled", budgetTokens: 32000 },
    },
    merge: {
      agent: "themis",
      provider: "anthropic",
      model: "claude-opus-4-6",
      variant: "max",
      thinking: { type: "enabled", budgetTokens: 32000 },
    },
    tieBreak: {
      agent: "oracle",
      provider: "openai",
      model: "gpt-5.4",
      variant: "xhigh",
      reasoningEffort: "xhigh",
    },
  },
};

export function parseLockedReviewRoleSession(sessionID: string | undefined): { profile: ReviewProfileName; role: LockedReviewRole } | undefined {
  if (!sessionID) return undefined;
  const match = sessionID.match(LOCKED_REVIEW_SESSION_PATTERN);
  if (!match) return undefined;
  return {
    profile: match[1] as ReviewProfileName,
    role: match[2] as LockedReviewRole,
  };
}

export function isLockedReviewRoleSession(sessionID: string | undefined): boolean {
  return parseLockedReviewRoleSession(sessionID) !== undefined;
}

export const AGENT_MODEL_REQUIREMENTS: Record<string, ModelRequirement> = {
  sisyphus: {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-opus-4-6",
        variant: "max",
      },
      { providers: ["opencode-go"], model: "kimi-k2.5" },
      { providers: ["kimi-for-coding"], model: "k2p5" },
      {
        providers: [
          "opencode",
          "moonshotai",
          "moonshotai-cn",
          "firmware",
          "ollama-cloud",
          "aihubmix",
        ],
        model: "kimi-k2.5",
      },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.4", variant: "medium" },
      { providers: ["zai-coding-plan", "opencode"], model: "glm-5" },
      { providers: ["opencode"], model: "big-pickle" },
    ],
    requiresAnyModel: true,
  },
  hephaestus: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "venice", "opencode"],
        model: "gpt-5.4",
        variant: "medium",
      },
    ],
    requiresProvider: ["openai", "github-copilot", "venice", "opencode"],
  },
  oracle: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "opencode"],
        model: "gpt-5.4",
        variant: "high",
      },
      {
        providers: ["google", "github-copilot", "opencode"],
        model: "gemini-3.1-pro",
        variant: "high",
      },
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-opus-4-6",
        variant: "max",
      },
      { providers: ["opencode-go"], model: "glm-5" },
    ],
  },
  librarian: {
    fallbackChain: [
      { providers: ["opencode-go"], model: "minimax-m2.7" },
      { providers: ["opencode"], model: "minimax-m2.7-highspeed" },
      { providers: ["anthropic", "opencode"], model: "claude-haiku-4-5" },
      { providers: ["opencode"], model: "gpt-5-nano" },
    ],
  },
  explore: {
    fallbackChain: [
      { providers: ["github-copilot", "xai"], model: "grok-code-fast-1" },
      { providers: ["opencode-go"], model: "minimax-m2.7-highspeed" },
      { providers: ["opencode"], model: "minimax-m2.7" },
      { providers: ["anthropic", "opencode"], model: "claude-haiku-4-5" },
      { providers: ["opencode"], model: "gpt-5-nano" },
    ],
  },
  "multimodal-looker": {
    fallbackChain: [
      { providers: ["openai", "opencode"], model: "gpt-5.4", variant: "medium" },
      { providers: ["opencode-go"], model: "kimi-k2.5" },
      { providers: ["zai-coding-plan"], model: "glm-4.6v" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5-nano" },
    ],
  },
  prometheus: {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-opus-4-6",
        variant: "max",
      },
      {
        providers: ["openai", "github-copilot", "opencode"],
        model: "gpt-5.4",
        variant: "high",
      },
      { providers: ["opencode-go"], model: "glm-5" },
      {
        providers: ["google", "github-copilot", "opencode"],
        model: "gemini-3.1-pro",
      },
    ],
  },
  metis: {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-opus-4-6",
        variant: "max",
      },
      {
        providers: ["openai", "github-copilot", "opencode"],
        model: "gpt-5.4",
        variant: "high",
      },
      { providers: ["opencode-go"], model: "glm-5" },
      { providers: ["kimi-for-coding"], model: "k2p5" },
    ],
  },
  momus: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "opencode"],
        model: "gpt-5.4",
        variant: "xhigh",
      },
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-opus-4-6",
        variant: "max",
      },
      {
        providers: ["google", "github-copilot", "opencode"],
        model: "gemini-3.1-pro",
        variant: "high",
      },
      { providers: ["opencode-go"], model: "glm-5" },
    ],
  },
  argus: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "opencode"],
        model: "gpt-5.4",
        variant: "high",
      },
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-opus-4-6",
        variant: "max",
      },
      { providers: ["opencode-go"], model: "glm-5" },
    ],
  },
  themis: {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-opus-4-6",
        variant: "max",
      },
      {
        providers: ["openai", "github-copilot", "opencode"],
        model: "gpt-5.4",
        variant: "xhigh",
      },
      { providers: ["opencode-go"], model: "glm-5" },
    ],
  },
  atlas: {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-sonnet-4-6" },
      { providers: ["opencode-go"], model: "kimi-k2.5" },
      {
        providers: ["openai", "github-copilot", "opencode"],
        model: "gpt-5.4",
        variant: "medium",
      },
      { providers: ["opencode-go"], model: "minimax-m2.7" },
    ],
  },
  "sisyphus-junior": {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-sonnet-4-6" },
      { providers: ["opencode-go"], model: "kimi-k2.5" },
      {
        providers: ["openai", "github-copilot", "opencode"],
        model: "gpt-5.4",
        variant: "medium",
      },
      { providers: ["opencode-go"], model: "minimax-m2.7" },
      { providers: ["opencode"], model: "big-pickle" },
    ],
  },
};

export const CATEGORY_MODEL_REQUIREMENTS: Record<string, ModelRequirement> = {
  "visual-engineering": {
    fallbackChain: [
      {
        providers: ["google", "github-copilot", "opencode"],
        model: "gemini-3.1-pro",
        variant: "high",
      },
      { providers: ["zai-coding-plan", "opencode"], model: "glm-5" },
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-opus-4-6",
        variant: "max",
      },
      { providers: ["opencode-go"], model: "glm-5" },
      { providers: ["kimi-for-coding"], model: "k2p5" },
    ],
  },
  ultrabrain: {
    fallbackChain: [
      {
        providers: ["openai", "opencode"],
        model: "gpt-5.4",
        variant: "xhigh",
      },
      {
        providers: ["google", "github-copilot", "opencode"],
        model: "gemini-3.1-pro",
        variant: "high",
      },
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-opus-4-6",
        variant: "max",
      },
      { providers: ["opencode-go"], model: "glm-5" },
    ],
  },
  deep: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "venice", "opencode"],
        model: "gpt-5.4",
        variant: "medium",
      },
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-opus-4-6",
        variant: "max",
      },
      {
        providers: ["google", "github-copilot", "opencode"],
        model: "gemini-3.1-pro",
        variant: "high",
      },
    ],
  },
  artistry: {
    fallbackChain: [
      {
        providers: ["google", "github-copilot", "opencode"],
        model: "gemini-3.1-pro",
        variant: "high",
      },
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-opus-4-6",
        variant: "max",
      },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.4" },
    ],
    requiresModel: "gemini-3.1-pro",
  },
  quick: {
    fallbackChain: [
      {
        providers: ["openai", "github-copilot", "opencode"],
        model: "gpt-5.4-mini",
      },
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-haiku-4-5",
      },
      {
        providers: ["google", "github-copilot", "opencode"],
        model: "gemini-3-flash",
      },
      { providers: ["opencode-go"], model: "minimax-m2.7" },
      { providers: ["opencode"], model: "gpt-5-nano" },
    ],
  },
  "unspecified-low": {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-sonnet-4-6",
      },
      {
        providers: ["openai", "opencode"],
        model: "gpt-5.3-codex",
        variant: "medium",
      },
      { providers: ["opencode-go"], model: "kimi-k2.5" },
      {
        providers: ["google", "github-copilot", "opencode"],
        model: "gemini-3-flash",
      },
      { providers: ["opencode-go"], model: "minimax-m2.7" },
    ],
  },
  "unspecified-high": {
    fallbackChain: [
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-opus-4-6",
        variant: "max",
      },
      {
        providers: ["openai", "github-copilot", "opencode"],
        model: "gpt-5.4",
        variant: "high",
      },
      { providers: ["zai-coding-plan", "opencode"], model: "glm-5" },
      { providers: ["kimi-for-coding"], model: "k2p5" },
      { providers: ["opencode-go"], model: "glm-5" },
      { providers: ["opencode"], model: "kimi-k2.5" },
      {
        providers: [
          "opencode",
          "moonshotai",
          "moonshotai-cn",
          "firmware",
          "ollama-cloud",
          "aihubmix",
        ],
        model: "kimi-k2.5",
      },
    ],
  },
  writing: {
    fallbackChain: [
      {
        providers: ["google", "github-copilot", "opencode"],
        model: "gemini-3-flash",
      },
      { providers: ["opencode-go"], model: "kimi-k2.5" },
      {
        providers: ["anthropic", "github-copilot", "opencode"],
        model: "claude-sonnet-4-6",
      },
      { providers: ["opencode-go"], model: "minimax-m2.7" },
    ],
  },
};
