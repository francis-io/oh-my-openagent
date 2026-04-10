# Plan: Multi-Model Review Lanes + Consecutive Dry-Wave Convergence

## Objective

Two changes to the Themis review system:

1. **Multi-model Argus lanes** -- Each wave spawns multiple Argus instances using different LLM providers, reducing single-model blind spots.
2. **Consecutive dry-wave convergence** -- Stop after 2 consecutive waves with no new high-severity findings (not on the first dry wave).

---

## Context

### Current State

- `REVIEW_PROFILE_MODEL_POLICIES` in `src/shared/model-requirements.ts:44-91` defines a single `lockedArgusLane` tuple per profile (currently `claude-opus-4-6` for both test and production).
- `createReviewWaveRoutingPlan` in `src/features/review-routing/routing-plan.ts:33-65` creates exactly one lane entry per wave.
- `ReviewWaveRoutingPlan.lanes` is typed as `[ReviewLanePlan]` (single-element tuple) in `src/features/review-routing/types.ts:49`.
- `ReviewWaveProvenanceMap` in `src/features/review-loop/types.ts:24-26` already has `"argus" | "argus-gpt" | "argus-claude"` lane names, suggesting multi-model was anticipated.
- Convergence in `src/features/review-loop/convergence-wave.ts:175-178` stops on the first dry wave (`dryWave ? "dry-wave-complete"`). The `dry_waves` counter is cumulative, not consecutive.

### Key Files

| File | Purpose |
| --- | --- |
| `src/shared/model-requirements.ts` | Profile model policies, `LockedReviewModelTuple` type |
| `src/features/review-routing/types.ts` | `ReviewWaveRoutingPlan`, `ReviewLanePlan`, `ReviewLaneName` |
| `src/features/review-routing/routing-plan.ts` | `createReviewWaveRoutingPlan()` |
| `src/features/review-routing/spawn-locked-review-wave.ts` | Wave spawning logic |
| `src/features/review-loop/convergence-wave.ts` | `applyConvergenceWave()` -- stop conditions |
| `src/features/review-loop/types.ts` | `ReviewWaveProvenanceMap`, `ReviewConvergenceWaveResult` |
| `src/features/review-loop/convergence-loop.ts` | `runReviewConvergenceLoop()` |
| `src/features/review-state/review-state-types.ts` | `PersistedReviewState` wave_counters |

---

## Task 1: Multi-Model Argus Lanes

### 1.1 Expand `ReviewProfileModelPolicy` type

**File:** `src/shared/model-requirements.ts`

Change `lockedArgusLane` from a single tuple to an array:

```typescript
// Before
export type ReviewProfileModelPolicy = {
  lockedArgusLane: LockedReviewModelTuple;
  merge: LockedReviewModelTuple;
  tieBreak: LockedReviewModelTuple;
};

// After
export type ReviewProfileModelPolicy = {
  lockedArgusLanes: LockedReviewModelTuple[];
  merge: LockedReviewModelTuple;
  tieBreak: LockedReviewModelTuple;
};
```

**Acceptance criteria:**
- [ ] Type renamed from `lockedArgusLane` to `lockedArgusLanes` (array)
- [ ] All references updated (grep for `lockedArgusLane`)

### 1.2 Define multi-model lane policies

**File:** `src/shared/model-requirements.ts`

Update `REVIEW_PROFILE_MODEL_POLICIES` to include two Argus tuples per profile:

```typescript
test: {
  lockedArgusLanes: [
    {
      agent: "argus",
      provider: "anthropic",
      model: "claude-opus-4-6",
      variant: "max",
      thinking: { type: "enabled", budgetTokens: 32000 },
    },
    {
      agent: "argus",
      provider: "openai",
      model: "gpt-5.4",
      variant: "high",
      reasoningEffort: "high",
    },
  ],
  // merge and tieBreak unchanged
},
```

