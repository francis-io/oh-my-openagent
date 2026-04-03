import type { BackgroundManager } from "../background-agent"
import { QUESTION_DENIED_SESSION_PERMISSION } from "../../shared/question-denied-session-permission"
import { registerLockedReviewRuntimeSession } from "../../shared/locked-review-session-registry"
import { createReviewWaveRoutingPlan } from "./routing-plan"
import type {
  LockedInvocationRecord,
  LockedInvocationSurface,
  ReviewLaneName,
} from "./types"
import type { ReviewProfileName } from "../../shared/model-requirements"

export type SpawnLockedReviewWaveInput = {
  manager: Pick<BackgroundManager, "launch">
  profile: ReviewProfileName
  wave: number
  parentSessionID: string
  parentMessageID: string
  lanePrompts: Record<ReviewLaneName, string>
  surface?: LockedInvocationSurface | "call_omo_agent"
  now?: string
}

function nowIso(value: string | undefined): string {
  return value ?? new Date().toISOString()
}

function assertLockedSurface(surface: SpawnLockedReviewWaveInput["surface"]): asserts surface is LockedInvocationSurface | undefined {
  if (surface === "call_omo_agent") {
    throw new Error("Locked Argus lane routing forbids call_omo_agent; use task/background-agent infrastructure")
  }
}

export async function spawnLockedReviewWave(input: SpawnLockedReviewWaveInput): Promise<LockedInvocationRecord[]> {
  assertLockedSurface(input.surface)

  const plan = createReviewWaveRoutingPlan(input.profile, input.wave)
  const createdAt = nowIso(input.now)
  const records: LockedInvocationRecord[] = []

  for (const lane of plan.lanes) {
    const task = await input.manager.launch({
      description: `argus ${lane.lane} wave ${plan.wave}`,
      prompt: input.lanePrompts[lane.lane],
      agent: lane.model_tuple.agent,
      model: {
        providerID: lane.model_tuple.provider,
        modelID: lane.model_tuple.model,
        variant: lane.model_tuple.variant,
        ...(lane.model_tuple.reasoningEffort ? { reasoningEffort: lane.model_tuple.reasoningEffort } : {}),
        ...(lane.model_tuple.thinking ? { thinking: lane.model_tuple.thinking } : {}),
      },
      parentSessionID: input.parentSessionID,
      parentMessageID: input.parentMessageID,
      sessionPermission: QUESTION_DENIED_SESSION_PERMISSION,
    })

    registerLockedReviewRuntimeSession(task.sessionID, {
      profile: plan.profile,
      role: lane.role,
      wave: plan.wave,
      lane: lane.lane,
    })

    records.push({
      invocation_type: "lane",
      profile: plan.profile,
      wave: plan.wave,
      role: lane.role,
      lane: lane.lane,
      lock_marker: lane.lock_marker,
      model_tuple: lane.model_tuple,
      surface: "task-background",
      task_id: task.id,
      session_id: task.sessionID,
      created_at: createdAt,
    })
  }

  records.push({
    invocation_type: "merge",
    profile: plan.profile,
    wave: plan.wave,
    role: plan.merge.role,
    lane: null,
    lock_marker: plan.merge.lock_marker,
    model_tuple: plan.merge.model_tuple,
    surface: "task-background",
    created_at: createdAt,
  })

  records.push({
    invocation_type: "tie-break",
    profile: plan.profile,
    wave: plan.wave,
    role: plan.tie_break.role,
    lane: null,
    lock_marker: plan.tie_break.lock_marker,
    model_tuple: plan.tie_break.model_tuple,
    surface: "task-background",
    created_at: createdAt,
  })

  return records
}
