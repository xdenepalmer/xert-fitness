#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTITLEMENTS="$SCRIPT_DIR/../XertFitnessApp/XertFitnessApp.entitlements"
ENABLED="${ENABLE_UNIVERSAL_LINKS:-false}"
DOMAIN="xert-fitness.vercel.app"
TEAM_ID="${APPLE_TEAM_ID:-25R438YK9F}"
BUNDLE_ID_VALUE="${BUNDLE_ID:-com.xertfitness.app}"
PLIST_KEY=":com.apple.developer.associated-domains"

case "$ENABLED" in
  true|false) ;;
  *) echo "::error:: ENABLE_UNIVERSAL_LINKS must be true or false."; exit 1 ;;
esac

if /usr/libexec/PlistBuddy -c "Print $PLIST_KEY" "$ENTITLEMENTS" >/dev/null 2>&1; then
  /usr/libexec/PlistBuddy -c "Delete $PLIST_KEY" "$ENTITLEMENTS"
fi

if [ "$ENABLED" = "false" ]; then
  echo "Universal Links disabled; building without the Associated Domains entitlement."
  exit 0
fi

: "${VERCEL_BASE_URL:?VERCEL_BASE_URL is required when ENABLE_UNIVERSAL_LINKS=true.}"
[ "$VERCEL_BASE_URL" = "https://$DOMAIN" ] || {
  echo "::error:: Universal Links require VERCEL_BASE_URL=https://$DOMAIN."
  exit 1
}

AASA_FILE="$(mktemp)"
trap 'rm -f "$AASA_FILE"' EXIT
curl --silent --show-error --fail --max-time 20 \
  "$VERCEL_BASE_URL/.well-known/apple-app-site-association" \
  -o "$AASA_FILE"

node - "$AASA_FILE" "$TEAM_ID.$BUNDLE_ID_VALUE" <<'NODE'
const fs = require('fs');
const [file, expectedAppID] = process.argv.slice(2);
const association = JSON.parse(fs.readFileSync(file, 'utf8'));
const details = association?.applinks?.details;
const match = Array.isArray(details) && details.some(detail => {
  const appIDs = [detail.appID, ...(detail.appIDs || [])].filter(Boolean);
  return appIDs.includes(expectedAppID)
    && detail.components?.some(component => component['/'] === '/open/*' && component.exclude !== true);
});
if (!match) {
  console.error(`::error:: AASA does not associate ${expectedAppID} with /open/*.`);
  process.exit(1);
}
console.log(`AASA verified for ${expectedAppID}.`);
NODE

/usr/libexec/PlistBuddy -c "Add $PLIST_KEY array" "$ENTITLEMENTS"
/usr/libexec/PlistBuddy -c "Add $PLIST_KEY:0 string applinks:$DOMAIN" "$ENTITLEMENTS"
echo "Associated Domains entitlement enabled for applinks:$DOMAIN."
