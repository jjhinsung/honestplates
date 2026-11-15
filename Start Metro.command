#!/bin/bash
# Double-click in Finder to start Metro, the code server that sends live changes
# to the HonestPlates development build (the "NutriLens" scheme in Xcode).
# Keep this window open while you work; close it to stop Metro.

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed. Run 'Setup HonestPlates' first."
  read -r -p "Press Return to close."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Packages aren't installed yet. Run 'Setup HonestPlates' first."
  read -r -p "Press Return to close."
  exit 1
fi

if lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Metro (or something else) is already running on port 8081."
  echo "If the app can't connect, close the other Metro window and run this again."
  read -r -p "Press Return to close."
  exit 0
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo "================================================================"
echo "  Metro is starting. Keep this window open."
echo "  Your iPhone must be on the same Wi-Fi as this Mac (${IP:-unknown IP})."
echo "  Then open HonestPlates on the phone, or shake it → Reload."
echo "================================================================"
echo ""
npx react-native start
read -r -p "Metro stopped. Press Return to close."
