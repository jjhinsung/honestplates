#!/bin/bash
# Double-click in Finder to start the HonestPlates food-model server on this Mac
# (no API key needed). The first run installs Python packages (~1 GB, a few minutes).
# Keep this window open while you demo; close it to stop the server.

cd "$(dirname "$0")/ml" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fail() {
  echo ""
  echo "❌ $1"
  read -r -p "Press Return to close this window."
  exit 1
}

[ -f weights/food_model_fp16.pt ] || [ -f runs/best.pt ] || \
  fail "Model weights not found (ml/weights/food_model_fp16.pt). Pull the latest code from GitHub."

# Find a Python 3.10+ (PyTorch doesn't support the older python3 that ships with macOS).
PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,13) else 1)' 2>/dev/null; then
    PY="$c"; break
  fi
done
if [ -z "$PY" ]; then
  if command -v brew >/dev/null 2>&1; then
    echo "→ Installing Python 3.12 with Homebrew…"
    brew install python@3.12 || fail "Homebrew couldn't install Python (see messages above)."
    PY=python3.12
  else
    open "https://www.python.org/downloads/macos/"
    fail "Python 3.10–3.13 is needed. Install Python 3.12 from the page that just opened, then double-click this file again."
  fi
fi

if [ ! -x .venv/bin/python ]; then
  echo "→ Setting up Python environment with $($PY --version)…"
  "$PY" -m venv .venv || fail "Couldn't create the Python environment."
fi
if ! .venv/bin/python -c 'import torch, timm, fastapi, uvicorn, PIL' 2>/dev/null \
   || ! .venv/bin/python -m pip show -q python-multipart >/dev/null 2>&1; then
  echo "→ Installing packages (first run only, a few minutes)…"
  .venv/bin/python -m pip install --upgrade pip >/dev/null
  .venv/bin/python -m pip install torch torchvision timm fastapi uvicorn python-multipart pillow \
    || fail "Package install failed (see messages above)."
fi

echo ""
echo "================================================================"
echo "  In the HonestPlates app, go to Settings → AI plate recognition"
echo "  and enter one of these, then tap Test connection:"
echo ""
for ifc in $(ifconfig -l); do
  ip=$(ipconfig getifaddr "$ifc" 2>/dev/null) || continue
  [ -z "$ip" ] && continue
  case "$ip" in
    172.20.10.*) note="(iPhone USB / Personal Hotspot)";;
    *)           note="(Wi-Fi / network $ifc)";;
  esac
  echo "     http://$ip:8787   $note"
done
echo ""
echo "  'localhost' only works in the iOS Simulator, not on a real iPhone."
echo "================================================================"
echo ""
.venv/bin/python serve.py --port 8787
read -r -p "Server stopped. Press Return to close."
