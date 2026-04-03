import type { PluginInput } from "@opencode-ai/plugin"

import { log } from "../../shared"
import { getAgentFromSession } from "../prometheus-md-only/agent-resolution"
import { isArgusAgent, isThemisAgent } from "./agent-matcher"
import { BLOCKED_TOOLS, HOOK_NAME } from "./constants"
import { evaluateReviewPathPolicy, type ReviewRole } from "./path-policy"

type ToolExecuteInput = { tool: string; sessionID: string; callID: string }
type ToolExecuteOutput = { args: Record<string, unknown> }

function getRole(agentName: string | undefined): ReviewRole | undefined {
  if (isThemisAgent(agentName)) {
    return "themis"
  }

  if (isArgusAgent(agentName)) {
    return "argus"
  }

  return undefined
}

function getFilePath(args: Record<string, unknown>): string | undefined {
  const filePath = args.filePath ?? args.path ?? args.file ?? args.file_path
  return typeof filePath === "string" && filePath.length > 0 ? filePath : undefined
}

function allowedPathsDescription(role: ReviewRole): string {
  if (role === "themis") {
    return ".sisyphus/reviews/{review-run-id}/** and .sisyphus/plans/review-remediation-{review-run-id}.md"
  }

  return ".sisyphus/reviews/{review-run-id}/**"
}

export function createReviewPathGuardHook(ctx: PluginInput) {
  return {
    "tool.execute.before": async (input: ToolExecuteInput, output: ToolExecuteOutput): Promise<void> => {
      const toolName = input.tool.toLowerCase()
      if (!BLOCKED_TOOLS.has(toolName)) {
        return
      }

      const agentName = await getAgentFromSession(input.sessionID, ctx.directory, ctx.client)
      const role = getRole(agentName)
      if (!role) {
        return
      }

      if (toolName === "apply_patch") {
        const message =
          `[${HOOK_NAME}] Blocked ${role} apply_patch. `
          + `Allowed paths for file writes: ${allowedPathsDescription(role)}. `
          + "Reason: apply_patch bypasses path-scoped filePath validation."

        log(message, {
          sessionID: input.sessionID,
          callID: input.callID,
          tool: input.tool,
          role,
        })

        throw new Error(message)
      }

      const filePath = getFilePath(output.args)
      if (!filePath) {
        return
      }

      const decision = evaluateReviewPathPolicy({
        workspaceRoot: ctx.directory,
        filePath,
        role,
      })

      if (decision.allowed) {
        log(`[${HOOK_NAME}] Allowed write`, {
          sessionID: input.sessionID,
          callID: input.callID,
          tool: input.tool,
          filePath,
          role,
        })
        return
      }

      const message =
        `[${HOOK_NAME}] Blocked ${role} write to '${filePath}'. `
        + `Allowed paths: ${allowedPathsDescription(role)}. `
        + `Reason: ${decision.reason ?? "path policy violation"}.`

      log(message, {
        sessionID: input.sessionID,
        callID: input.callID,
        tool: input.tool,
        filePath,
        role,
        reason: decision.reason,
      })

      throw new Error(message)
    },
  }
}
