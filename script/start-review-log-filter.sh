#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="${1:-/tmp/oh-my-opencode.log}"

grep -E "start-review|top-level-prompt-injector|resolve-registered-prompt-agent|dispatching (real|synthetic) session.idle|deduped .*session.idle|command.execute.before|prompt-agent-unavailable|prompt-surface-unavailable|prompt-send-failed|degraded mode|Context injected|Inline runtime bootstrap completed" "$LOG_FILE"
