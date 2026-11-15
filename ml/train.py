"""Multi-task fine-tune with calibrated confidences.

Heads: dish name (top-K classes), food type, and kcal/protein/carbs/fat each with a predicted
uncertainty. After training, confidences are calibrated on a validation split and the final
model is evaluated on a separate test split (runs/report.json).

Usage: python train.py [--epochs 12] [--batch 48] [--top_k 300] [--limit N]
"""
import argparse, copy, json, os, time
import numpy as np, pandas as pd, torch, torch.nn.functional as F
from PIL import Image
from torch.utils.data import DataLoader, Dataset
import torchvision.transforms as T
from tqdm import tqdm
from model import Net, TARGETS, IMAGENET_MEAN, IMAGENET_STD, Z80, eval_transform, nutrient_stats, tolerance

ap = argparse.ArgumentParser()
ap.add_argument("--epochs", type=int, default=12)
ap.add_argument("--batch", type=int, default=48)
ap.add_argument("--top_k", type=int, default=300)
ap.add_argument("--lr", type=float, default=3e-4)
ap.add_argument("--img", type=int, default=224)
ap.add_argument("--backbone", default="convnext_tiny.fb_in22k_ft_in1k")
ap.add_argument("--workers", type=int, default=6)
ap.add_argument("--limit", type=int, default=0, help="use only the first N rows (smoke tests)")
ap.add_argument("--out", default="runs")
ap.add_argument("--data", default="data/meta.csv=data/images,data/meta_rest.csv=data/images_rest",
                help="comma-separated CSV=IMAGE_DIR pairs; missing CSVs are skipped")
a = ap.parse_args()

parts = []
for pair in a.data.split(","):
    csv, img_dir = pair.split("=")
    if os.path.exists(csv):
        part = pd.read_csv(csv)
        part["path"] = img_dir + "/" + part.file
        parts.append(part)
df = pd.concat(parts, ignore_index=True)
if a.limit:
    df = df.head(a.limit)
df["dish"] = df.dish_name.astype(str).str.lower().str.strip()
df["food_type"] = df.food_type.fillna("Others")

# Splits: 90% train / 5% val (checkpoint selection + calibration) / 5% test (final report)
perm = np.random.RandomState(0).permutation(len(df))
n_hold = max(int(0.05 * len(df)), 1)
val_idx, test_idx, tr_idx = perm[:n_hold], perm[n_hold:2 * n_hold], perm[2 * n_hold:]

dish_classes = df.iloc[tr_idx].dish.value_counts().head(a.top_k).index.tolist()
type_classes = sorted(df.food_type.unique().tolist())
d2i = {c: i for i, c in enumerate(dish_classes)}
t2i = {c: i for i, c in enumerate(type_classes)}
df["cls"] = df.dish.map(d2i).fillna(-100).astype(int)  # -100 = dish outside top-K, ignored by dish loss
df["tcls"] = df.food_type.map(t2i).astype(int)

Ylog = np.log1p(df[TARGETS].values.astype(np.float32))
mu, sd = Ylog[tr_idx].mean(0), Ylog[tr_idx].std(0)
Yn = (Ylog - mu) / sd

tf_tr = T.Compose([T.RandomResizedCrop(a.img, scale=(0.6, 1)), T.RandomHorizontalFlip(),
                   T.ColorJitter(0.2, 0.2, 0.2), T.ToTensor(), T.Normalize(IMAGENET_MEAN, IMAGENET_STD)])
tf_ev = eval_transform(a.img)
FILES, CLS, TCLS = df.path.values, df.cls.values, df.tcls.values


class DS(Dataset):
    def __init__(self, idx, tf):
        self.idx, self.tf = idx, tf

    def __len__(self):
        return len(self.idx)

    def __getitem__(self, k):
        i = self.idx[k]
        x = self.tf(Image.open(FILES[i]).convert("RGB"))
        return x, int(CLS[i]), int(TCLS[i]), torch.from_numpy(Yn[i])


