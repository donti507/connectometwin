# Real FlyWire anatomy

The viewer now bundles real skeleton shapes for **433/433 compass-circuit
neurons** from FlyWire materialization 783. The default landing view is an anatomical overview
(all 433 neurons, with fine terminal twigs hidden); use `?view=ring` for the original 2D layout. The Geometry selector can also
show a clearly labelled non-anatomical topology layout.

![Real anatomical skeletons](images/anatomy.png)

## Source, license and coverage

The project owner downloaded `sk_lod1_783_healed_ds2.parquet` from
[Zenodo 10877326](https://zenodo.org/records/10877326), then extracted the model's
433 exact neuron IDs into `compass-neurons.parquet`. The source dataset record
identifies **CC BY 4.0**. Attribution:

Schlegel, P., & Jefferis, G. S. X. E. (2024). *Supplemental Files for Schlegel
et al., Nature (2024)* [Dataset]. Zenodo. DOI: 10.5281/zenodo.10877326.

The supplied subset is 24,440,179 bytes, contains 1,050,356 nodes and has SHA-256
`f373005d749d094d70f4f97747d6891e981f719f62a2a7af40d35762dab409d7`.
All 433 model IDs match; there are no missing or extra neurons. The original
5.4 GB file was not uploaded or independently checksummed in this environment.
The upload resolves the previous cloud-source network blocker: the bundled
viewer needs no access to Zenodo or the public skeleton server at runtime.

The importer reconstructs SWC parent links by node ID (not table row position),
converts source nanometers to micrometers, and simplifies degree-two paths at
0.25 µm tolerance. Branch points, endpoints and tree connectivity are retained.
The shipped geometry has **511,698 vertices and 511,265 segments**. Coordinates
are rounded to four decimal places in µm and packed as float32; all skeletons
share one display translation and uniform scale, preserving their anatomical
placement. The exact original shape is approximated at the documented tolerance.

See the [data license and modifications](../web/data/anatomy/LICENSE.md).
No synthetic fixture or artificial anatomy is shipped as scientific data.

## Reproduce from the extracted Parquet

Install PyArrow in an isolated environment, then run from the repository root:

```sh
python3 -m venv .venv-anatomy
.venv-anatomy/bin/python -m pip install pyarrow==26.0.0
.venv-anatomy/bin/python connectometwin/scripts/import_anatomy.py \
  --parquet /path/to/compass-neurons.parquet --limit 0 --bundle --overview \
  --license CC-BY-4.0 --license-url https://zenodo.org/records/10877326
```

The explicit license fields above correspond to the supplied source-record
license, not an invented workaround. For future sources, verify their actual
terms and retain attribution before redistribution. The default network importer
still reads license metadata from Zenodo and downloads the documented public
precomputed skeleton endpoint; network allowlist changes are only needed for
that fresh-download route. `--input-dir` accepts local precomputed binary files.
`--limit 24` imports a prototype instead of the full circuit; partial coverage
is identified in the manifest and UI. A failed import leaves the previous
published manifest unchanged.

The earlier per-neuron endpoint is documented by the maintained
[fafbseg-py client](https://github.com/flyconnectome/fafbseg-py/blob/b62bed6572afb98ac6e64e738b8805341e7ee027/fafbseg/flywire/skeletonize.py):
`https://flyem.mrc-lmb.cam.ac.uk/flyconnectome/flywire_skeletons_783/<root-id>`.
The shipped bundle was instead generated directly from the supplied Zenodo
Parquet subset; it is not claimed to be a download from that endpoint.

## Fast overview and full detail

The default overview has 130,607 segments and a **2,620,808-byte** bundle. It
omits terminal twig paths shorter than 5 µm, then simplifies remaining paths at
0.75 µm. It retains a connected core for every neuron and uses genuine retained
source points. This is a display LOD, not a claim that those fine branches are
absent in the reconstruction. **Full branches** loads the unchanged full
511,265-segment bundle. Each level has its own checksum and explicit manifest
entries; both contain the same 433 IDs.

The overview reduces first-load traffic and GPU work. Software-only WebGL was
measured at about 16–17 fps during overview rotation in headless Chromium.
Hardware acceleration is recommended; this software measurement is not a
physical GPU benchmark or a claim of 60 fps on every device. Software rendering
uses lower drawing-buffer resolution and disables multisample antialiasing;
native GPUs retain normal antialiasing. Paused views stop drawing once display
activity settles, and display smoothing uses elapsed time rather than frame count.

## Bundle format and validation

`web/data/anatomy/flywire-783.ctsk` is a **10,233,968-byte** local static asset.
The manifest identifies `ct-skeletons-v1`, its byte length and SHA-256
`102b511ff449ff1ad2d13e8d35b0b71b68ad21e523095af2f392eed94004e36a`.
The browser verifies the complete checksum before decoding.

- Eight ASCII magic bytes: `CTSK0001`.
- Each neuron block starts at its manifest byte offset and contains two
  little-endian uint32 counts: number of vertices and number of edges.
- Then `3 × vertices` float32 coordinates in micrometers, followed by
  `2 × edges` uint32 local vertex indices.
- Root IDs remain strings in the manifest; they never pass through JavaScript
  floating-point integer conversion. All ranges, counts, indices and finite
  coordinates are validated. Packed typed-array views share the input buffer.
- Legacy per-neuron JSON is still supported for small/custom imports and tests.

One bundle request per chosen detail level replaces 433 individual requests. It is fetched once and
reused across matching FlyWire variants. GPU geometry is preallocated in typed
arrays and batched into a skeleton draw call; only changed per-neuron color ranges are uploaded. Paused scenes stop drawing after activity and camera damping settle.
The numerical engine and existing reference values are unchanged.

## Interaction and scientific limits

Rotate by dragging, zoom by wheel/pinch, or use arrow keys to pan, +/− to zoom,
Home to fit the camera and [/] to select visible neurons. Family filters and
picking work with live EPG activity. The default anatomical view hides connection
arcs to show actual branches clearly; enable them explicitly when comparing
model connectivity. Native WebGL is preferred, with the 2D fallback available
when it cannot initialize.

Princeton, Buhmann and unfiltered FlyWire share geometry only by exact root ID.
Detector changes alter modeled connections, not fabricated neuron morphologies.
Male CNS, hemibrain and BANC still use topology until their own matching anatomy
is supplied. No cross-fly anatomy is assigned through a transplant map.

This is line-skeleton anatomy, not a surface mesh or a reconstruction of the
whole fly brain. The 433-neuron circuit is a selected subnetwork. Displayed
activity is simulated, not imaging fluorescence. Optional connection arcs join
skeleton centers, not localized synapses; synapse coordinates are not in these
exports. 3D diffs use colors and a bounded sample; 2D retains ratio-dependent
line width and full counts.

## Checks

```sh
for test in connectometwin/tests/*.test.mjs; do node "$test" || exit; done
python3 -m unittest discover -s connectometwin/tests -p test_anatomy.py
# Optional; requires Playwright, Chromium and the static HTTP server:
node connectometwin/tests/three.cjs
node connectometwin/tests/browser.cjs
node connectometwin/tests/release.cjs
```

The Node anatomy test checks the real bundle hash, complete exact-ID coverage,
all coordinates and indices, and every neuron's tree connectivity. It also verifies that overview coordinates
are retained genuine source points and that all neuron IDs remain covered. Python tests
cover SWC mapping/units, path preservation and binary format. The browser checks
real anatomy, default landing, filters, camera/selection, transplant/refit
benchmarks, mobile layout, a test-only legacy JSON fixture and no-WebGL fallback.
The existing 2D release/performance checks explicitly use `?view=ring`; their
frame-rate numbers must not be presented as anatomical rendering benchmarks.
