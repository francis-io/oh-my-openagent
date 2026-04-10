# Themis: Automated Code Review for Completed Work

You built the feature. Now what -- read every file yourself? Hope you didn't miss anything?

Themis runs multiple AI reviewers in parallel against your completed work, merges their findings with deterministic consensus, and emits a remediation plan that Atlas can execute automatically. One command. Full review. Actionable output.

```
  Without Themis                          With Themis
  ─────────────                           ──────────

  You finish coding                       You finish coding
       │                                       │
       ▼                                       ▼
  Manual review ◄── hours                 /start-review ◄── one command
       │                                       │
       ▼                                       ├──► Argus Lane 1 ──┐
  Spot-check a few files                  ├──► Argus Lane 2 ──┤ parallel
  Hope for the best                       └──► Argus Lane N ──┘
       │                                       │
       ▼                                       ▼
  Ship it (fingers crossed)               Deterministic merge
                                               │
                                               ▼
                                          Remediation plan
                                               │
                                               ▼
                                          /start-work ◄── auto-fix
```

**What you get:**

- **Parallel review lanes** -- N independent Argus reviewers analyze your code simultaneously, each producing structured findings with file paths, line ranges, and severity ratings.
- **Deterministic merge** -- Findings are merged by TypeScript consensus logic, not LLM opinion. Conflicts go through a tie-break phase.
- **Actionable output** -- The final artifact is a remediation plan in `.sisyphus/plans/` that Atlas can execute via `/start-work`. Review flows directly into fixes.
- **Two review modes** -- Review against a specific plan (`plan+git-diff`) or scan the whole repo (`repo-wide`).
- **Tunable strictness** -- `test` profile (6 waves, lighter) for iteration; `production` profile (10 waves, stricter) for release gates.

---

## Quickstart (5 minutes)

Set the install location and config directory, then run the script below:

```bash
# Where to clone the plugin and where to store the config
THEMIS_DIR=~/git/oh-my-openagent
THEMIS_CONFIG=~/.config/opencode-themis

# 1. Clone and build
git clone https://github.com/francis-io/oh-my-openagent.git "$THEMIS_DIR"
cd "$THEMIS_DIR"
bun install
bun run build

# 2. Create config directory
mkdir -p "$THEMIS_CONFIG"

# 3. Write OpenCode config
cat > "$THEMIS_CONFIG/opencode.jsonc" << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": [
    "file://$THEMIS_DIR"
  ],
  "provider": {
    "openai": {
      "options": {
        "apiKey": "${OPENAI_API_KEY:-YOUR_API_KEY}"
      }
    }
  }
}
EOF

# 4. Write plugin config (themis + argus are required, others optional)
cat > "$THEMIS_CONFIG/oh-my-openagent.jsonc" << 'EOF'
{
  "agents": {
    "sisyphus": {
      "model": "openai/gpt-5.4",
      "variant": "medium"
    },
    "hephaestus": {
      "model": "openai/gpt-5.4",
      "variant": "medium"
    },
    "themis": {
      "model": "openai/gpt-5.4",
      "variant": "high"
    },
    "argus": {
      "model": "openai/gpt-5.4",
      "variant": "medium"
    }
  }
}
EOF

# 5. Launch OpenCode with Themis
OPENCODE_CONFIG_DIR="$THEMIS_CONFIG" opencode
```

Press Tab -- Themis should be in the agent list. Or just type `/start-review` from Sisyphus.

To launch again later:

```bash
OPENCODE_CONFIG_DIR=~/.config/opencode-themis opencode
```

### Try a review

```
/start-review .sisyphus/plans/my-feature.md
```

Or for a broad repo scan:

```
/start-review
```

---

## The Two Review Modes

### `plan+git-diff` -- "Did I build what was planned?"

```
/start-review .sisyphus/plans/my-feature.md
```

Themis reviews the actual code changes against the plan's requirements. It catches:
- Missed requirements from the plan
- Partial implementations
- Deviations from the spec
- Correctness issues in the changed code

Best used right after `/start-work` finishes executing a Prometheus plan. The plan provides the contract; Themis verifies the implementation honors it.

### `repo-wide` -- "What's wrong with this codebase?"

```
/start-review
```

Themis reviews the repository without a plan as reference. Useful for:
- General code quality passes
- Onboarding to a new codebase
- Reviewing work done without a formal plan
- Pre-release sanity checks

When input is ambiguous (e.g. `/start-review .`), Themis asks a confirmation question before proceeding.

---

## How It Works

### Architecture

```
                    ┌──────────────────┐
                    │     Themis       │
                    │  (Coordinator)   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Argus    │  │ Argus    │  │ Argus    │
        │ Lane 1   │  │ Lane 2   │  │ Lane N   │
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             │              │              │
             ▼              ▼              ▼
        findings.json  findings.json  findings.json
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                    ┌──────────────────┐
                    │ Deterministic    │
                    │ Merge + Tiebreak │
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ Remediation Plan │
                    │ (.sisyphus/plans)│
                    └──────────────────┘
                             │
                             ▼
                    /start-work (auto-fix)
```