def losses(out, c, tc, y, smoothing=0.0):
    dl, tl, m, lv = out
    reg = F.smooth_l1_loss(m, y)
    # Uncertainty head learns from the (detached) error of the mean head: Gaussian NLL.
    nll = (0.5 * (lv + (y - m.detach()) ** 2 / lv.exp())).mean()
    mask = c >= 0
    dish = F.cross_entropy(dl[mask], c[mask], label_smoothing=smoothing) if mask.any() else dl.sum() * 0
    typ = F.cross_entropy(tl, tc, label_smoothing=smoothing)
    return reg + 0.2 * nll + 0.5 * dish + 0.3 * typ


@torch.no_grad()
def collect(net, loader, dev):
    net.eval()
    outs = [[], [], [], []]
    c_all, t_all, y_all = [], [], []
    for x, c, tc, y in loader:
        with torch.autocast("cuda", torch.float16):
            o = net(x.to(dev, non_blocking=True).contiguous(memory_format=torch.channels_last))
        for k in range(4):
            outs[k].append(o[k].float().cpu())
        c_all.append(c); t_all.append(tc); y_all.append(y)
    return [torch.cat(o) for o in outs], torch.cat(c_all), torch.cat(t_all), torch.cat(y_all)


def fit_temperature(logits, labels):
    if len(labels) == 0:
        return 1.0
    grid = np.linspace(0.5, 3.0, 51)
    nll = [F.cross_entropy(logits / t, labels).item() for t in grid]
    return float(grid[int(np.argmin(nll))])