**Acceptance criteria:**
- [ ] Test profile has 2 Argus tuples (Claude + GPT)
- [ ] Production profile has 2 Argus tuples (same or stricter models)
- [ ] Each tuple has `agent: "argus"`

### 1.3 Expand `ReviewLaneName` type

**File:** `src/features/review-routing/types.ts`

```typescript
// Before
export type ReviewLaneName = "argus"

// After
export type ReviewLaneName = "argus-claude" | "argus-gpt"
```

Update `ReviewWaveRoutingPlan.lanes` from single-element tuple to array:

```typescript
// Before
lanes: [ReviewLanePlan]

// After
lanes: ReviewLanePlan[]
```

**Acceptance criteria:**
- [ ] Lane names reflect model provider
- [ ] `lanes` is a variable-length array
- [ ] `ReviewWaveProvenanceMap` type in `review-loop/types.ts` still covers the new lane names

### 1.4 Update `createReviewWaveRoutingPlan`

**File:** `src/features/review-routing/routing-plan.ts`

Generate one lane entry per tuple in `lockedArgusLanes`:

```typescript
export function createReviewWaveRoutingPlan(profile, wave) {
  const policy = REVIEW_PROFILE_MODEL_POLICIES[profile]

  const lanes = policy.lockedArgusLanes.map((tuple, index) => {
    const laneName = deriveLaneName(tuple) // e.g. "argus-claude", "argus-gpt"
    return {
      lane: laneName,
      role: "argus-lane",
      lock_marker: lockMarkerForInvocation(profile, "argus-lane", wave, laneName),
      model_tuple: tuple,
    }
  })

  // assertReviewRoutingTupleContract needs updating for array
  for (const lane of lanes) {
    assertTupleAgent(lane.model_tuple, "argus", `argus lane ${lane.lane}`)
  }

  return { profile, wave, lanes, merge: ..., tie_break: ... }
}
```

Add a `deriveLaneName` helper that maps provider to lane name:

```typescript
function deriveLaneName(tuple: LockedReviewModelTuple): ReviewLaneName {
  if (tuple.provider === "anthropic") return "argus-claude"
  if (tuple.provider === "openai") return "argus-gpt"
  return `argus-${tuple.provider}` as ReviewLaneName
}
```

**Acceptance criteria:**
- [ ] One lane per tuple in the policy
- [ ] Each lane gets a unique name and lock_marker
- [ ] Contract assertion checks all lanes

### 1.5 Update wave spawning

**File:** `src/features/review-routing/spawn-locked-review-wave.ts`

Verify this file iterates over `plan.lanes` (it likely does). If it assumes a single lane, update to iterate.

**Acceptance criteria:**
- [ ] All lanes in the routing plan are spawned
- [ ] Each lane gets its own background task with correct model tuple

### 1.6 Update finding collection

**File:** `src/hooks/start-review/start-review-runtime-lane-findings.ts`

Verify findings are collected from all lanes, not just `"argus"`.

**Acceptance criteria:**
- [ ] Findings from all lane names are aggregated
- [ ] Provenance map tracks which lane produced each finding

### 1.7 Update tests

**Files:**
- `src/shared/model-requirements.test.ts`
- `src/features/review-routing/review-routing.test.ts`
- `src/hooks/start-review/start-review-runtime-lane-prompts.test.ts`
- `src/hooks/start-review/start-review-runtime-lane-findings.test.ts` (if exists)

**Acceptance criteria:**
- [ ] Existing tests updated for array-based lanes
- [ ] New test: routing plan produces correct number of lanes per profile
- [ ] New test: lane names are unique within a wave

---

## Task 2: Consecutive Dry-Wave Convergence

### 2.1 Track consecutive dry waves in state

**File:** `src/features/review-state/review-state-types.ts`

Add `consecutive_dry_waves` to `wave_counters`:

```typescript
wave_counters: {
  completed_waves: number
  dry_waves: number              // keep for observability
  consecutive_dry_waves: number  // new: resets on non-dry wave
}
```