**Themis** (coordinator) owns lifecycle, not code analysis. It announces the review profile, sequences phases, validates the merge, and emits the remediation plan. It never acts as a leaf reviewer.

**Argus** (leaf reviewer) is read-only. Cannot write code, spawn subagents, or ask the user questions. Each instance runs independently and returns structured JSON. Tool access is restricted to read operations only.

### Review Lifecycle

```
Phase 1: Target Materialization
    Resolve review scope --> target.json (scope keys, suppression keys)
         │
         ▼
Phase 2: Lane Execution
    Parallel Argus instances --> pass-{n}.json per lane
    Findings anchored to paths/symbols/line ranges for stable identity
         │
         ▼
Phase 3: Merge
    Deterministic TypeScript consensus merges lane findings
    Themis validates (does not replace) the merge result
         │
         ▼
Phase 4: Tie-break (if needed)
    Conflicting findings across lanes resolved
    Themis sequences and reports outcome
         │
         ▼
Phase 5: Completion
    Canonical remediation plan emitted
    All artifacts written to .sisyphus/reviews/{review-run-id}/
```

### Profiles

| Profile | Wave Cap | When to Use |
| --- | --- | --- |
| `test` | 6 | During development. Lighter model settings, faster iteration. |
| `production` | 10 | Before merge/release. Stricter confidence thresholds. |

Both profiles pin stronger model policies during lane, merge, and tie-break execution.

### Finding Schema

Every Argus finding follows a locked schema:

```
category:    correctness | requirement-mismatch | best-practice | simplify-remove
severity:    blocking | major | minor | nit
confidence:  low | medium | high
```

Each finding includes:
- `title` and `summary`
- `evidence[]` -- file path, symbol, line range, rationale
- `remediation` -- intent and optional summary
- Optional `fingerprint` / `suppression_identity` for dedup across runs

Findings use stable identity anchored to durable code locations (paths, symbols, line ranges), not prose.

### Artifacts

```
.sisyphus/reviews/{review-run-id}/
    target.json                        # Review target and scope keys
    state.json                         # Lifecycle state transitions
    lanes/{lane}/pass-{n}.json         # Raw Argus findings per pass
    lanes/{lane}/pass-{n}.md           # Human-readable lane summary
    merged-findings.json               # Deterministic merge output
    conflicts.json                     # Cross-lane conflicts
    remediation-plan.snapshot.md       # Point-in-time snapshot
    canonical-remediation-path.txt     # Points to the canonical plan

.sisyphus/plans/review-remediation-{review-run-id}.md    # <-- the canonical plan
```

The canonical remediation plan feeds directly into `/start-work` for automated fixes via Atlas.

---

## End-to-End Workflow

```
1. Build your feature
   ultrawork | /start-work | manual coding

2. Review it
   /start-review .sisyphus/plans/my-feature.md

3. Themis announces profile, spawns Argus lanes

4. Argus lanes return structured findings

5. Themis merges findings, resolves conflicts

6. Remediation plan emitted at:
   .sisyphus/plans/review-remediation-{id}.md

7. Execute remediation (optional):
   /start-work
   Atlas picks up the remediation plan and fixes the issues
```

---

## Configuration Reference

### Model Guidance

| Agent | Role | Recommended Variant | Why |
| --- | --- | --- | --- |
| **Themis** | Coordinator | `high` or `xhigh` | Needs strong reasoning for lifecycle sequencing |
| **Argus** | Leaf reviewer | `medium` | Runs in parallel; `medium` balances cost and quality |

### Config Keys

In `oh-my-openagent.jsonc`:

```jsonc
{
  "agents": {
    "themis": {
      "model": "openai/gpt-5.4",
      "variant": "high"
    },
    "argus": {
      "model": "openai/gpt-5.4",
      "variant": "medium"
    }
  }
}
```

### Rebuilding After Changes

If you modify the plugin source (e.g. `src/agents/themis.ts`), rebuild:

```bash
cd ~/git/oh-my-openagent
bun run build
```

Then restart OpenCode.

---

## Where Themis Fits

```
  Prometheus ──► Plan ──► /start-work ──► Atlas executes ──► Code done
                                                                  │
                                                                  ▼
                                                           /start-review
                                                                  │
                                                                  ▼
                                                           Themis reviews
                                                                  │
                                                                  ▼
                                                        Remediation plan
                                                                  │
                                                                  ▼
                                                           /start-work
                                                         (Atlas auto-fixes)
```

| Agent | Stage | What It Does |
| --- | --- | --- |
| **Prometheus** | Pre-implementation | Plans what to build |
| **Momus** | Pre-implementation | Reviews the plan before execution |
| **Atlas** | Implementation | Executes the plan |
| **Themis** | Post-implementation | Reviews the completed work |
| **Argus** | Post-implementation | Runs review lanes under Themis |
| **Atlas** | Remediation | Executes the review fixes |

---

## Further Reading

- [Orchestration Guide](./orchestration.md) -- how all agents work together
- [Overview](./overview.md) -- Oh My OpenAgent introduction
- [Features Reference](../reference/features.md) -- full feature list
- [Configuration Reference](../reference/configuration.md) -- all config options
