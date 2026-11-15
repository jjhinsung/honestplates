#!/bin/bash
# Double-click in Finder to install everything the Xcode project needs.
# Safe to run again any time (e.g. after pulling changes from GitHub).

cd "$(dirname "$0")" || exit 1
fail() {
  echo ""
  echo "❌ $1"
  read -r -p "Press Return to close this window."
  exit 1
}

echo "=== HonestPlates setup ==="

# Find Node.js (Homebrew, the nodejs.org installer, or nvm)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
if ! command -v node >/dev/null 2>&1; then
  open "https://nodejs.org/en/download"
  fail "Node.js isn't installed. Download and run the macOS Installer (LTS) from the page that just opened, then double-click this file again."
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 22 ]; then
  open "https://nodejs.org/en/download"
  fail "Node.js $(node -v) is too old (need 22 or newer). Install the current LTS from nodejs.org, then run this again."
fi
echo "✓ Node.js $(node -v)"

echo ""
echo "→ Installing JavaScript packages (a few minutes the first time)…"
npm install --no-audit --no-fund || fail "npm install failed (see messages above)."

# Tell Xcode exactly where Node is; apps opened from the Dock don't see your shell PATH.
echo "export NODE_BINARY=\"$(command -v node)\"" > ios/.xcode.env.local
echo "✓ Xcode will use Node at $(command -v node)"

echo ""
echo "→ Installing iOS libraries (CocoaPods)…"
if ! command -v pod >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    # Homebrew's CocoaPods ships with its own modern Ruby (macOS's built-in Ruby 2.6 is too old).
    echo "→ CocoaPods not found — installing it with Homebrew…"
    brew install cocoapods || fail "Homebrew couldn't install CocoaPods (see messages above)."
  else
    RUBY_MAJOR=$(ruby -e 'print RUBY_VERSION.split(".")[0]' 2>/dev/null || echo 0)
    if [ "$RUBY_MAJOR" -lt 3 ]; then
      open "https://brew.sh"
      fail "CocoaPods needs Homebrew (or Ruby 3+). Install Homebrew from the page that just opened, then double-click this file again."
    fi
    BUNDLE_PATH=vendor/bundle bundle install || fail "Couldn't install CocoaPods (see messages above)."
    (cd ios && BUNDLE_PATH=../vendor/bundle bundle exec pod install) || fail "pod install failed (see messages above)."
  fi
fi
if command -v pod >/dev/null 2>&1; then
  (cd ios && pod install) || fail "pod install failed (see messages above)."
fi

echo ""
echo "✅ Setup complete. Opening the project in Xcode…"
open ios/NutriLens.xcworkspace
read -r -p "Press Return to close this window."
