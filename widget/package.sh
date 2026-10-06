#!/bin/bash
# Makes a shareable Clawd Widget: the app with the room's server inside it,
# for Apple Silicon and Intel Macs, zipped with a short read-me into dist/.
# Your friends only need Node.js; the app finds Claude Code and Codex sessions itself.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
STAGE="$ROOT/build/share/Clawd Widget"
APP="$STAGE/Clawd Widget.app"
ZIP="$ROOT/dist/Clawd-Widget-macOS.zip"

rm -rf "$ROOT/build/share"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app" "$ROOT/dist"

# One binary for both kinds of Mac.
for arch in arm64 x86_64; do
  swiftc -O -swift-version 5 -target "$arch-apple-macos13" -o "$ROOT/build/share/ClawdWidget-$arch" \
    widget/ClawdWidget.swift -framework AppKit -framework WebKit
done
lipo -create -output "$APP/Contents/MacOS/ClawdWidget" "$ROOT/build/share/ClawdWidget-arm64" "$ROOT/build/share/ClawdWidget-x86_64"
rm "$ROOT/build/share/ClawdWidget-"*

cp widget/Info.plist "$APP/Contents/Info.plist"
RES="$APP/Contents/Resources/app"
cp -R bin server web package.json "$RES/"
node widget/collect-three.mjs "$RES/node_modules/three"
printf '{ "port": %s }\n' "${CLAWD_PORT:-4747}" > "$APP/Contents/Resources/config.json"
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

cat > "$STAGE/Read me first.txt" <<'TXT'
Clawd Widget: a tiny room in the corner of your screen where your coding agent's
mascot acts out what it's doing (Clawd for Claude Code, its own little terminal
buddy for Codex).

1. Drag "Clawd Widget.app" into your Applications folder.
2. Open it the first time with right-click > Open > Open.
   (It isn't signed with an Apple Developer ID. If macOS still refuses, go to
   System Settings > Privacy & Security, scroll down, and click "Open Anyway".)
3. It needs Node.js (https://nodejs.org, or: brew install node).

It finds Claude Code sessions (~/.claude) and Codex sessions (~/.codex) on its
own. It only reads them, and only on your Mac: nothing is sent anywhere.
Use the little Clawd in the menu bar to resize, hide, or quit it.
TXT

rm -f "$ZIP"
ditto -c -k --keepParent "$STAGE" "$ZIP"
echo "Shareable: $ZIP ($(du -h "$ZIP" | cut -f1))"
