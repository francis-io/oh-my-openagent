import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { writeCanonicalRemediationPlan, type ReviewConsensusFinding } from "../../features/review-merge"
import {
  applyFindingStateTransition,
  readReviewState,
  writeReviewStateAtomic,
  type PendingFinalConflictBatch,
  type PersistedReviewState,
} from "../../features/review-state"
import { normalizeSDKResponse } from "../../shared"
import { hasUnansweredQuestion } from "../todo-continuation-enforcer/pending-question-detection"

const DISMISS_OPTION_LABEL = "Dismiss finding"

type SessionMessagePart = { type: string; name?: string; toolName?: string; text?: string }
type SessionMessage = {
  info?: { role?: string }
  role?: string
  parts?: SessionMessagePart[]
}

export type PendingFinalReviewContext = {
  state: PersistedReviewState
  statePath: string
  mergedFindingsPath: string
}

type ParsedFinalDecision = {
  fingerprint: string
  selected_option: string
  next_state: "accepted_open" | "dismissed"
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase()
}

function getReviewRoot(workspaceRoot: string): string {
  return join(workspaceRoot, ".sisyphus", "reviews")
}

function readPendingReviewCandidates(workspaceRoot: string): PendingFinalReviewContext[] {
  const reviewRoot = getReviewRoot(workspaceRoot)
  if (!existsSync(reviewRoot)) {
    return []
  }

  return readdirSync(reviewRoot)
    .map((entry) => {
      const statePath = join(reviewRoot, entry, "state.json")
      const state = readReviewState(statePath)
      if (!state?.pending_final_conflict_batch) {
        return null
      }

      return {
        state,
        statePath,
        mergedFindingsPath: join(reviewRoot, entry, "merged-findings.json"),
      }
    })
    .filter((entry): entry is PendingFinalReviewContext => Boolean(entry))
}

export function findPendingFinalReviewForSession(
  workspaceRoot: string,
  sessionID: string,
): PendingFinalReviewContext | null {
  const matching = readPendingReviewCandidates(workspaceRoot)
    .filter((entry) => entry.state.coordinator_session_id === sessionID)
    .sort((left, right) => right.state.updated_at.localeCompare(left.state.updated_at))

  return matching[0] ?? null
}

function matchOptionForConflict(raw: string, conflict: PendingFinalConflictBatch["conflicts"][number]): string | null {
  const normalized = normalizeToken(raw)
  if (!normalized) {
    return null
  }

  if (normalized.includes("dismiss")) {
    return DISMISS_OPTION_LABEL
  }

  for (let index = 0; index < conflict.options.length; index++) {
    const option = conflict.options[index]
    const normalizedOption = normalizeToken(option)
    if (normalized === normalizedOption || normalized.includes(normalizedOption)) {
      return option
    }

    const ordinal = String(index + 1)
    if (normalized === ordinal || normalized === `option ${ordinal}` || normalized.startsWith(`${ordinal}.`)) {
      return option
    }
  }

  return null
}

function parseDecisionLines(answerText: string): string[] {
  return answerText
    .split(/\r?\n|;/g)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
}

export function parsePendingFinalConflictDecisions(input: {
  batch: PendingFinalConflictBatch
  answerText: string
}): ParsedFinalDecision[] | null {
  const lines = parseDecisionLines(input.answerText)
  const decisions: ParsedFinalDecision[] = []

  for (let index = 0; index < input.batch.conflicts.length; index++) {
    const conflict = input.batch.conflicts[index]
    const source = input.batch.conflicts.length === 1
      ? input.answerText
      : lines[index] ?? ""
    const matched = matchOptionForConflict(source, conflict)
    if (!matched) {
      return null
    }

    decisions.push({
      fingerprint: conflict.fingerprint,
      selected_option: matched,
      next_state: matched === DISMISS_OPTION_LABEL ? "dismissed" : "accepted_open",
    })
  }

  return decisions
}