def main():
    torch.backends.cudnn.benchmark = True
    dev = "cuda"
    os.makedirs(a.out, exist_ok=True)
    kw = dict(num_workers=a.workers, pin_memory=True, persistent_workers=a.workers > 0)
    dl_tr = DataLoader(DS(tr_idx, tf_tr), a.batch, shuffle=True, drop_last=True, **kw)
    dl_va = DataLoader(DS(val_idx, tf_ev), a.batch * 2, **kw)
    dl_te = DataLoader(DS(test_idx, tf_ev), a.batch * 2, **kw)
    print(f"train {len(tr_idx)} | val {len(val_idx)} | test {len(test_idx)} | "
          f"{len(dish_classes)} dishes (cover {np.mean(CLS[tr_idx] >= 0):.0%} of train) | {len(type_classes)} food types")

    net = Net(a.backbone, len(dish_classes), len(type_classes), pretrained=True).to(dev).to(memory_format=torch.channels_last)
    heads = [p for n, p in net.named_parameters() if not n.startswith("b.")]
    opt = torch.optim.AdamW([{"params": net.b.parameters(), "lr": a.lr},
                             {"params": heads, "lr": a.lr * 5}], weight_decay=0.05)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, [a.lr, a.lr * 5], total_steps=a.epochs * len(dl_tr), pct_start=0.1)
    scaler = torch.amp.GradScaler()

    best_loss, best_state, best_ep = float("inf"), None, 0
    base_mae = np.abs(np.median(df.iloc[tr_idx][TARGETS].values, axis=0) - df.iloc[val_idx][TARGETS].values).mean(0)
    for ep in range(a.epochs):
        net.train()
        t0, tot = time.time(), 0.0
        for x, c, tc, y in tqdm(dl_tr, desc=f"epoch {ep + 1}/{a.epochs}", mininterval=10):
            x = x.to(dev, non_blocking=True).contiguous(memory_format=torch.channels_last)
            c, tc, y = c.to(dev), tc.to(dev), y.to(dev)
            with torch.autocast("cuda", torch.float16):
                out = net(x)
            loss = losses([o.float() for o in out], c, tc, y, smoothing=0.1)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(net.parameters(), 2.0)
            scaler.step(opt)
            scaler.update()
            sched.step()
            tot += loss.item()
        o, c, tc, y = collect(net, dl_va, dev)
        vloss = losses(o, c, tc, y).item()
        mask = c >= 0
        dish_acc = (o[0][mask].argmax(1) == c[mask]).float().mean().item() if mask.any() else 0.0
        type_acc = (o[1].argmax(1) == tc).float().mean().item()
        pred = np.expm1(o[2].numpy() * sd + mu)
        true = np.expm1(y.numpy() * sd + mu)
        mae = np.abs(pred - true).mean(0)
        # Select on accuracy, not val loss: loss rises from overconfidence, which calibration fixes later.
        score = float((mae / base_mae).mean())  # avg nutrient MAE relative to predict-the-median
        print(f"epoch {ep + 1}: train {tot / len(dl_tr):.3f} | val {vloss:.3f} | dish top1 {dish_acc:.3f} | "
              f"type {type_acc:.3f} | kcal MAE {mae[0]:.0f} | rel MAE {score:.3f} | {time.time() - t0:.0f}s", flush=True)
        if score < best_loss:
            best_loss, best_state, best_ep = score, copy.deepcopy(net.state_dict()), ep + 1
    print(f"best epoch: {best_ep}")

    # ---- calibrate on val ----
    net.load_state_dict(best_state)
    o, c, tc, y = collect(net, dl_va, dev)
    mask = c >= 0
    dish_temp = fit_temperature(o[0][mask], c[mask])
    type_temp = fit_temperature(o[1], tc)
    # Rescale predicted sigma so standardized residuals have unit variance on val.
    sigma_scale = torch.sqrt((((y - o[2]) ** 2) / o[3].exp()).mean(0)).tolist()

    ck = {
        "state": {k: v.cpu() for k, v in best_state.items()},
        "backbone": a.backbone, "img": a.img,
        "dish_classes": dish_classes, "type_classes": type_classes,
        "mu": mu.tolist(), "sd": sd.tolist(), "sigma_scale": sigma_scale,
        "dish_temp": dish_temp, "type_temp": type_temp,
    }
    torch.save(ck, f"{a.out}/best.pt")
    # Half-precision copy for GitHub (100 MB file limit); predictions are effectively identical.
    ck16 = dict(ck, state={k: (v.half() if v.is_floating_point() else v) for k, v in ck["state"].items()})
    torch.save(ck16, f"{a.out}/food_model_fp16.pt")
    mb = os.path.getsize(f"{a.out}/food_model_fp16.pt") / 1e6
    print(f"saved {a.out}/food_model_fp16.pt ({mb:.1f} MB){'  WARNING: over GitHub 100 MB limit' if mb >= 100 else ''}")

    # ---- final report on test ----
    o, c, tc, y = collect(net, dl_te, dev)
    mask = c >= 0
    dish_p = (o[0] / dish_temp).softmax(1)
    type_p = (o[1] / type_temp).softmax(1)
    value, lo, hi, conf = nutrient_stats(o[2], o[3], ck)
    truth = torch.expm1(y * torch.tensor(ck["sd"]) + torch.tensor(ck["mu"]))
    within = (value - truth).abs() <= tolerance(value)
    train_median = np.median(df.iloc[tr_idx][TARGETS].values, axis=0)

    report = {
        "test_images": len(test_idx),
        "dish": {
            "in_top_k_fraction": round(mask.float().mean().item(), 3),
            "top1_acc_when_in_top_k": round((dish_p[mask].argmax(1) == c[mask]).float().mean().item(), 3),
            "top5_acc_when_in_top_k": round((dish_p[mask].topk(5).indices == c[mask, None]).any(1).float().mean().item(), 3),
            "mean_confidence_when_in_top_k": round(dish_p[mask].max(1).values.mean().item(), 3),
            "temperature": dish_temp,
        },
        "food_type": {
            "accuracy": round((type_p.argmax(1) == tc).float().mean().item(), 3),
            "mean_confidence": round(type_p.max(1).values.mean().item(), 3),
            "temperature": type_temp,
        },
        "nutrients": {},
    }
    for j, t in enumerate(TARGETS):
        report["nutrients"][t] = {
            "MAE": round((value[:, j] - truth[:, j]).abs().mean().item(), 1),
            "MAE_baseline_predict_median": round(float(np.abs(train_median[j] - truth[:, j].numpy()).mean()), 1),
            "range_80_coverage": round(((truth[:, j] >= lo[:, j]) & (truth[:, j] <= hi[:, j])).float().mean().item(), 3),
            "mean_confidence": round(conf[:, j].mean().item(), 3),
            "actual_within_tolerance": round(within[:, j].float().mean().item(), 3),
            "sigma_scale": round(sigma_scale[j], 3),
        }
    json.dump(report, open(f"{a.out}/report.json", "w"), indent=2)
    print(json.dumps(report, indent=2))
    print(f"saved {a.out}/best.pt")


if __name__ == "__main__":
    main()
