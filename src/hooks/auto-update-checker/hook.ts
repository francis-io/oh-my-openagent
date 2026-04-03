import type { PluginInput } from "@opencode-ai/plugin"
import { log } from "../../shared/logger"
import { getCachedVersion, getLocalDevVersion } from "./checker"
import type { AutoUpdateCheckerOptions } from "./types"
import { runBackgroundUpdateCheck } from "./hook/background-update-check"
import { showConfigErrorsIfAny } from "./hook/config-errors-toast"
import { updateAndShowConnectedProvidersCacheStatus } from "./hook/connected-providers-status"
import { refreshModelCapabilitiesOnStartup } from "./hook/model-capabilities-status"
import { showModelCacheWarningIfNeeded } from "./hook/model-cache-warning"
import { showLocalDevToast, showVersionToast } from "./hook/startup-toasts"

const STARTUP_SESSION_GUARD_KEY = "__omo_auto_update_checker_root_sessions__"

function getSeenStartupSessions(): Set<string> {
  const state = globalThis as Record<string, unknown>
  const existing = state[STARTUP_SESSION_GUARD_KEY]
  if (existing instanceof Set) {
    return existing as Set<string>
  }

  const created = new Set<string>()
  state[STARTUP_SESSION_GUARD_KEY] = created
  return created
}

export function createAutoUpdateCheckerHook(ctx: PluginInput, options: AutoUpdateCheckerOptions = {}) {
  const {
    showStartupToast = true,
    isSisyphusEnabled = false,
    autoUpdate = true,
    modelCapabilities,
  } = options
  const isCliRunMode = process.env.OPENCODE_CLI_RUN_MODE === "true"

  const getToastMessage = (isUpdate: boolean, latestVersion?: string): string => {
    if (isSisyphusEnabled) {
      return isUpdate
        ? `Sisyphus on steroids is steering OpenCode.\nv${latestVersion} available. Restart to apply.`
        : "Sisyphus on steroids is steering OpenCode."
    }
    return isUpdate
      ? `OpenCode is now on Steroids. oMoMoMoMo...\nv${latestVersion} available. Restart OpenCode to apply.`
      : "OpenCode is now on Steroids. oMoMoMoMo..."
  }

  let hasChecked = false

  return {
    event: ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== "session.created") return
      if (isCliRunMode) return
      if (hasChecked) return

      const props = event.properties as { info?: { id?: string; parentID?: string } } | undefined
      if (props?.info?.parentID) return

      const rootSessionID = props?.info?.id
      if (typeof rootSessionID === "string" && getSeenStartupSessions().has(rootSessionID)) {
        return
      }

      hasChecked = true
      if (typeof rootSessionID === "string") {
        getSeenStartupSessions().add(rootSessionID)
      }

      setTimeout(async () => {
        const cachedVersion = getCachedVersion()
        const localDevVersion = getLocalDevVersion(ctx.directory)
        const displayVersion = localDevVersion ?? cachedVersion

        await showConfigErrorsIfAny(ctx)
        await updateAndShowConnectedProvidersCacheStatus(ctx)
        await refreshModelCapabilitiesOnStartup(modelCapabilities)
        await showModelCacheWarningIfNeeded(ctx)

        if (localDevVersion) {
          if (showStartupToast) {
            showLocalDevToast(ctx, displayVersion, isSisyphusEnabled).catch(() => {})
          }
          log("[auto-update-checker] Local development mode")
          return
        }

        if (showStartupToast) {
          showVersionToast(ctx, displayVersion, getToastMessage(false)).catch(() => {})
        }

        runBackgroundUpdateCheck(ctx, autoUpdate, getToastMessage).catch((err) => {
          log("[auto-update-checker] Background update check failed:", err)
        })
      }, 0)
    },
  }
}
