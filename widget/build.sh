#!/bin/bash
# Builds "Clawd Widget.app" (Clawd's Room in a floating corner window) into build/.
# Needs the Xcode command line tools (swiftc) and node on your PATH.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
APP="$ROOT/build/Clawd Widget.app"
NODE="$(command -v node || true)"
PORT="${CLAWD_PORT:-4747}"
if [ -z "$NODE" ]; then echo "node isn't on your PATH" >&2; exit 1; fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O -swift-version 5 -o "$APP/Contents/MacOS/ClawdWidget" widget/ClawdWidget.swift -framework AppKit -framework WebKit
cp widget/Info.plist "$APP/Contents/Info.plist"
# Where node and the project live, so the app can start the room's server itself.
printf '{ "node": "%s", "project": "%s", "port": %s }\n' "$NODE" "$ROOT" "$PORT" > "$APP/Contents/Resources/config.json"
codesign --force --sign - "$APP" >/dev/null 2>&1 || true
echo "Built $APP"
