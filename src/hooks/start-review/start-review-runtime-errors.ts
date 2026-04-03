export class StartReviewRuntimeHandledError extends Error {
  readonly reviewToastShown: boolean
  readonly recoveryAttempted: boolean

  constructor(message: string, input: { reviewToastShown: boolean; recoveryAttempted: boolean; cause?: unknown }) {
    super(message, input.cause ? { cause: input.cause } : undefined)
    this.name = "StartReviewRuntimeHandledError"
    this.reviewToastShown = input.reviewToastShown
    this.recoveryAttempted = input.recoveryAttempted
  }
}

export function isStartReviewRuntimeHandledError(error: unknown): error is StartReviewRuntimeHandledError {
  return error instanceof StartReviewRuntimeHandledError
}
