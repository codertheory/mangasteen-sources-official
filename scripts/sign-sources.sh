#!/usr/bin/env bash
# Re-sign every source's main.js with the repo's Ed25519 private key.
#
# The host verifies main.js.sig on every sync — a stale signature causes the source to be
# rejected, so this script MUST be run whenever you edit a source's main.js. The CI-blessed
# path is:
#
#     $ vim sources/mangago/main.js
#     $ scripts/sign-sources.sh
#     $ git add sources/mangago/main.js sources/mangago/main.js.sig
#     $ git commit -m "…"
#
# Private key location is controlled by the MANGASTEEN_SIGNING_KEY env var; defaults to
# ~/.mangasteen-signing-key.pem. The matching public key lives at publickey.pem at the repo
# root and must stay in sync with the private one — rotate carefully (see CLAUDE.md).

set -euo pipefail

KEY="${MANGASTEEN_SIGNING_KEY:-$HOME/.mangasteen-signing-key.pem}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_KEY="$REPO_ROOT/publickey.pem"

if [ ! -f "$KEY" ]; then
  echo "❌ Private key not found at $KEY" >&2
  echo "   Set MANGASTEEN_SIGNING_KEY to its path, or (first-time setup) generate one:" >&2
  echo "     openssl genpkey -algorithm ED25519 -out \"\$HOME/.mangasteen-signing-key.pem\"" >&2
  echo "     chmod 600 \"\$HOME/.mangasteen-signing-key.pem\"" >&2
  echo "     openssl pkey -in \"\$HOME/.mangasteen-signing-key.pem\" -pubout -out \"$PUBLIC_KEY\"" >&2
  exit 1
fi

if [ ! -f "$PUBLIC_KEY" ]; then
  echo "❌ publickey.pem missing at $PUBLIC_KEY" >&2
  echo "   Derive it from the private key with:" >&2
  echo "     openssl pkey -in \"$KEY\" -pubout -out \"$PUBLIC_KEY\"" >&2
  exit 1
fi

# Sanity check: the public key in the repo must match the private key we're signing with.
# Compare just the 32-byte key material so format differences don't confuse us.
expected_pub="$(openssl pkey -in "$KEY" -pubout 2>/dev/null | openssl pkey -pubin -outform DER | tail -c 32 | xxd -p)"
actual_pub="$(openssl pkey -pubin -in "$PUBLIC_KEY" -outform DER | tail -c 32 | xxd -p)"
if [ "$expected_pub" != "$actual_pub" ]; then
  echo "❌ Private key ($KEY) does not match publickey.pem." >&2
  echo "   Rotating keys? Update publickey.pem first and know that every app install that" >&2
  echo "   has this repo will reject all sources until they re-add the repo." >&2
  exit 1
fi

signed=0
for dir in "$REPO_ROOT"/sources/*/; do
  [ -f "$dir/main.js" ] || continue
  name="$(basename "$dir")"
  openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$dir/main.js" -out "$dir/main.js.sig"
  openssl pkeyutl -verify -pubin -inkey "$PUBLIC_KEY" -rawin -in "$dir/main.js" -sigfile "$dir/main.js.sig" > /dev/null
  echo "✅ $name"
  signed=$((signed + 1))
done

if [ "$signed" -eq 0 ]; then
  echo "❌ No sources found under $REPO_ROOT/sources" >&2
  exit 1
fi

echo "Signed $signed source(s)."