function readConsensusFindings(mergedFindingsPath: string): ReviewConsensusFinding[] {
  if (!existsSync(mergedFindingsPath)) {
    return []
  }

  try {
    const parsed = JSON.parse(readFileSync(mergedFindingsPath, "utf-8")) as {
      consensus_findings?: ReviewConsensusFinding[]
    }
    return Array.isArray(parsed.consensus_findings) ? parsed.consensus_findings : []
  } catch {
    return []
  }
}

export function applyPendingFinalConflictDecisions(input: {
  workspaceRoot: string
  pendingReview: PendingFinalReviewContext
  answerText: string
  now?: string
}): { state: PersistedReviewState; selected_options: string[] } | null {
  const batch = input.pendingReview.state.pending_final_conflict_batch
  if (!batch) {
    return null
  }

  const decisions = parsePendingFinalConflictDecisions({
    batch,
    answerText: input.answerText,
  })
  if (!decisions) {
    return null
  }

  const at = input.now ?? new Date().toISOString()
  const nextFindings = { ...input.pendingReview.state.findings }

  for (const decision of decisions) {
    const finding = nextFindings[decision.fingerprint]
    if (!finding) {
      throw new Error(`Missing persisted review finding for final adjudication fingerprint: ${decision.fingerprint}`)
    }

    nextFindings[decision.fingerprint] = applyFindingStateTransition(finding, decision.next_state, {
      at,
      reason: `final-user-adjudication:${decision.selected_option}`,
    })
  }

  const nextState: PersistedReviewState = {
    ...input.pendingReview.state,
    phase: "completed",
    pending_final_conflict_batch: undefined,
    findings: nextFindings,
    updated_at: at,
  }

  writeReviewStateAtomic(input.pendingReview.statePath, nextState)

  writeCanonicalRemediationPlan({
    project_root: input.workspaceRoot,
    review_run_id: nextState.review_run_id,
    review_scope_key: nextState.review_scope_key,
    suppression_scope_key: nextState.suppression_scope_key,
    generated_at: at,
    consensus_findings: readConsensusFindings(input.pendingReview.mergedFindingsPath),
    accepted_open_findings: Object.values(nextState.findings)
      .filter((finding) => finding.state === "accepted_open")
      .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint)),
    persisted_findings: nextState.findings,
  })

  return {
    state: nextState,
    selected_options: decisions.map((decision) => decision.selected_option),
  }
}

export async function hasPendingFinalReviewQuestion(input: {
  messagesApi: ((args: { path: { id: string }; query?: { directory: string } }) => Promise<unknown>) | undefined
  sessionID: string
  workspaceRoot: string
}): Promise<boolean> {
  if (typeof input.messagesApi !== "function") {
    return false
  }

  try {
    const response = await input.messagesApi({
      path: { id: input.sessionID },
      query: { directory: input.workspaceRoot },
    })
    const messages = normalizeSDKResponse(response, [] as SessionMessage[], {
      preferResponseOnMissingData: true,
    })
    return hasUnansweredQuestion(Array.isArray(messages) ? messages : [])
  } catch {
    return false
  }
}

export function createPendingFinalConflictQuestionBlock(input: {
  pendingReview: PendingFinalReviewContext
  questionAlreadyPending: boolean
}): string {
  const batch = input.pendingReview.state.pending_final_conflict_batch
  if (!batch) {
    return ""
  }

  const lines = [
    "## Final Review Conflict Adjudication Required",
    "",
    `- Review run id: \`${input.pendingReview.state.review_run_id}\``,
    `- Pending conflicts: \`${batch.conflicts.length}\``,
    "",
  ]

  if (input.questionAlreadyPending) {
    lines.push("A final review question is already pending. Reuse that pending question context and do not issue another question.")
    return lines.join("\n")
  }

  lines.push("Before continuing, call the existing `question` tool with the following questions in this exact order:")
  lines.push("")

  batch.conflicts.forEach((conflict, index) => {
    lines.push(`${index + 1}. ${conflict.summary}`)
    conflict.options.forEach((option, optionIndex) => {
      lines.push(`   ${optionIndex + 1}. ${option}`)
    })
    lines.push("")
  })

  lines.push("Do not start a new review run until these pending final conflicts are resolved.")
  return lines.join("\n")
}
