#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${1:-/home/user/.config/opencode-themis-test}"
START_REVIEW_COMMAND="${2:-/start-review review full repository for regressions}"
SESSION_NAME="omo-start-review-smoke-$$"
LOG_FILE="${3:-/tmp/oh-my-opencode.log}"
CAPTURE_FILE="${4:-/tmp/${SESSION_NAME}.capture.txt}"
BOOT_WAIT_SECONDS="${5:-8}"
POST_COMMAND_WAIT_SECONDS="${6:-12}"

rm -f "$LOG_FILE" "$CAPTURE_FILE"
tmux new-session -d -s "$SESSION_NAME" "OPENCODE_CONFIG_DIR=\"$CONFIG_DIR\" opencode"
sleep "$BOOT_WAIT_SECONDS"
tmux send-keys -t "$SESSION_NAME" "$START_REVIEW_COMMAND" Enter
sleep "$POST_COMMAND_WAIT_SECONDS"
tmux capture-pane -p -t "$SESSION_NAME" >"$CAPTURE_FILE"
tmux kill-session -t "$SESSION_NAME" || true

printf 'capture_file=%s\n' "$CAPTURE_FILE"
printf 'log_file=%s\n' "$LOG_FILE"
