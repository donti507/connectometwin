# ConnectomeTwin

Interactive companion to *Reconstruction differences rival individual differences in the fly compass connectome and break trained circuit models* (Yad & Nabila 2026, [arXiv:2610.29205](https://arxiv.org/abs/2610.29205)).

Compare two reconstructions of the same fly circuit, see which connections changed, and watch a trained network hold, or lose, a heading on each wiring.

Status: Phases 0–4 complete. See `docs/ROADMAP.md`.

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
Select wiring A/B, own or transplant mode, and clean or noise-trained parameters. Runs animate at
browser refresh rate, with one model timestep every 100 ms and smooth EPG glow
between steps. Playback stops after step 39; use Replay or Restart for a new run.
The error plot shows absolute wrapped error in degrees, with a mean over steps
5–39 only. Display smoothing affects glow only, never model state or error.

Connections are cached on an offscreen canvas and show the strongest 1,200 by
absolute weight by default. “All connections” shows every edge. Same-fly diffs
are oriented from wiring A to wiring B: added green, removed red,
changed gold with width proportional to the magnitude of the log change ratio.
Diffs use their own 1,200-edge strongest-weight limit unless all connections are
enabled; counts below the map describe both layers. Diff overlays are disabled across different flies; transplantation remains available. Missing angles use evenly spaced diamond markers on the
appropriate family ring; EPGt shares the EPG ring. Hover a neuron for details.

Open `self-check.html` to run all 46 engine reference cases directly in a browser.
For local checks:

```sh
node connectometwin/tests/engine.test.mjs
node connectometwin/tests/view.test.mjs
node connectometwin/tests/run.test.mjs
# Optional: requires Playwright, Chromium, and the static server above.
node connectometwin/tests/browser.cjs
```

The browser check covers all wirings, diff direction, connection limits,
playback, the numerical run result, Canvas refresh, mobile sizing and the
browser reference gate. Set `CHROMIUM_PATH` or `CONNECTOMETWIN_URL` to override
the test browser executable or server address. The guided story remains future work.

## Experiment controls (Phase 4)

Both A and B offer all seven versions. **Own wiring** trains/tests on A; B only
selects the same-fly diff comparison. **Train on A, test on B** maps A's trained
parameters onto B through `maps.json` and uses B's connections, neuron families,
readout positions and displayed activity. Selecting A=B uses an identity map.

The **weight scale** slider multiplies connection weights by 0.98–1.02 in 0.1%
increments for clean networks. It resets to zero and disables for noise-trained
networks. The unscaled own-wiring reference is shown alongside the slider to
make the knife-edge visible (FlyWire clean: approximately 0.58° at baseline,
21.67° at +1%, averaged over 16 headings).

**Refit gains** is available only for the five directed noise-trained pairs in
`refits.json`: offsets are added to transplanted presynaptic log gains by target
cell type. It clears when changing to an unsupported pair, own wiring or a clean
network. The full refits were trained on the noise networks, so they are never
silently applied to clean parameters.

**Darkness after step 5** is enabled by default: the cue is present at steps 0–4,
then removed for steps 5–39. Unchecking it leaves the cue on for all 40 steps.
Changing experiment settings or the cue angle restarts the run; Play/Pause stops
or resumes the same model state, and Restart clears it.

The instantaneous error and running mean over steps 5–39 describe the displayed
single-heading trial. A separate benchmark computes the current configuration's
mean over the exact 16 headings in `reference.json`. Its paper-model reference
comes from the corresponding own, scaled, or transplant entry, or the clearly
labelled refit export when applicable. Values missing for intermediate scales,
unexported pairs or continuous cues say **Not available**; no paper number is
invented. Refit exports are generated results, not additional published claims.

`tests/run.test.mjs` exercises UI configuration resolution against every supplied
reference case and refit, all 49 directed A/B choices, disabled-control state,
and darkness semantics. The browser check also exercises transplant/refit mode,
clean scaling, unsupported-pair resets and the live numerical error displays.
