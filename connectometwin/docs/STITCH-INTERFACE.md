# Four-screen instrument interface

The owner supplied `stitch_connectometwin_brain_simulator_interface.zip`, with
Explore Connectome, Guided Story, Synaptic Matrix and Neuron Deep Dive HTML and
its design specification. The implementation follows these four workspaces,
navy surfaces, blue/teal/lilac palette, instrument typography, compact cards,
viewer overlays, camera dock, family chips, chapter list and bottom navigation.
The source export used a remote illustrative image and mock numerical readouts;
those are replaced by the real renderer and the measurements below.

## Screens

- `#explore`: shared anatomical viewer, heading dial, error plot, benchmark,
  all seven wiring choices, own/transplant mode, clean/noise networks, scale,
  supported refits, cue/darkness and playback. Advanced viewer settings remain
  available here, plus a branch-detail button on every viewer.
- `#story`: five reference-driven chapters, back/next, preset summary, a chapter
  index and an actual current EPG population-activity chart. Take over returns
  to exploration with the current experiment preserved.
- `#matrix`: shared anatomical diff viewer, wiring selectors, directed-edge
  count differences by family, net edge delta, same-fly edge Jaccard overlap,
  and a signed family-to-family model-weight difference matrix. Its threshold
  is a display filter; it never changes the simulated network. The experiment
  button transplants A's parameters to B using the existing maps.
- `#neuron`: selected-neuron focus, exact root ID/type/family, incoming/outgoing
  partner counts, loaded skeleton segment count and polyline length, partner
  family weight shares, current-run model-activity history, an explicitly
  schematic family graph, isolation, and an attributed morphology JSON export.

One renderer and model state are retained across navigation. Browser back/forward
restores the workspace without silently resetting the experiment. Layouts stack
on phones; browser zoom remains available, and every action has text or a label.
No backend, build step or external runtime calls are introduced. The exact
Space Grotesk, Hanken Grotesk and JetBrains Mono fonts are locally vendored with
SIL OFL licenses and a pinned Google Fonts source revision in `web/fonts/`.

## Measurements and units

| Display | Definition |
| --- | --- |
| Added/removed/changed | Existing directed same-fly entries from `diffs.json`; changed exceeds 1.5× in either direction. Counts include the dataset, not only visible arcs. |
| Net connection delta | Number of directed edges in B minus number in A. These are not raw synapse sites. |
| Edge-set overlap | Intersection / union of exact `(presynaptic root ID, postsynaptic root ID)` sets. N/A across flies or for an empty union. Neuron row order is irrelevant. |
| Family delta | Difference in outgoing directed-edge counts for each family. |
| Weight matrix | Sum of signed B weights minus sum of signed A weights for each pre/post family. Units are exported model weights, not conductance or µS. |
| Neuron partners | Distinct incoming/outgoing neuron indices in the current wiring. |
| Family share | Sum of absolute incoming and outgoing model weights for that family divided by their sum over families. |
| Skeleton length | Sum of Euclidean edge lengths from the loaded, simplified coordinates, in µm. Overview hides fine terminal twigs, so its length differs from full detail. |
| Activity | Nonnegative rate-model activity, in arbitrary model units, at recorded model steps. These are not spike trains or membrane-voltage measurements. |
| Heading error | Existing engine/readout; wrapped degrees. Live single-heading trials, 16-heading demo means and published results remain explicitly distinct. |

The interface does not invent synapse coordinates, biological confidence scores,
cell lineage, membrane voltage, electrophysiology, acquisition resolution,
conductance loss, statistical p-values or milliseconds for a model without that
calibration. Per-neuron hue variation and brightness grading are cosmetic, not
additional biological measurements.

## Anatomical rendering

All 433 FlyWire skeletons retain their source coordinates and exact string IDs.
Full detail has 511,265 segments; fast overview has 130,607. WebGL hardware defaults
to full detail; detected software renderers use overview. Both remain selectable.
Rendering adds stable neuron color variation, restrained brightness, depth fog,
smaller activity anchors and selection-aware dimming. Selection, family filtering,
isolation, focus and camera controls operate on real geometry. Geometry assets
and `engine.mjs` are unchanged.

If WebGL 2 cannot initialize, `projected-view.mjs` loads and checksum-verifies the
same anatomical bundle and projects those real coordinates with Canvas. The
banner explicitly identifies this CPU projection; it supports drag rotation,
wheel/button zoom, keyboard and branch selection, filtering, isolation and
connection overlays. It is not equivalent to accelerated WebGL: refresh is capped
at 12.5 fps and full detail costs more CPU. The original 2D ring is still available.
Native GPU animation performance has not been measured on a physical laptop;
software browser checks are functional tests, not a hardware performance claim.

## Validation

- 131 Node checks and 9 Python import checks, including identity-safe graph
  comparison fixtures, signed weight aggregation and partner metrics.
- `tests/workspaces.cjs`: all four routes, full anatomy, real matrix values,
  cross-fly N/A values, transplant/refit references, chapters, neuron statistics,
  isolation, JSON export, browser history, 320–1440 px light/dark layouts,
  local assets and forced-no-WebGL real anatomy.
- Existing `browser.cjs`, `three.cjs`, `instrument.cjs` and `release.cjs` cover
  reference cases, tour, legacy loader, family filters, keyboard access, contrast,
  reduced motion, lazy requests and 2D performance. Start the static server first.

Screenshots in `docs/images/workspace-*.png` are actual application captures.
