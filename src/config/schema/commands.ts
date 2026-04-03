import { z } from "zod"

export const BuiltinCommandNameSchema = z.enum([
  "init-deep",
  "ralph-loop",
  "ulw-loop",
  "cancel-ralph",
  "refactor",
  "start-work",
  "start-review",
  "stop-continuation",
  "remove-ai-slops",
])

export type BuiltinCommandName = z.infer<typeof BuiltinCommandNameSchema>
