#!/usr/bin/env bash
#
# Store App Store Connect credentials in the macOS login Keychain so the MCP
# server can read them with no plaintext secrets in any config file.
#
# Usage:
#   scripts/setup-keychain.sh \
#     --key-id 4HZ68VGRH3 \
#     --issuer-id 12345678-aaaa-bbbb-cccc-1234567890ab \
#     --p8 ~/.appstoreconnect/keys/AuthKey_4HZ68VGRH3.p8 \
#     [--vendor-number 0000000]
#
# Re-running updates the stored values (idempotent). After running you can
# delete the .p8 file and remove the APP_STORE_CONNECT_* env vars from your MCP
# client config; the server will read from the Keychain.
#
# Each item is added with `-T /usr/bin/security` so the `security` CLI (which is
# what the server shells out to) can read it without a GUI prompt.

set -euo pipefail

SERVICE="appstore-connect-mcp"
SECURITY="/usr/bin/security"
KEY_ID="" ISSUER_ID="" P8_PATH="" VENDOR_NUMBER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --key-id)        KEY_ID="$2"; shift 2 ;;
    --issuer-id)     ISSUER_ID="$2"; shift 2 ;;
    --p8)            P8_PATH="$2"; shift 2 ;;
    --vendor-number) VENDOR_NUMBER="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$KEY_ID"    ]] || { echo "Missing --key-id" >&2; exit 2; }
[[ -n "$ISSUER_ID" ]] || { echo "Missing --issuer-id" >&2; exit 2; }
[[ -n "$P8_PATH"   ]] || { echo "Missing --p8" >&2; exit 2; }

P8_PATH="${P8_PATH/#\~/$HOME}"
[[ -f "$P8_PATH" ]] || { echo "No .p8 file at: $P8_PATH" >&2; exit 1; }

store() {
  local account="$1" value="$2" encoded
  # base64-encode before storing. `security find-generic-password -w` returns
  # values containing newlines (like a PEM) as hex, and a bare numeric value is
  # ambiguous with hex; base64 (printable, no newlines) round-trips cleanly and
  # the reader always base64-decodes. tr strips any wrap newlines base64 adds.
  encoded=$(printf '%s' "$value" | base64 | tr -d '\n')
  "$SECURITY" add-generic-password -U \
    -s "$SERVICE" -a "$account" \
    -T "$SECURITY" \
    -w "$encoded" >/dev/null
  echo "  stored: $account"
}

echo "Storing App Store Connect credentials in the login Keychain (service: $SERVICE)"
store "key-id"      "$KEY_ID"
store "issuer-id"   "$ISSUER_ID"
store "private-key" "$(cat "$P8_PATH")"
[[ -n "$VENDOR_NUMBER" ]] && store "vendor-number" "$VENDOR_NUMBER"

echo
echo "Done. Verify with:"
echo "  security find-generic-password -s $SERVICE -a key-id -w"
echo
echo "You can now remove APP_STORE_CONNECT_* env vars from your MCP client config,"
echo "and (optionally) delete the .p8 file: $P8_PATH"
