import { resolveModelPipeline } from "../../shared"
import { transformModelForProvider } from "../../shared/provider-model-id-transform"

export function applyModelResolution(input: {
  uiSelectedModel?: string
  userModel?: string
  requirement?: { fallbackChain?: { providers: string[]; model: string; variant?: string }[] }
  lockedRequiredModel?: { providerID: string; modelID: string; variant?: string }
  availableModels: Set<string>
  systemDefaultModel?: string
}) {
  const { uiSelectedModel, userModel, requirement, lockedRequiredModel, availableModels, systemDefaultModel } = input

  if (lockedRequiredModel) {
    const transformedModel = transformModelForProvider(
      lockedRequiredModel.providerID,
      lockedRequiredModel.modelID,
    )
    const exactModel = `${lockedRequiredModel.providerID}/${transformedModel}`

    if (!availableModels.has(exactModel)) {
      return undefined
    }

    return {
      model: exactModel,
      provenance: "provider-fallback" as const,
      variant: lockedRequiredModel.variant,
    }
  }

  return resolveModelPipeline({
    intent: { uiSelectedModel, userModel },
    constraints: { availableModels },
    policy: { fallbackChain: requirement?.fallbackChain, systemDefaultModel },
  })
}

export function getFirstFallbackModel(requirement?: {
  fallbackChain?: { providers: string[]; model: string; variant?: string }[]
}) {
  const entry = requirement?.fallbackChain?.[0]
  if (!entry || entry.providers.length === 0) return undefined
  const provider = entry.providers[0]
  const transformedModel = transformModelForProvider(provider, entry.model)
  return {
    model: `${provider}/${transformedModel}`,
    provenance: "provider-fallback" as const,
    variant: entry.variant,
  }
}
