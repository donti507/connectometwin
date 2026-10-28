"""
refit_export.py -- ConnectomeTwin, Phase 1 step 4: re-run the cell-type gain refit (paper Sec. 4.5)
for the demo pairs and export the refitted gains. Same procedure as the paper: transplanted network
(noise level 0.5, seed 0), one log-gain offset per TARGET cell type, Adam lr 0.02, batch 128,
600 updates, everything else frozen.

CPU is fine (about 5-10 minutes; GPU faster). From the repository root:
    OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 python connectometwin/scripts/refit_export.py
Output: connectometwin/web/data/refits.json.

Colab: upload this file plus demo_data.zip, then:
    !unzip -oq demo_data.zip
    !python refit_export.py --data-dir demo_data
Output: demo_data/refits.json  (send it back)
"""
import argparse
import json
from pathlib import Path

import numpy as np
import torch

PAIRS = [("fafb", "fafb_buhmann"), ("fafb_buhmann", "fafb"), ("fafb", "fafb_unfiltered"),
         ("mcns", "mcns_neuprint"), ("mcns", "hemibrain")]
CUE, MICRO, T, STEPS, BATCH, N_TRAIN = 5, 2, 40, 600, 128, 1000
dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
torch.manual_seed(0)
parser = argparse.ArgumentParser(description="Refit transplanted gains and export refits.json")
parser.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parents[1] / "web" / "data",
                    help="directory containing exported wiring JSON (default: web/data)")
D = parser.parse_args().data_dir
maps = json.load(open(f"{D}/maps.json"))


def load(v):
    d = json.load(open(f"{D}/{v}.json")); N = len(d["neurons"])
    W = np.zeros((N, N), np.float32); e = d["edges"]; W[e["pre"], e["post"]] = e["w"]
    fam = np.array([n["family"] for n in d["neurons"]]); types = [n["type"] for n in d["neurons"]]
    masks = [torch.tensor(np.char.startswith(fam.astype(str), p).astype(np.float32), device=dev) for p in ("ER", "PEN", "EPG")]
    return d, torch.tensor(W, device=dev), masks, types


def run(W, net, masks, theta, gain):
    mER, mPEN, mEPG = masks
    Wg = W * torch.exp(gain)[:, None]
    cue = torch.stack([torch.cos(theta), torch.sin(theta), torch.ones_like(theta)], -1)
    u_cue = (cue @ net["Wc"] + net["bc"]) * mER + net["bv"] * mPEN
    u_base = net["bc"] * mER + net["bv"] * mPEN
    h = torch.zeros(len(theta), W.shape[0], device=dev); out = []
    for t in range(T):
        u = u_cue if t < CUE else u_base
        for _ in range(MICRO):
            h = 0.5 * h + 0.5 * (torch.relu(h) @ Wg + u)
        out.append((torch.relu(h) * mEPG) @ net["R"] + net["r"])
    return torch.stack(out, 1)


def error(pred, theta):
    ang = torch.atan2(pred[..., 1], pred[..., 0])
    d = torch.remainder(ang - theta[:, None] + np.pi, 2 * np.pi) - np.pi
    return torch.rad2deg(d[:, CUE:].abs()).mean().item()


results = {}
test = torch.linspace(-np.pi, np.pi, 17, device=dev)[:-1]
for s, t in PAIRS:
    ds, _, _, _ = load(s); dt, Wt, mt, types = load(t)
    m = np.array(maps[f"{s}__{t}"]); src = ds["nets"]["noise"]
    T_ = lambda x: torch.tensor(np.asarray(x, np.float32), device=dev)
    net = {"Wc": T_(np.array(src["Wc"])[:, m]), "bc": T_(np.array(src["bc"])[m]), "bv": T_(np.array(src["bv"])[m]),
           "R": T_(np.array(src["R"])[m]), "r": T_(src["r"])}
    g0 = T_(np.array(src["g"])[m])
    uniq = sorted(set(types)); tid = torch.tensor([uniq.index(x) for x in types], device=dev)
    delta = torch.zeros(len(uniq), device=dev, requires_grad=True)
    opt = torch.optim.Adam([delta], lr=0.02)
    train = torch.tensor(np.random.default_rng(11000).uniform(-np.pi, np.pi, N_TRAIN), dtype=torch.float32, device=dev)
    with torch.no_grad():
        before = error(run(Wt, net, mt, test, g0), test)
    for step in range(STEPS):
        th = train[torch.randint(N_TRAIN, (BATCH,), device=dev)]
        pred = run(Wt, net, mt, th, g0 + delta[tid])
        loss = ((pred - torch.stack([torch.cos(th), torch.sin(th)], -1)[:, None, :]) ** 2).mean()
        opt.zero_grad(); loss.backward(); opt.step()
    with torch.no_grad():
        after = error(run(Wt, net, mt, test, g0 + delta[tid]), test)
    results[f"{s}__{t}"] = {"types": uniq, "offset_per_type": [float(f"{x:.5g}") for x in delta.detach().cpu().numpy()],
                           "error_zero_shot": round(before, 3), "error_after_refit": round(after, 3)}
    print(f"{s} -> {t}: zero-shot {before:.1f} deg, after refit {after:.1f} deg ({len(uniq)} cell-type gains)")
json.dump(results, open(f"{D}/refits.json", "w"), indent=1)
print("saved demo_data/refits.json")
