import { withRecordedLockedInvocation, spawnLockedReviewWave } from "../review-routing"
import { assertReviewProfileInvariant, normalizeReviewStateForResumeAtPassBoundary } from "../review-state"
import { applyConvergenceWave } from "./convergence-wave"
import type { ReviewConvergenceLoopInput, ReviewConvergenceLoopResult } from "./types"

export async function runReviewConvergenceLoop(input: ReviewConvergenceLoopInput): Promise<ReviewConvergenceLoopResult> {
  assertReviewProfileInvariant(input.state, input.profile)
  let state = normalizeReviewStateForResumeAtPassBoundary(input.state, input.now)
  let wave = state.wave_counters.completed_waves + 1

  while (true) {
    const now = input.nowForWave?.(wave) ?? input.now
    await input.onWaveStarted?.(wave)
    const records = await spawnLockedReviewWave({
      manager: input.manager,
      profile: input.profile,
      wave,
      parentSessionID: input.parentSessionID,
      parentMessageID: input.parentMessageID,
      lanePrompts: input.lanePromptsForWave(wave),
      now,
    })

    for (const record of records) {
      state = withRecordedLockedInvocation(state, record)
    }

    await input.onWaveSpawned?.(state)

    const findings = await input.collectWaveFindings({ wave, state })
    const provenance = input.collectWaveProvenance?.({ wave, state })
    const decision = applyConvergenceWave({
      state,
      profile: input.profile,
      wave_findings: findings,
      wave_provenance: provenance,
      now,
      pass_cap_override: input.pass_cap_override,
    })

    state = decision.state
    await input.onWaveComplete?.({ wave, findings, decision })
    await input.onStateUpdate?.(state)
    if (!decision.should_continue && decision.stop_reason) {
      return {
        state,
        stop_reason: decision.stop_reason,
      }
    }

    wave += 1
  }
}
