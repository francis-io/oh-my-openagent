import { z } from "zod"

export const BUILTIN_AGENT_NAMES = [
  "sisyphus",
  "hephaestus",
  "prometheus",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "metis",
  "momus",
  "themis",
  "argus",
  "atlas",
  "sisyphus-junior",
] as const

type BuiltinAgentIdentityMetadata = {
  displayName: string
  color?: string
}

export const BUILTIN_AGENT_IDENTITY_METADATA: Record<
  (typeof BUILTIN_AGENT_NAMES)[number],
  BuiltinAgentIdentityMetadata
> = {
  sisyphus: { displayName: "Sisyphus (Ultraworker)" },
  hephaestus: { displayName: "Hephaestus (Deep Agent)" },
  prometheus: { displayName: "Prometheus (Plan Builder)" },
  oracle: { displayName: "oracle" },
  librarian: { displayName: "librarian" },
  explore: { displayName: "explore" },
  "multimodal-looker": { displayName: "multimodal-looker" },
  metis: { displayName: "Metis (Plan Consultant)" },
  momus: { displayName: "Momus (Plan Critic)" },
  themis: { displayName: "Themis (Reviewer)", color: "#4C1D95" },
  argus: { displayName: "Argus", color: "#1E40AF" },
  atlas: { displayName: "Atlas (Plan Executor)" },
  "sisyphus-junior": { displayName: "Sisyphus-Junior" },
}

export const BuiltinAgentNameSchema = z.enum(BUILTIN_AGENT_NAMES)

export const BuiltinSkillNameSchema = z.enum([
  "playwright",
  "agent-browser",
  "dev-browser",
  "frontend-ui-ux",
  "git-master",
])

export const OVERRIDABLE_AGENT_NAMES = [
  "build",
  "plan",
  "sisyphus",
  "hephaestus",
  "sisyphus-junior",
  "OpenCode-Builder",
  "prometheus",
  "metis",
  "momus",
  "themis",
  "argus",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "atlas",
] as const

export const OverridableAgentNameSchema = z.enum(OVERRIDABLE_AGENT_NAMES)

export const AgentNameSchema = BuiltinAgentNameSchema
export type AgentName = z.infer<typeof AgentNameSchema>
export type OverridableAgentName = z.infer<typeof OverridableAgentNameSchema>

export type BuiltinSkillName = z.infer<typeof BuiltinSkillNameSchema>
