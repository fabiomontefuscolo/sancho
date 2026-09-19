#!/usr/bin/env bash
# Registers the Sancho ACP native messaging host with Chrome/Chromium on Linux.
# Usage: ./native-host/install.sh <extension-id>
set -euo pipefail

EXTENSION_ID="${1:?usage: install.sh <extension-id> (from chrome://extensions)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/com.sancho.acp_host.mjs"
HOST_NAME="com.sancho.acp_host"

chmod +x "$HOST_SCRIPT"

for DIR in \
  "$HOME/.config/google-chrome/NativeMessagingHosts" \
  "$HOME/.config/chromium/NativeMessagingHosts" \
  "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"; do
  if [ -d "$(dirname "$DIR")" ]; then
    mkdir -p "$DIR"
    sed -e "s|__HOST_SCRIPT_ABSOLUTE_PATH__|$HOST_SCRIPT|" \
        -e "s|__EXTENSION_ID__|$EXTENSION_ID|" \
        "$SCRIPT_DIR/com.sancho.acp_host.json" > "$DIR/$HOST_NAME.json"
    echo "registered: $DIR/$HOST_NAME.json"
  fi
done

echo "Done. In Sancho settings choose 'Local agent (ACP)' with host name: $HOST_NAME"
