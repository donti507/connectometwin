# ConnectomeTwin: roadmap and handoff (read this first)

## Goal
One static web page (`web/index.html`, vanilla JS + Canvas, no build step) hosted on GitHub Pages.

## Status
- Phase 0 (scope): DONE. Main demo = FlyWire Princeton vs Buhmann synapses (same fly). 7 wirings selectable.
- Phase 1 (data): DONE, including full 600-update gain refits for all five pairs in `web/data/refits.json`. Reproduce with `scripts/refit_export.py` (CPU PyTorch; defaults to `web/data/`).
- Phase 2 (JS engine): DONE. Typed-array CSR engine in `web/js/engine.mjs`; all 46 Python reference cases pass within ±0.05 deg. Run `node connectometwin/tests/engine.test.mjs` from the repository root.
- Phase 3 (visualization): DONE. Static Canvas explorer in `web/index.html`, with family rings, connection/diff layers, live EPG activity, heading dial and error trace. Browser reference gate in `web/self-check.html`.
- Phases 4-6: TODO. Basic viewing/playback controls are included; transplantation, weight scaling, refit controls and guided story remain future work.

## Data contract (`web/data/`)
- `index.json`: versions, display names, model equations, base fly for same-fly variants.
- `<version>.json`:
  - `neurons[i]`: `id, type, family (EPG|EPGt|PEN_a|PEN_b|PEG|Delta7|ER), angle` (radians, display position, aligned across flies; `null` when unavailable)
  - `edges`: sparse `pre[], post[], w[]` = signed, spectral-radius-scaled weights W[pre][post]
  - `nets.clean` and `nets.noise`: `g` (N), `Wc` (3 x N), `bc` (N), `bv` (N), `R` (N x 2), `r` (2)
- `maps.json`: `"src__tgt"` -> array (len = N_tgt) of source neuron index for each target neuron.
- `diffs.json`: same-fly pairs -> `added`, `removed`, `changed` as [pre, post] index pairs (+ `changed_ratio`).
- `refits.json` (after refit): per pair `types`, `offset_per_type`, errors before/after.
- `reference.json`: Python results the JS engine must reproduce.

## Model (must match exactly)
- Wg[i][j] = W[i][j] * exp(g[i])   (row i = presynaptic)
- per time step, 2 micro-steps: h = 0.5*h + 0.5*(relu(h) @ Wg + u)
- t < 5: u = (cue @ Wc + bc) on ER neurons + bv on PEN neurons; cue = (cos θ, sin θ, 1)
- t >= 5: u = bc on ER + bv on PEN
- readout: y = (relu(h) masked to EPG) @ R + r; heading = atan2(y[1], y[0])
- error = mean |wrapped(heading - θ)| over t = 5..39, in degrees; masks by family prefix (ER, PEN, EPG)
- transplant src->tgt: use tgt weights; params indexed by map m: g[m], Wc[:,m], bc[m], bv[m], R[m]; r unchanged
- refit: add offset_per_type[type of target neuron] to transplanted g

## Phase 2: JS engine (validation gate)
Implement the model with typed arrays (sparse CSR). Reproduce `reference.json` with 16 headings (`theta`):
own errors (e.g. fafb|clean 0.58, fafb|noise 8.32), transplant fafb->fafb_buhmann|noise 85.47,
scale fafb|clean|1.01 21.67. Tolerance ±0.05 deg. Do not start Phase 3 before this passes.

## Phase 3: visualization
Ring layout (concentric rings by family, position = angle); diff overlay (green added, red removed, width = change);
live EPG activity glow; heading dial (cue vs decoded); error-vs-time plot.

## Phase 4: interactions
Wiring A/B selector; "train on A, test on B" (transplant); weights -2..+2% slider (clean nets);
refit on/off; cue angle; play/pause/reset; darkness (no cue).

## Phase 5: guided story (5 steps)
same fly, different detector -> changed connections -> works on own wiring -> breaks on the other -> refit helps only partly.
Quote numbers from the paper; link arXiv and github.com/donti507/chessfly.

## Phase 6: deploy
Light/dark mode, mobile layout, GitHub Pages from `/web` (Settings -> Pages). Link from chessfly README and LinkedIn.
