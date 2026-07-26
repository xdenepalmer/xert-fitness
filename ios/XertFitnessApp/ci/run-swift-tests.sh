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
      # Neutral wording: the caller decides whether a timeout is fatal, so this
      # must not emit an ::error:: annotation on runs that recover from it.
      echo "Command exceeded ${timeout_seconds}s and was terminated: $*" >&2
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

# A cold CI simulator spends minutes in first-boot data migration (container,
# keychain and legacy-account migrators) before it reports a completed boot, so
# the old 180s window killed otherwise-healthy runs seconds from success.
# Treat a slow boot as a warning rather than a build failure: xcodebuild waits
# for the destination itself and reports a far clearer error if it never shows.
if ! run_with_timeout 600 xcrun simctl bootstatus "$SIMULATOR_ID" -b; then
  echo "::warning:: Simulator did not report a completed boot in time; continuing and letting xcodebuild wait for the destination."
fi

set +e
run_with_timeout 720 xcodebuild test \
  -project "$XCODE_PROJECT" \
  -scheme "$XCODE_SCHEME" \
  -destination "platform=iOS Simulator,id=$SIMULATOR_ID" \
  -destination-timeout 300 \
  -only-testing:XertFitnessTests \
  -parallel-testing-enabled NO \
  -test-timeouts-enabled YES \
  -default-test-execution-time-allowance 60 \
  -maximum-test-execution-time-allowance 120 \
  -resultBundlePath build/test-results.xcresult \
  CODE_SIGNING_ALLOWED=NO
TEST_STATUS=$?
set -e

if [[ "$TEST_STATUS" -ne 0 ]]; then
  echo "::error:: Swift unit tests failed (exit ${TEST_STATUS})."
  exit "$TEST_STATUS"
fi
