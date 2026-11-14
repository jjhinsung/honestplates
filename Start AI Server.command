#!/bin/bash
# Double-click in Finder to start the AI plate-recognition server on this Mac.
# Keep this window open while you demo; close it to stop the server.

cd "$(dirname "$0")/server" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed. Run 'Setup NutriLens' first."
  read -r -p "Press Return to close."
  exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Paste your Anthropic API key and press Return (it won't be shown or saved):"
  read -r -s ANTHROPIC_API_KEY
  export ANTHROPIC_API_KEY
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo ""
echo "================================================================"
echo "  In the NutriLens app, go to Settings → AI plate recognition"
echo "  and enter:   http://${IP:-YOUR-MAC-IP}:8787"
echo "  (iPhone and Mac must be on the same Wi-Fi network)"
echo "================================================================"
echo ""
node index.mjs
read -r -p "Server stopped. Press Return to close."
