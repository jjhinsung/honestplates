"""Download MM-Food-100K metadata + images (resized, resumable).
Usage: python -I download.py [--limit N] [--start N] [--images_dir DIR] [--meta_out CSV] [--workers 32]
"""
import argparse, io, json, os
from concurrent.futures import ThreadPoolExecutor, as_completed
import truststore
truststore.inject_into_ssl()
import requests
from datasets import load_dataset
from PIL import Image
from tqdm import tqdm

ap = argparse.ArgumentParser()
ap.add_argument("--limit", type=int, default=0)
ap.add_argument("--workers", type=int, default=32)
ap.add_argument("--size", type=int, default=288, help="max side in px")
ap.add_argument("--min_food_prob", type=float, default=0.8)
ap.add_argument("--start", type=int, default=0, help="skip rows before this index")
ap.add_argument("--images_dir", default="data/images")
ap.add_argument("--meta_out", default="data/meta.csv")
a = ap.parse_args()

os.makedirs(a.images_dir, exist_ok=True)
ds = load_dataset("Codatta/MM-Food-100K", split="train")
df = ds.to_pandas()
df = df[df.food_prob >= a.min_food_prob].reset_index(drop=True)
# File names use the global row index, so images from different runs never collide.
df["file"] = [f"{i:06d}.jpg" for i in df.index]
if a.limit:
    df = df.head(a.limit)
df = df.iloc[a.start:]
print(f"{len(df)} rows to fetch (rows {a.start}..{a.start + len(df) - 1})")


def fetch(i, url, fn):
    path = f"{a.images_dir}/{fn}"
    if os.path.exists(path):
        return i, True
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        im = Image.open(io.BytesIO(r.content)).convert("RGB")
        im.thumbnail((a.size, a.size))
        im.save(path, quality=90)
        return i, True
    except Exception:
        return i, False


ok = {}
with ThreadPoolExecutor(a.workers) as ex:
    futs = [ex.submit(fetch, i, r.image_url, r.file) for i, r in df.iterrows()]
    for f in tqdm(as_completed(futs), total=len(futs)):
        i, good = f.result()
        ok[i] = good
df = df[df.index.map(ok)].reset_index(drop=True)


def nut(s):
    try:
        d = json.loads(s)
    except Exception:
        return [None] * 4
    return [d.get(k) for k in ("calories_kcal", "protein_g", "carbohydrate_g", "fat_g")]


df[["kcal", "protein", "carbs", "fat"]] = df.nutritional_profile.map(nut).tolist()
df = df.dropna(subset=["kcal", "protein", "carbs", "fat"])
df = df[(df.kcal > 0) & (df.kcal < 3000)]
df[["file", "dish_name", "food_type", "kcal", "protein", "carbs", "fat"]].to_csv(a.meta_out, index=False)
print(f"saved {len(df)} usable rows -> {a.meta_out}")
