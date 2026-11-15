"""HonestPlates food-model server — a drop-in replacement for server/index.mjs.

Run (from ml/):
    .venv\\Scripts\\python.exe serve.py                       # listens on 0.0.0.0:8787
    .venv\\Scripts\\python.exe serve.py --token SECRET        # require "Authorization: Bearer SECRET"
Options: --weights PATH (default: runs/best.pt if present, else weights/food_model_fp16.pt)  --host 0.0.0.0  --port 8787  (or env APP_TOKEN / PORT)

Endpoints
  GET  /health
  POST /analyze-plate   the iOS app's contract: JSON {"imageBase64": "...", "mediaType": "image/jpeg", "hint": "..."}
                        -> {"items": [{name, portion, nutrients, confidence}], "notes": "...", "details": {...}}
  POST /analyze         any client: multipart field "image" or raw image bytes
                        -> full per-statistic output (dish, food_type, nutrients with value / range_80 / confidence)
"""
import argparse, base64, binascii, io, os, socket, threading
import torch, uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError
from model import load, analyze, best_device, TOL_REL, TOL_FLOOR, DEFAULT_WEIGHTS

ap = argparse.ArgumentParser()
ap.add_argument("--weights", default=DEFAULT_WEIGHTS)
ap.add_argument("--host", default="0.0.0.0")
ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8787)))
ap.add_argument("--token", default=os.environ.get("APP_TOKEN"))
a = ap.parse_args()

MAX_BYTES = 15 * 1024 * 1024
dev = best_device()
net, ck = load(a.weights, dev)
infer_lock = threading.Lock()
app = FastAPI(title="HonestPlates food model")

NOTES = {
    "nutrient_confidence": f"estimated probability the true value is within ±{int(TOL_REL * 100)}% "
                           f"(or ±{TOL_FLOOR['kcal']:.0f} kcal / ±{TOL_FLOOR['protein']:.0f} g for small values)",
    "range_80": "80% prediction interval",
    "dish_confidence": f"probability among the {len(ck['dish_classes'])} most common dishes in the training data",
}


def check_token(request: Request):
    if a.token and request.headers.get("authorization") != f"Bearer {a.token}":
        raise HTTPException(401, "Unauthorized")


def decode(data: bytes) -> Image.Image:
    if not data:
        raise HTTPException(400, "empty image")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image too large")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        return img
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(400, "could not decode image")


def run(img):
    with infer_lock:
        return analyze(net, ck, img, dev)


def to_plate_analysis(r):
    """Map the model output onto the app's PlateAnalysis type (src/types.ts)."""
    n = r["nutrients"]
    name = r["dish"]["name"].title()
    # One number for the app's "X% confident" badge: how sure we are of the dish AND the calories.
    confidence = round((r["dish"]["confidence"] + n["kcal"]["confidence"]) / 2, 3)
    rng = lambda k: f"{n[k]['range_80'][0]:.0f}–{n[k]['range_80'][1]:.0f}"
    alts = ", ".join(x["name"] for x in r["dish"]["alternatives"])
    notes = (f"{n['kcal']['value']:.0f} kcal (80% range {rng('kcal')}). "
             f"Protein {rng('protein')} g, carbs {rng('carbs')} g, fat {rng('fat')} g. "
             f"Could also be: {alts}. Estimated by HonestPlates' own model.")
    return {
        "items": [{
            "name": name,
            "portion": "1 plate (as photographed)",
            "nutrients": {
                "calories": round(n["kcal"]["value"]),
                "protein": n["protein"]["value"],
                "carbs": n["carbs"]["value"],
                "fat": n["fat"]["value"],
            },
            "confidence": confidence,
        }],
        "notes": notes[:300],
        "details": r,  # full per-statistic output; the app ignores unknown fields
    }


@app.get("/health")
def health():
    return {"ok": True, "model": f"honestplates-{ck['backbone']}", "device": dev, "dishes": len(ck["dish_classes"])}


@app.post("/analyze-plate", dependencies=[Depends(check_token)])
async def analyze_plate(request: Request):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")
    b64 = body.get("imageBase64") if isinstance(body, dict) else None
    if not isinstance(b64, str) or len(b64) < 100:
        raise HTTPException(400, "imageBase64 is required")
    if len(b64) > MAX_BYTES * 4 // 3 + 4:
        raise HTTPException(413, "Image too large")
    try:
        data = base64.b64decode(b64, validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "imageBase64 is not valid base64")
    r = await run_in_threadpool(run, decode(data))
    out = to_plate_analysis(r)
    print(f"analyze-plate: {out['items'][0]['name']} ({out['items'][0]['confidence']:.0%}) "
          f"{out['items'][0]['nutrients']['calories']} kcal", flush=True)
    return out


@app.post("/analyze", dependencies=[Depends(check_token)])
async def analyze_endpoint(request: Request):
    if request.headers.get("content-type", "").startswith("multipart/form-data"):
        form = await request.form()
        f = form.get("image")
        if f is None or not hasattr(f, "read"):
            raise HTTPException(400, 'multipart field "image" is required')
        data = await f.read()
    else:
        data = await request.body()
    r = await run_in_threadpool(run, decode(data))
    r["notes"] = NOTES
    return r


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no packet is sent; just picks the outbound interface
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    print(f"HonestPlates model server on {dev}. In the app: Settings -> AI plate recognition -> "
          f"http://{lan_ip()}:{a.port}" + ("  (token required)" if a.token else ""), flush=True)
    uvicorn.run(app, host=a.host, port=a.port, log_level="warning")
