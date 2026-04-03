import type { ReviewProfileName } from "../../shared/model-requirements"

export function inferRuntimeReviewProfile(requestedInput: string): ReviewProfileName {
  return /\b(production|prod|strict|final)\b/i.test(requestedInput) ? "production" : "test"
}
