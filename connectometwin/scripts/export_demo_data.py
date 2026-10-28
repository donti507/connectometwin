"""
export_demo_data.py -- ConnectomeTwin, Phase 1: export everything the browser demo needs as JSON.

Inputs (from the paper's repository):
  networks/<version>/subnetwork_{adjacency.npz,neurons.csv,nt.csv}   (hd_networks_all.zip)
  networks/transplant_maps.npz
  stage4d_params.npz                                                  (Stage 4d trained networks)
Outputs (demo_data/):
  index.json            versions, display names, model constants
  <version>.json        neurons (type, family, display angle), signed scaled weights (sparse),
                        two trained networks per version (clean, noise 0.5; seed 0)
  maps.json             one-to-one neuron maps for every ordered pair of the 7 trained versions
  diffs.json            connection changes for same-fly pairs (added / removed / changed)
  reference.json        Python reference results to validate the JavaScript simulation
All floats are rounded (5 significant digits) BEFORE the reference results are computed, so the
browser, given these files, must reproduce reference.json exactly up to float32 rounding.
"""
import json
import os

import numpy as np
import pandas as pd
import scipy.sparse as sp

from positions import load
from wiring_maps import positions

OUT = "demo_data"
VERSIONS = ["mcns", "mcns_neuprint", "hemibrain", "fafb", "fafb_unfiltered", "fafb_buhmann", "banc"]
NAMES = {"mcns": "male CNS v1.0", "mcns_neuprint": "male CNS (neuPrint)", "hemibrain": "hemibrain v1.2.1",
         "fafb": "FlyWire (Princeton synapses)", "fafb_unfiltered": "FlyWire (unfiltered)",
         "fafb_buhmann": "FlyWire (Buhmann synapses)", "banc": "BANC v888"}
FLY = {"mcns": "male CNS", "mcns_neuprint": "male CNS", "hemibrain": "hemibrain", "fafb": "FlyWire",
       "fafb_unfiltered": "FlyWire", "fafb_buhmann": "FlyWire", "banc": "BANC"}
BASE = {"mcns_neuprint": "mcns", "fafb_unfiltered": "fafb", "fafb_buhmann": "fafb"}
SAME_FLY_PAIRS = [("fafb", "fafb_buhmann"), ("fafb", "fafb_unfiltered"), ("fafb_unfiltered", "fafb_buhmann"), ("mcns", "mcns_neuprint")]
CUE, MICRO, T_REF = 5, 2, 40
r5 = lambda x: float(f"{x:.5g}")


def rnd(a):
    return np.vectorize(r5)(np.asarray(a, float)) if np.size(a) else np.asarray(a, float)


def family(t):
    for p in ("EPGt", "EPG", "PEN_a", "PEN_b", "PEG", "Delta7"):
        if str(t).startswith(p):
            return p
    return "ER"


def scaled(v):
    n, C = load(v)
    s = pd.read_csv(f"networks/{v}/subnetwork_nt.csv").sort_values("index")["sign"].to_numpy(float)
    S = C * s[:, None]
    return n, C, S * (0.9 / np.abs(np.linalg.eigvals(S)).max())


def get_map(maps, src, tgt, n_tgt):
    s, t = BASE.get(src, src), BASE.get(tgt, tgt)
    return np.arange(n_tgt) if s == t else maps[f"{s}__{t}"]


def simulate(W, net, masks, theta):
    """Paper model; returns decoded heading (len(theta) x T_REF) and mean error after the cue (deg)."""
    mER, mPEN, mEPG = masks
    Wg = W * np.exp(net["g"])[:, None]
    cue = np.c_[np.cos(theta), np.sin(theta), np.ones(len(theta))]
    u_cue = (cue @ net["Wc"] + net["bc"]) * mER + net["bv"] * mPEN
    u_base = net["bc"] * mER + net["bv"] * mPEN
    h = np.zeros((len(theta), W.shape[0])); dec = []
    for t in range(T_REF):
        u = u_cue if t < CUE else u_base
        for _ in range(MICRO):
            h = 0.5 * h + 0.5 * (np.maximum(h, 0) @ Wg + u)
        y = (np.maximum(h, 0) * mEPG) @ net["R"] + net["r"]
        dec.append(np.arctan2(y[:, 1], y[:, 0]))
    dec = np.array(dec).T
    err = np.degrees(np.abs(np.angle(np.exp(1j * (dec[:, CUE:] - theta[:, None]))))).mean()
    return dec, err


