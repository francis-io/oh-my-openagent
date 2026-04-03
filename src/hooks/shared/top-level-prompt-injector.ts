import type { PluginInput } from "@opencode-ai/plugin"
import { createInternalAgentTextPart, resolveInheritedPromptTools } from "../../shared"
import { log } from "../../shared/logger"
import { resolveRegisteredPromptAgent } from "../../shared/resolve-registered-prompt-agent"
import { resolveRecentPromptContextForSession } from "./recent-prompt-context"

export type TopLevelPromptInjectionResult =
  | { status: "injected"; promptAgent: string }
  | { status: "retryable_failure"; reason: string }
  | { status: "terminal_failure"; reason: string }

export async function injectTopLevelPrompt(input: {
  ctx: PluginInput
  sessionID: string
  agentName: string | undefined
  prompt: string
}): Promise<TopLevelPromptInjectionResult> {
  const sessionApi = (input.ctx.client as {
    session?: {
      promptAsync?: (args: {
        path: { id: string }
        body: {
          agent?: string
          model?: { providerID: string; modelID: string }
          tools?: Record<string, boolean>
          parts: Array<{ type: string; text: string }>
        }
        query?: { directory: string }
      }) => Promise<unknown>
      prompt?: (args: {
        path: { id: string }
        body: {
          agent?: string
          model?: { providerID: string; modelID: string }
          tools?: Record<string, boolean>
          parts: Array<{ type: string; text: string }>
        }
        query?: { directory: string }
      }) => Promise<unknown>
    }
  }).session

  log("[top-level-prompt-injector] injection attempt", {
    sessionID: input.sessionID,
    requestedAgentName: input.agentName,
    promptLength: input.prompt.length,
  })

  const promptAsync = sessionApi?.promptAsync
  const promptSync = sessionApi?.prompt

  const promptContext = await resolveRecentPromptContextForSession(input.ctx, input.sessionID)
  const inheritedTools = resolveInheritedPromptTools(input.sessionID, promptContext.tools)
  log("[top-level-prompt-injector] prompt context resolved", {
    sessionID: input.sessionID,
    model: promptContext.model,
    tools: inheritedTools,
    hasPromptAsync: typeof promptAsync === "function",
    hasPrompt: typeof promptSync === "function",
  })
  const promptAgent = await resolveRegisteredPromptAgent({
    client: input.ctx.client,
    agentName: input.agentName,
  })

  if (!promptAgent) {
    log("[top-level-prompt-injector] prompt agent unavailable", {
      sessionID: input.sessionID,
      requestedAgentName: input.agentName,
    })
    return { status: "retryable_failure", reason: "prompt-agent-unavailable" }
  }

  log("[top-level-prompt-injector] prompt agent resolved", {
    sessionID: input.sessionID,
    requestedAgentName: input.agentName,
    promptAgent,
  })

  const promptRequest = {
    path: { id: input.sessionID },
    body: {
      agent: promptAgent,
      ...(promptContext.model !== undefined ? { model: promptContext.model } : {}),
      ...(inheritedTools ? { tools: inheritedTools } : {}),
      parts: [createInternalAgentTextPart(input.prompt)],
    },
    query: { directory: input.ctx.directory },
  }

  const sendPrompt = typeof promptAsync === "function"
    ? promptAsync.bind(sessionApi)
    : typeof promptSync === "function"
      ? promptSync.bind(sessionApi)
      : null

  if (!sendPrompt) {
    log("[top-level-prompt-injector] no prompt surface available", {
      sessionID: input.sessionID,
      promptAgent,
    })
    return { status: "retryable_failure", reason: "prompt-surface-unavailable" }
  }

  try {
    log("[top-level-prompt-injector] sending prompt", {
      sessionID: input.sessionID,
      promptAgent,
      surface: typeof promptAsync === "function" ? "promptAsync" : "prompt",
    })
    await sendPrompt(promptRequest)
    log("[top-level-prompt-injector] prompt sent successfully", {
      sessionID: input.sessionID,
      promptAgent,
    })
    return { status: "injected", promptAgent }
  } catch (error) {
    log("[top-level-prompt-injector] prompt injection failed", {
      sessionID: input.sessionID,
      promptAgent,
      error: error instanceof Error ? error.message : String(error),
    })
    return { status: "retryable_failure", reason: "prompt-send-failed" }
  }
}
