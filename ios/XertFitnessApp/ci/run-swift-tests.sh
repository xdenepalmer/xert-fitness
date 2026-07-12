#!/usr/bin/env bash

set -euo pipefail

run_with_timeout() {
  local timeout_seconds="$1"
  shift

  "$@" &
  local command_pid=$!
  (
    sleep "$timeout_seconds"
    if kill -0 "$command_pid" 2>/dev/null; then
      echo "::error:: Command exceeded ${timeout_seconds}s and was terminated: $*"
      kill -TERM "$command_pid" 2>/dev/null || true
      sleep 5
      kill -KILL "$command_pid" 2>/dev/null || true
    fi
  ) &
  local watchdog_pid=$!

  set +e
  wait "$command_pid"
  local status=$?
  set -e
  kill "$watchdog_pid" 2>/dev/null || true
  wait "$watchdog_pid" 2>/dev/null || true
  return "$status"
}

: "${XCODE_PROJECT:?XCODE_PROJECT is required}"
: "${XCODE_SCHEME:?XCODE_SCHEME is required}"

SIMULATOR_ID="$(xcrun simctl list devices available | awk -F '[()]' '/iPhone/ { print $2; exit }')"
if [[ -z "$SIMULATOR_ID" ]]; then
  echo "::error:: No available iPhone simulator was found."
  exit 1
fi

echo "Using iPhone simulator $SIMULATOR_ID"
xcrun simctl boot "$SIMULATOR_ID" 2>/dev/null || true
run_with_timeout 180 xcrun simctl bootstatus "$SIMULATOR_ID" -b

run_with_timeout 720 xcodebuild test \
  -project "$XCODE_PROJECT" \
  -scheme "$XCODE_SCHEME" \
  -destination "platform=iOS Simulator,id=$SIMULATOR_ID" \
  -destination-timeout 120 \
  -only-testing:XertFitnessTests \
  -parallel-testing-enabled NO \
  -test-timeouts-enabled YES \
  -default-test-execution-time-allowance 60 \
  -maximum-test-execution-time-allowance 120 \
  -resultBundlePath build/test-results.xcresult \
  CODE_SIGNING_ALLOWED=NO
