"""Shared model definition + inference helpers (used by train.py, predict.py, serve.py)."""
import os
import numpy as np
import timm
import torch
import torch.nn as nn
import torchvision.transforms as T

TARGETS = ["kcal", "protein", "carbs", "fat"]
UNITS = {"kcal": "kcal", "protein": "g", "carbs": "g", "fat": "g"}
# A nutrient prediction counts as "right" if it is within ±20% of the truth,
# or within this absolute floor for small values (so 2 g vs 3 g of fat isn't "wrong").
TOL_REL = 0.2
TOL_FLOOR = {"kcal": 50.0, "protein": 5.0, "carbs": 5.0, "fat": 5.0}
Z80 = 1.2816  # z-score for an 80% central interval
IMAGENET_MEAN, IMAGENET_STD = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]

_HERE = os.path.dirname(os.path.abspath(__file__))
# Prefer a locally trained checkpoint; fall back to the committed half-precision copy.
DEFAULT_WEIGHTS = next((p for p in (os.path.join(_HERE, "runs", "best.pt"),
                                    os.path.join(_HERE, "weights", "food_model_fp16.pt")) if os.path.exists(p)),
                       os.path.join(_HERE, "weights", "food_model_fp16.pt"))


class Net(nn.Module):
    """Backbone + dish head + food-type head + nutrient head (mean and log-variance per target)."""

    def __init__(self, backbone, n_dish, n_type, pretrained=False):
        super().__init__()
        self.b = timm.create_model(backbone, pretrained=pretrained, num_classes=0)
        d = self.b.num_features
        self.dish = nn.Linear(d, n_dish)
        self.ftype = nn.Linear(d, n_type)
        self.reg = nn.Sequential(nn.Linear(d, 512), nn.GELU(), nn.Dropout(0.1), nn.Linear(512, 2 * len(TARGETS)))

    def forward(self, x):
        f = self.b(x)
        r = self.reg(f)
        n = len(TARGETS)
        return self.dish(f), self.ftype(f), r[:, :n], r[:, n:].clamp(-7, 5)


def eval_transform(img):
    return T.Compose([T.Resize(img), T.CenterCrop(img), T.ToTensor(), T.Normalize(IMAGENET_MEAN, IMAGENET_STD)])


def nutrient_stats(m, logvar, ck):
    """Normalized-log-space mean/log-variance -> (value, lo80, hi80, confidence), each [N, 4].

    Targets are modeled as Gaussian in log1p space. `confidence` is the predicted probability
    that the true value lies within the tolerance window around the predicted value.
    """
    mu = torch.tensor(ck["mu"])
    sd = torch.tensor(ck["sd"])
    scale = torch.tensor(ck["sigma_scale"])
    M = m * sd + mu
    S = torch.exp(0.5 * logvar) * scale * sd
    value = torch.expm1(M).clamp(min=0)
    lo = torch.expm1(M - Z80 * S).clamp(min=0)
    hi = torch.expm1(M + Z80 * S)
    tol = tolerance(value)
    a = torch.log1p((value - tol).clamp(min=0))
    b = torch.log1p(value + tol)
    conf = torch.special.ndtr((b - M) / S) - torch.special.ndtr((a - M) / S)
    return value, lo, hi, conf


def tolerance(value):
    floor = torch.tensor([TOL_FLOOR[t] for t in TARGETS], dtype=value.dtype)
    return torch.maximum(TOL_REL * value, floor)


def best_device():
    if torch.cuda.is_available():
        return "cuda"  # NVIDIA GPU
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"  # Apple-silicon GPU
    return "cpu"


def load(path, device="cpu"):
    ck = torch.load(path, map_location="cpu", weights_only=True)
    net = Net(ck["backbone"], len(ck["dish_classes"]), len(ck["type_classes"]))
    net.load_state_dict(ck["state"])
    net.eval().to(device)
    return net, ck


@torch.no_grad()
def analyze(net, ck, pil_img, device="cpu", topk=3):
    """Run one PIL image through the model and return a JSON-serializable dict."""
    x = eval_transform(ck["img"])(pil_img.convert("RGB"))[None].to(device)
    dl, tl, m, lv = net(x)
    dish_p = (dl.float().cpu() / ck["dish_temp"]).softmax(1)[0]
    type_p = (tl.float().cpu() / ck["type_temp"]).softmax(1)[0]
    value, lo, hi, conf = (t[0] for t in nutrient_stats(m.float().cpu(), lv.float().cpu(), ck))

    top = dish_p.topk(topk)
    ti = int(type_p.argmax())
    out = {
        "dish": {
            "name": ck["dish_classes"][int(top.indices[0])],
            "confidence": round(float(top.values[0]), 3),
            "alternatives": [
                {"name": ck["dish_classes"][int(i)], "confidence": round(float(p), 3)}
                for p, i in zip(top.values[1:], top.indices[1:])
            ],
        },
        "food_type": {"name": ck["type_classes"][ti], "confidence": round(float(type_p[ti]), 3)},
        "nutrients": {},
    }
    for j, t in enumerate(TARGETS):
        out["nutrients"][t] = {
            "value": round(float(value[j]), 1),
            "unit": UNITS[t],
            "range_80": [round(float(lo[j]), 1), round(float(hi[j]), 1)],
            "confidence": round(float(conf[j]), 3),
        }
    return out