**Acceptance criteria:**
- [ ] New field added with default 0
- [ ] State normalization functions handle missing field (backward compat)

### 2.2 Update convergence logic

**File:** `src/features/review-loop/convergence-wave.ts`

```typescript
// Before (line 175-178)
const dryWave = newHighSeverityFingerprints.length === 0
const dryWaves = input.state.wave_counters.dry_waves + (dryWave ? 1 : 0)
const reachedCap = completedWaves >= passCap
const stopReason = dryWave ? "dry-wave-complete" : reachedCap ? "pass-cap-reached" : undefined

// After
const dryWave = newHighSeverityFingerprints.length === 0
const dryWaves = input.state.wave_counters.dry_waves + (dryWave ? 1 : 0)
const consecutiveDryWaves = dryWave
  ? (input.state.wave_counters.consecutive_dry_waves ?? 0) + 1
  : 0
const reachedCap = completedWaves >= passCap
const converged = consecutiveDryWaves >= 2
const stopReason = converged ? "dry-wave-complete" : reachedCap ? "pass-cap-reached" : undefined
```

Update the `wave_counters` in `nextState`:

```typescript
wave_counters: {
  completed_waves: completedWaves,
  dry_waves: dryWaves,
  consecutive_dry_waves: consecutiveDryWaves,
},
```

**Acceptance criteria:**
- [ ] First dry wave does NOT stop the loop
- [ ] Second consecutive dry wave stops with `"dry-wave-complete"`
- [ ] A non-dry wave between two dry waves resets the counter
- [ ] Pass cap still stops regardless of dry wave status

### 2.3 Update tests

**Files:**
- `src/features/review-loop/review-loop.test.ts`
- `src/features/review-loop/convergence-wave.ts` (inline tests if any)

**Acceptance criteria:**
- [ ] Test: single dry wave does not stop
- [ ] Test: two consecutive dry waves stop
- [ ] Test: dry -> non-dry -> dry does not stop (counter reset)
- [ ] Test: pass cap still overrides
- [ ] Test: backward compat when `consecutive_dry_waves` is missing from persisted state

---

## Task 3: Update Documentation

### 3.1 Update themis-reviewer.md

**File:** `docs/guide/themis-reviewer.md`

- Update architecture section to reflect multi-model lanes
- Update convergence description (2 consecutive dry waves, not 1)
- Update the ASCII diagram to show different-model Argus instances

**Acceptance criteria:**
- [ ] Docs match implementation
- [ ] Quickstart still accurate

---

## Execution Order

1. Task 2 (convergence) -- smaller change, no type signature changes in routing
2. Task 1.1-1.3 (types) -- foundational type changes
3. Task 1.4-1.6 (implementation) -- routing + spawning + collection
4. Task 1.7 + 2.3 (tests) -- validate everything
5. Task 3 (docs) -- update after implementation is stable

## Risk Notes

- **Breaking change surface**: `lockedArgusLane` -> `lockedArgusLanes` touches routing, spawning, and state. Grep thoroughly.
- **Backward compat**: Persisted review state may lack `consecutive_dry_waves`. Normalize with `?? 0`.
- **Lane prompt generation**: `lanePromptsForWave(wave)` returns `Record<ReviewLaneName, string>`. Must generate prompts for all lane names, not just `"argus"`.
- **Concurrency**: More lanes = more parallel tasks. Check `BackgroundManager` concurrency limits.

---

## Task 0: User-Facing Config (lanes on Argus agent)

### Design Decision

Use **Option 1**: extend the existing `agents.argus` config with a `lanes` array. This follows the established pattern -- users already configure agents in this section. No new top-level concepts.

**User config example** (`oh-my-openagent.jsonc`):