def main():
    os.makedirs(OUT, exist_ok=True)
    z = np.load("stage4d_params.npz", allow_pickle=True)
    conds = [c.split("|") for c in z["conds"]]
    maps_npz = np.load("networks/transplant_maps.npz", allow_pickle=True)
    data, nets, masks, W = {}, {}, {}, {}

    # ---- neurons, weights, trained networks
    ref_angles = None
    for v in VERSIONS:
        n, C, S = scaled(v)
        S = rnd(S); W[v] = S
        fam = n["type"].map(family).to_numpy()
        g, ang = positions(n, C)
        masks[v] = tuple((np.char.startswith(fam.astype(str), p) * 1.0) for p in ("ER", "PEN", "EPG"))
        masks[v] = (masks[v][0], masks[v][1], masks[v][2])
        nets[v] = {}
        for label, lvl in (("clean", "0.0"), ("noise", "0.5")):
            k = next(i for i, c in enumerate(conds) if c[0] == v and c[2] == "0" and c[3] == lvl)
            N = len(n)
            nets[v][label] = {"g": rnd(z["g_neuron"][k][:N]), "Wc": rnd(z["Wc"][k][:, :N]), "bc": rnd(z["bc"][k][:N]),
                              "bv": rnd(z["bv"][k][:N]), "R": rnd(z["R"][k][:N]), "r": rnd(z["r"][k])}
        data[v] = {"n": n, "fam": fam, "ang": ang}

    # ---- display angles: same-fly variants share their base fly's angles; other flies are rotated
    #      (and mirrored if needed) to line up with the male CNS through the neuron maps
    for v in VERSIONS:
        if v in BASE:
            continue
        if v == "mcns":
            data[v]["disp"] = data[v]["ang"]; continue
        m = maps_npz[f"mcns__{v}"]; a_t = data[v]["ang"]; a_s = data["mcns"]["ang"][m]
        tuned = data[v]["fam"] != "ER"
        best = None
        for sgn in (1, -1):
            off = np.angle(np.mean(np.exp(1j * (a_s[tuned] - sgn * a_t[tuned]))))
            score = np.abs(np.mean(np.exp(1j * (a_s[tuned] - sgn * a_t[tuned]))))
            if best is None or score > best[0]:
                best = (score, sgn, off)
        data[v]["disp"] = np.angle(np.exp(1j * (best[1] * a_t + best[2])))
    for v in BASE:
        data[v]["disp"] = data[BASE[v]]["disp"]

    for v in VERSIONS:
        S = W[v]; pre, post = np.nonzero(S)
        out = {"version": v, "name": NAMES[v], "fly": FLY[v],
               "neurons": [{"id": str(b), "type": str(t), "family": f, "angle": r5(a) if np.isfinite(a) else None}
                           for b, t, f, a in zip(data[v]["n"]["bodyId"], data[v]["n"]["type"], data[v]["fam"], data[v]["disp"])],
               "edges": {"pre": pre.tolist(), "post": post.tolist(), "w": [r5(x) for x in S[pre, post]]},
               "nets": {lab: {k: (vv.tolist()) for k, vv in net.items()} for lab, net in nets[v].items()}}
        json.dump(out, open(f"{OUT}/{v}.json", "w"), separators=(",", ":"))

    # ---- maps between all ordered pairs of trained versions
    maps_out = {f"{s}__{t}": get_map(maps_npz, s, t, len(data[t]["n"])).tolist() for s in VERSIONS for t in VERSIONS if s != t}
    json.dump(maps_out, open(f"{OUT}/maps.json", "w"), separators=(",", ":"))

    # ---- connection diffs for same-fly pairs (same neurons, same order)
    diffs = {}
    for a, b in SAME_FLY_PAIRS:
        A = (sp.load_npz(f"networks/{a}/subnetwork_adjacency.npz").toarray()); B = (sp.load_npz(f"networks/{b}/subnetwork_adjacency.npz").toarray())
        added = np.argwhere((A == 0) & (B > 0)); removed = np.argwhere((A > 0) & (B == 0))
        both = np.argwhere((A > 0) & (B > 0)); ratio = B[both[:, 0], both[:, 1]] / A[both[:, 0], both[:, 1]]
        big = np.abs(np.log(ratio)) > np.log(1.5)
        diffs[f"{a}__{b}"] = {"added": added.tolist(), "removed": removed.tolist(),
                              "changed": both[big].tolist(), "changed_ratio": [r5(x) for x in ratio[big]],
                              "n_shared": int(len(both))}
    json.dump(diffs, open(f"{OUT}/diffs.json", "w"), separators=(",", ":"))

    # ---- reference results (computed from the ROUNDED exported values)
    theta = np.linspace(-np.pi, np.pi, 16, endpoint=False)
    ref = {"theta": theta.tolist(), "own": {}, "transplant": {}, "scale": {}}
    for v in VERSIONS:
        for lab in ("clean", "noise"):
            dec, err = simulate(W[v], nets[v][lab], masks[v], theta)
            ref["own"][f"{v}|{lab}"] = {"error": r5(err), "decoded_t39": [r5(x) for x in dec[:, -1]]}
        for sc in (0.98, 0.99, 1.01, 1.02):
            ref["scale"][f"{v}|clean|{sc}"] = r5(simulate(W[v] * sc, nets[v]["clean"], masks[v], theta)[1])
    for s, t in [("fafb", "fafb_buhmann"), ("fafb_buhmann", "fafb"), ("mcns", "hemibrain"), ("fafb", "fafb_unfiltered")]:
        m = np.array(maps_out[f"{s}__{t}"]); src = nets[s]["noise"]
        moved = {"g": src["g"][m], "Wc": src["Wc"][:, m], "bc": src["bc"][m], "bv": src["bv"][m], "R": src["R"][m], "r": src["r"]}
        ref["transplant"][f"{s}__{t}|noise"] = r5(simulate(W[t], moved, masks[t], theta)[1])
    json.dump(ref, open(f"{OUT}/reference.json", "w"), indent=1)

    index = {"versions": VERSIONS, "names": NAMES, "fly": FLY, "base": BASE, "same_fly_pairs": SAME_FLY_PAIRS,
             "model": {"cue_steps": CUE, "micro_steps": MICRO, "alpha": 0.5, "spectral_radius": 0.9,
                       "update": "h <- 0.5 h + 0.5 (ReLU(h) W_g + u), W_g[i,j] = W[i,j] exp(g_i)",
                       "readout": "y = ReLU(h)*mask_EPG @ R + r; heading = atan2(y1, y0)",
                       "inputs": "t < cue_steps: u = (cue @ Wc + bc) on ER + bv on PEN; afterwards u = bc on ER + bv on PEN; cue = (cos, sin, 1)"},
             "source": "Yad & Nabila 2026, arXiv:2610.29205; Stage 4d networks, seed 0"}
    json.dump(index, open(f"{OUT}/index.json", "w"), indent=1)
    print("exported to", OUT)


if __name__ == "__main__":
    main()
