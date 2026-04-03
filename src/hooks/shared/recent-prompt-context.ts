import type { PluginInput } from "@opencode-ai/plugin"
import {
  findNearestMessageWithFields,
  findNearestMessageWithFieldsFromSDK,
} from "../../features/hook-message-injector"
import { getMessageDir, isSqliteBackend, normalizePromptTools, normalizeSDKResponse } from "../../shared"

export type RecentPromptModelInfo = { providerID: string; modelID: string }

export type RecentPromptContext = {
  model?: RecentPromptModelInfo
  tools?: Record<string, boolean>
}

async function resolvePromptContextFromStorage(
  ctx: PluginInput,
  sessionID: string,
): Promise<RecentPromptContext> {
  let currentMessage = null
  if (isSqliteBackend()) {
    currentMessage = await findNearestMessageWithFieldsFromSDK(ctx.client, sessionID)
  } else {
    const messageDir = getMessageDir(sessionID)
    currentMessage = messageDir ? findNearestMessageWithFields(messageDir) : null
  }
  const model = currentMessage?.model
  const tools = normalizePromptTools(currentMessage?.tools)
  if (!model?.providerID || !model?.modelID) {
    return { tools }
  }
  return { model: { providerID: model.providerID, modelID: model.modelID }, tools }
}

export async function resolveRecentPromptContextForSession(
  ctx: PluginInput,
  sessionID: string,
): Promise<RecentPromptContext> {
  try {
    const messagesResp = await ctx.client.session.messages({ path: { id: sessionID } })
    const messages = normalizeSDKResponse(messagesResp, [] as Array<{
      info?: {
        model?: RecentPromptModelInfo
        modelID?: string
        providerID?: string
        tools?: Record<string, boolean | "allow" | "deny" | "ask">
      }
    }>)

    for (let i = messages.length - 1; i >= 0; i--) {
      const info = messages[i].info
      const model = info?.model
      const tools = normalizePromptTools(info?.tools)
      if (model?.providerID && model?.modelID) {
        return { model: { providerID: model.providerID, modelID: model.modelID }, tools }
      }

      if (info?.providerID && info?.modelID) {
        return { model: { providerID: info.providerID, modelID: info.modelID }, tools }
      }
    }
  } catch {
    return resolvePromptContextFromStorage(ctx, sessionID)
  }

  return resolvePromptContextFromStorage(ctx, sessionID)
}

export async function resolveRecentModelForSession(
  ctx: PluginInput,
  sessionID: string,
): Promise<RecentPromptModelInfo | undefined> {
  const context = await resolveRecentPromptContextForSession(ctx, sessionID)
  return context.model
}
