# ConnectomeTwin

Interactive companion to *Reconstruction differences rival individual differences in the fly compass connectome and break trained circuit models* (Yad & Nabila 2026, [arXiv:2610.29205](https://arxiv.org/abs/2610.29205)).

Compare two reconstructions of the same fly circuit, see which connections changed, and watch a trained network hold, or lose, a heading on each wiring.

Status: Phases 0–3 complete. See `docs/ROADMAP.md`.

## Simulation engine (Phase 2)

`web/js/engine.mjs` is a browser-native ES module with no build step or runtime
packages. It stores sparse weights in presynaptic-row CSR and uses typed arrays.
`Simulation.step()` advances one model timestep (two microsteps); its activity
buffer is reused on subsequent steps. `reset(theta)` clears state for a new cue.
`transplant()` maps source parameters onto target neurons and can apply a refit's
target-cell-type gain offsets. `simulate()` evaluates the 40-step reference task.

Run the validation gate with Node.js (tested with Node 24):

```sh
node connectometwin/tests/engine.test.mjs
```

This checks all 14 own-wiring, 28 weight-scale, and 4 transplant references across
16 headings, with a ±0.05° mean-error tolerance, plus final decoded headings,
CSR direction, reset, parameter mapping, and all five exported refit results.
The Phase 3 viewer uses this engine unchanged.
Missing display angles are `null`; visualization must handle them explicitly.

## Gain refitting

With NumPy and CPU PyTorch installed, run from the repository root:

```sh
OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 \
  python connectometwin/scripts/refit_export.py
```

This runs all five pairs, 600 Adam updates per pair, and writes
`connectometwin/web/data/refits.json`. Use `--data-dir PATH` to select another
export directory. The script fixes the training seeds; floating-point results
can vary by PyTorch version and hardware. This is a full training run, not a
smoke test.

## Static Canvas explorer (Phase 3)

From the repository root, serve the page without a build step:

```sh
python3 -m http.server 8000 --directory connectometwin/web
```

Open the server's `index.html`. The page uses vanilla JavaScript, Canvas, system
fonts and local JSON only; no CDN or external network requests are required.
Select a wiring and its own clean or noise-trained parameters. Runs animate at
browser refresh rate, with one model timestep every 100 ms and smooth EPG glow
between steps. Playback stops after step 39; use Replay or Restart for a new run.
The error plot shows absolute wrapped error in degrees, with a mean over steps
5–39 only. Display smoothing affects glow only, never model state or error.

Connections are cached on an offscreen canvas and show the strongest 1,200 by
absolute weight by default. “All connections” shows every edge. Same-fly diffs
are oriented from the selected wiring to “Compare to”: added green, removed red,
changed gold with width proportional to the magnitude of the log change ratio.
Diffs use their own 1,200-edge strongest-weight limit unless all connections are
enabled; counts below the map describe both layers. No comparison is offered
across different flies. Missing angles use evenly spaced diamond markers on the
appropriate family ring; EPGt shares the EPG ring. Hover a neuron for details.

Open `self-check.html` to run all 46 engine reference cases directly in a browser.
For local checks:

```sh
node connectometwin/tests/engine.test.mjs
node connectometwin/tests/view.test.mjs
# Optional: requires Playwright, Chromium, and the static server above.
node connectometwin/tests/browser.cjs
```

The browser check covers all wirings, diff direction, connection limits,
playback, the numerical run result, Canvas refresh, mobile sizing and the
browser reference gate. Set `CHROMIUM_PATH` or `CONNECTOMETWIN_URL` to override
the test browser executable or server address. Transplant/refit controls and
the guided story are reserved for later phases.
