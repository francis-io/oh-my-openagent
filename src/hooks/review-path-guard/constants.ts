export const HOOK_NAME = "review-path-guard"

export const REVIEW_AGENT_NAMES = {
  themis: "themis",
  argus: "argus",
} as const

export const BLOCKED_TOOLS = new Set(["write", "edit", "apply_patch"])
