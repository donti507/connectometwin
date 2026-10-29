# Final Stitch frontend: independent pages

The final design supplied by the owner includes desktop Explore, Guided Story,
Synaptic Matrix and Projected 2D views. The site now uses **normal HTML documents**,
not hash-routed sections or one crowded page.

| Address | Focus |
| --- | --- |
| `index.html` | Real 3D skeletons, experiment controls, heading and error plots |
| `story.html` | Five guided chapters, real presets and study/demo comparisons |
| `matrix.html` | Detector differences, edge counts and signed family-weight matrix |
| `neuron.html` | Selected neuron, actual graph/morphology statistics and export |
| `projection.html` | PB–FB–EB schematic, live angular activity, optional real XY/XZ/YZ planes |
| `circuit.html` | Recurrent family wiring and measured inter-neuron weight profile |

Links load a new document. Each HTML file contains only its own main content.
Common simulation controls are backed by minimal detached DOM adapters on pages
that do not display a particular readout. Other workspaces are not hidden inside
the document. No build step, backend or external runtime calls are required.

Experiment settings are validated against existing selector options and numeric
bounds, and passed in page-link query parameters. Direct links and reloads work
on static hosting. Each document starts a new deterministic trial with those
settings; it does not pretend to continue an in-memory simulation across document
loads. Selected neuron IDs and detail preference are carried between pages.
Story chapter/filtering choices can be bookmarked. Historical root `#story`,
`#matrix`, `#neuron`, `#projection` and `#circuit` links redirect to their HTML pages.

The desktop Explore layout follows the final export: a dominant anatomical viewer,
a right experiment column, and lower telemetry. The viewport contains the family
chips with actual counts, camera dock, source/detail badges and a selected-neuron
callout positioned at the projected skeleton center. The navy surface palette,
locally served Stitch typography and blue/magenta/violet/teal/amber family colors
are shared across the independent pages. Full detail and software-GPU overview,
selection dimming, depth fog and the no-WebGL Canvas fallback remain available.

## New diagrams and measurement definitions

The **Central Complex Orthogonal Projection** uses the illustrated PB arch,
FB trapezoid and EB ring from the supplied design as a clearly labelled schematic.
The landmarks are not claimed to be anatomically registered to neuron coordinates.
Sixteen ring bins average nonnegative EPG model activity by exported neuron angle.
Missing angles are excluded. Peak activity is in model units, not fluorescence or
voltage. FWHM is interpolated at half-maximum on the periodic binned profile and
reported unavailable when activity is absent or angle bins are missing. The cued
and decoded heading needles are distinct from the population-activity shading.

XY/XZ/YZ buttons lazily load and checksum-verify the real overview skeleton bundle.
These views are orthographic projections of the source axes, not an unverified
claim about dorsal/sagittal anatomy. Drag pans within the chosen plane; wheel and
buttons zoom. Unsupported wirings show the schematic and an explicit unavailable
message, never another fly's morphology. These pages do not load Three.js or
geometry until the relevant viewer is needed.

The **Compass Ring Attractor Wiring** diagram includes all six model families,
actual neuron counts, actual outgoing-edge counts, and a directed family graph.
Graph widths encode the sum of absolute exported weights. Family roles are a
schematic interpretation; no chemical transmitter identities are fabricated.

Its angular profile groups actual directed weights by wrapped postsynaptic minus
presynaptic angle. Values are the exported base weights, before trained gains and
scale. A descriptive least-squares fit `J0 + Jc cos(Δθ) + Js sin(Δθ)` and R² summarize
those observations. They do not replace the engine's matrix. Missing-angle edges
are counted and excluded; rank-deficient fits and undefined R² are marked unavailable.

The engine, model/reference JSON and anatomical bundles are unchanged. The export's
mock voltage, conductance, fluorescence, raw synapse counts, calibration and GPU
memory figures are not presented as measurements.

## Checks

- 137 Node tests and 9 Python tests, including periodic FWHM and harmonic-regression
  fixtures, missing-angle handling, graph identity and original model references.
- `tests/workspaces.cjs`: actual document navigation, parameter transfer, independent
  DOMs, direct addresses, story chapters, transplant/refit values, real matrix and
  neuron metrics, geometry export, diagrams, anatomical planes, 320–1440 px layouts,
  local assets and no-WebGL anatomy.
- Existing browser, WebGL, keyboard/contrast/lazy-loading and performance suites
  remain available. Serve `web/` first, then run the optional Playwright scripts.

Native physical-GPU performance has not been measured here. The CPU anatomical
projection is deliberately slower than WebGL; it is not advertised as 60 fps.
