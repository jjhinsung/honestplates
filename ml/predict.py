"""Usage: python predict.py path/to/photo.jpg [--weights PATH]"""
import argparse, json
import torch
from PIL import Image
from model import load, analyze, best_device, DEFAULT_WEIGHTS

ap = argparse.ArgumentParser()
ap.add_argument("image")
ap.add_argument("--weights", default=DEFAULT_WEIGHTS)
a = ap.parse_args()

dev = best_device()
net, ck = load(a.weights, dev)
print(json.dumps(analyze(net, ck, Image.open(a.image), dev), indent=2))
