import type { PersistedReviewState } from "../../features/review-state"
import { createReviewArtifactPaths } from "../../features/review-artifacts"
import type { ReviewWaveFinding } from "../../features/review-loop"
import { parseRuntimeTaskFindings } from "./start-review-runtime-task-findings"
import { writeJsonFileAtomic, writeTextFileAtomic } from "./start-review-runtime-file-write"
import { resolveRuntimeTaskResultText } from "./start-review-runtime-task-output"
import { waitForRuntimeTaskTerminal } from "./start-review-runtime-task-wait"
import type { RuntimeBackgroundManager } from "./start-review-runtime-types"

type LaneName = "argus" | "argus-gpt" | "argus-claude"

export type RuntimeLaneFindingRecord = {
  lane: LaneName
  finding: ReviewWaveFinding
}

function assertExpectedLaneCoverage(input: {
  wave: number
  laneRecords: PersistedReviewState["lane_lineage_by_wave"][string]
}): void {
  const lanes = new Set(input.laneRecords.map((record) => record.lane).filter(Boolean))
  if (lanes.size === 0) {
    throw new Error(`Wave ${input.wave} did not materialize any Argus lane`)
  }
}

export async function collectRuntimeLaneFindingsForWave(input: {
  wave: number
  state: PersistedReviewState
  manager: RuntimeBackgroundManager
  paths: ReturnType<typeof createReviewArtifactPaths>
}): Promise<RuntimeLaneFindingRecord[]> {
  const laneRecords = input.state.lane_lineage_by_wave[String(input.wave)] ?? []
  assertExpectedLaneCoverage({ wave: input.wave, laneRecords })
  const collected: RuntimeLaneFindingRecord[] = []

  for (const record of laneRecords) {
    if (!record.task_id) {
      throw new Error(`Wave ${input.wave} lane ${record.lane} is missing task id`)
    }

    const task = await waitForRuntimeTaskTerminal(input.manager, record.task_id, {
      timeout_ms: 600_000,
      label: `Argus lane ${record.lane} wave ${input.wave}`,
    })
    const resultText = await resolveRuntimeTaskResultText(input.manager, task)
    if (task.status !== "completed" || typeof resultText !== "string") {
      throw new Error(`Wave ${input.wave} lane ${record.lane} did not complete successfully (status=${task.status})`)
    }

    writeTextFileAtomic(input.paths.lanePassMarkdownPath(record.lane, input.wave), resultText)

    const findings = parseRuntimeTaskFindings(resultText)
    writeJsonFileAtomic(input.paths.lanePassJsonPath(record.lane, input.wave), findings)

    for (const finding of findings) {
      collected.push({ lane: record.lane, finding })
    }
  }

  return collected
}

export function flattenRuntimeFindingsByWave(
  findingsByWave: Map<number, RuntimeLaneFindingRecord[]>,
): RuntimeLaneFindingRecord[] {
  return [...findingsByWave.entries()]
    .sort((left, right) => left[0] - right[0])
    .flatMap((entry) => entry[1])
}