```jsonc
{
  "agents": {
    "themis": {
      "model": "openai/gpt-5.4",
      "variant": "high"
    },
    "argus": {
      "lanes": [
        {
          "model": "anthropic/claude-opus-4-6",
          "variant": "max",
          "thinking": { "budgetTokens": 32000 }
        },
        {
          "model": "openai/gpt-5.4",
          "variant": "high"
        }
      ]
    }
  }
}
```

**Backward compat**: If `argus` has `model` instead of `lanes`, treat it as a single-lane config (wrap in array internally). If neither is set, fall back to the hardcoded default policy.

### 0.1 Add `lanes` to Argus agent schema

**File:** `src/config/schema/agent-overrides.ts` (or wherever agent config Zod schemas live)

Add an optional `lanes` field to the argus agent override schema:

```typescript
lanes: z.array(z.object({
  model: z.string(),
  variant: z.string().optional(),
  thinking: z.object({
    budgetTokens: z.number().optional(),
  }).optional(),
  reasoningEffort: z.string().optional(),
})).optional()
```

Validation: `lanes` and `model` are mutually exclusive on the argus agent. Error if both are set.

**Acceptance criteria:**
- [ ] Schema accepts `lanes` array on argus config
- [ ] Schema rejects config with both `model` and `lanes` on argus
- [ ] Schema still accepts `model`-only config (backward compat)
- [ ] Schema still accepts empty argus config (falls back to defaults)

### 0.2 Wire config lanes into model policy resolution

**File:** `src/shared/model-requirements.ts` (or a new `review-lane-config-resolver.ts`)

Add a function that reads the plugin config and produces `LockedReviewModelTuple[]`:

```typescript
export function resolveArgusLaneTuples(pluginConfig): LockedReviewModelTuple[] {
  const argusConfig = pluginConfig?.agents?.argus

  // Option A: lanes array provided
  if (argusConfig?.lanes?.length) {
    return argusConfig.lanes.map(lane => ({
      agent: "argus",
      provider: extractProvider(lane.model), // "anthropic/claude-opus-4-6" -> "anthropic"
      model: extractModelName(lane.model),   // "anthropic/claude-opus-4-6" -> "claude-opus-4-6"
      variant: lane.variant ?? "medium",
      thinking: lane.thinking ? { type: "enabled", budgetTokens: lane.thinking.budgetTokens ?? 32000 } : undefined,
      reasoningEffort: lane.reasoningEffort,
    }))
  }

  // Option B: single model provided (backward compat)
  if (argusConfig?.model) {
    return [{
      agent: "argus",
      provider: extractProvider(argusConfig.model),
      model: extractModelName(argusConfig.model),
      variant: argusConfig.variant ?? "medium",
    }]
  }

  // Option C: no config, use hardcoded defaults
  return DEFAULT_ARGUS_LANE_TUPLES
}
```

This function replaces the hardcoded `lockedArgusLanes` in `REVIEW_PROFILE_MODEL_POLICIES` at runtime.

**Acceptance criteria:**
- [ ] lanes array config -> multi-model tuples
- [ ] Single model config -> single-element tuple array
- [ ] No config -> hardcoded defaults
- [ ] Provider extracted correctly from "provider/model" string format

### 0.3 Update JSON schema generation

**File:** `script/build-schema.ts` (or wherever the schema is generated)

Ensure the generated `oh-my-opencode.schema.json` includes the `lanes` field so users get autocomplete in their editor.

**Acceptance criteria:**
- [ ] Schema file includes lanes definition under argus agent
- [ ] Editor autocomplete works for lanes entries

---

## Updated Execution Order

1. **Task 0** (config schema + resolver) -- define how users configure lanes
2. **Task 2** (convergence) -- smaller change, no type signature changes in routing
3. **Task 1.1-1.3** (types) -- foundational type changes, wire in config resolver
4. **Task 1.4-1.6** (implementation) -- routing + spawning + collection
5. **Task 1.7 + 2.3** (tests) -- validate everything
6. **Task 3** (docs) -- update after implementation is stable
