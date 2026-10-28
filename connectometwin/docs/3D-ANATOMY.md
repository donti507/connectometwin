# 3D anatomy: source access and implementation status

The goal is real neuron morphology with simulated activity, not an invented
brain illustration. The existing ring simulator and its numerical engine remain
unchanged. Choose **3D explorer** to try rotation/zoom, family filtering, neuron
selection and the live simulation in a clearly labelled **topology preview**.
That preview uses the real model graph but synthetic layout coordinates; it is
not reconstructed anatomy and is not the anatomical result pictured in the goal.

## What works now

- Pinned, locally vendored Three.js r170 and OrbitControls (MIT license), loaded
  only when the visitor selects 3D. There is no CDN or external runtime request.
- Orbit, zoom, camera reset, optional slow rotation and family filtering.
  On the focused 3D canvas, arrows pan, +/− zoom, Home resets, and [/] select
  neurons. Mouse/touch picking selects nodes or loaded skeleton branches.
- Exact string-ID matching for anatomy, including IDs beyond JavaScript's safe
  integer range. Unmatched neurons are omitted from anatomical mode. Anatomy
  from one fly is never applied to another fly via an angle or transplant map.
- Shared own/transplant/refit simulation and live EPG activity. Brightness is a
  model visualization, not microscopy fluorescence or a physical light source.
- Bounded lazy skeleton loading, uniform coordinate normalization, batched
  skeleton lines with per-neuron GPU state and cached geometry.
- Connection arcs join graph nodes or skeleton centers; synapse coordinates are
  not available in the current exports. They must not be described as localized
  anatomical synapses. 3D diffs use colors and a bounded sample (400 per kind by
  default); use the 2D view for ratio-dependent line width and its full counts.
- A working 2D fallback when WebGL is unavailable.

## Real data source found, download currently blocked

The maintained FlyWire client documents public precomputed skeletons for the
**783** materialization, matching the FlyWire root IDs in this project:

- Endpoint: `https://flyem.mrc-lmb.cam.ac.uk/flyconnectome/flywire_skeletons_783/<root-id>`
- Client source: [fafbseg-py skeletonize.py](https://github.com/flyconnectome/fafbseg-py/blob/b62bed6572afb98ac6e64e738b8805341e7ee027/fafbseg/flywire/skeletonize.py)
- Dataset/source record: [Zenodo 10877326](https://zenodo.org/records/10877326),
  linked by the [FlyWire annotations repository](https://github.com/flyconnectome/flywire_annotations#skeletons--nblast-scores).

Both hosts returned a proxy policy denial in this cloud environment. Required
additions were saved to the environment configuration draft, preserving its
package-manager presets. Review/save the settings and publish the environment
configuration so the running environment can reach:

```text
flyem.mrc-lmb.cam.ac.uk
zenodo.org
```

No CAVE token or other new secret has been requested: this is a documented public
source and the observed blocker is the network allowlist. A saved draft alone
has not enabled access. The checked-in anatomy manifest contains **zero** neurons
and marks the data as awaiting access. No genuine skeleton download, coverage,
license verification or anatomical screenshot is claimed yet.

## Resume with real anatomy

From the repository root, after the required network access is applied:

```sh
# Check the source record's license and import a real EPG-first prototype.
python3 connectometwin/scripts/import_anatomy.py --limit 24

# After reviewing the prototype and confirming its provenance and anatomy:
python3 connectometwin/scripts/import_anatomy.py --limit 0
```

The importer reads the license identifier from the authoritative Zenodo record;
it does not guess a license. If the record does not expose one, inspect its terms
and use both `--license` and `--license-url` with verified metadata. Do not pass
invented values to bypass the provenance check. The original source attribution
and license must be retained when distributing imported data.

It downloads matching IDs with TLS verification, parses the Neuroglancer
precomputed skeleton format, converts source nanometers to micrometers and
simplifies only degree-two paths (default error tolerance 0.25 µm). Branch
points, terminals and cycles are preserved. Raw source bytes are cached outside
the checkout, and SHA-256 checksums, license metadata, coverage and missing IDs
are recorded in `web/data/anatomy/manifest.json`. Existing published anatomy is
left unchanged after a failed import. `--allow-partial` explicitly permits a
partial dataset and records missing neurons; partial coverage is shown in the UI.

`--input-dir` can read previously obtained raw `<root-id>` skeleton files instead
of making requests. `--output` can prepare a separate review directory. A 24-cell
prototype is not the full 433-neuron circuit. Even a complete FlyWire import does
not supply anatomical geometry for male CNS, hemibrain or BANC; those versions
continue to have a topology preview until matching sources are imported.

Serve `connectometwin/web/` over HTTP, select **3D explorer**, and choose
**Anatomical skeletons** once matching files exist. Princeton, Buhmann and
unfiltered FlyWire variants can share a skeleton only by exact root-ID match:
their detector differences change edges, not invented neuron shapes.

## Validation and next milestones

```sh
node connectometwin/tests/anatomy.test.mjs
python3 -m unittest discover -s connectometwin/tests -p test_anatomy.py
# Requires Playwright, Chromium and the local server:
node connectometwin/tests/three.cjs
```

Parser/simplifier tests use synthetic binary files in temporary directories.
The WebGL test intercepts anatomy responses with a synthetic fixture only in
its test browser. Those fixtures are not product assets or evidence of an
anatomical download. The browser checks rendering, keyboard/picking support,
filters, numerical transplant/refit values, lazy local assets, cross-fly exclusion,
mobile layout and no-WebGL fallback. The existing model reference gates remain
required and the engine itself has not been changed.

The outstanding first milestone is a **real matching skeleton prototype**.
Then inspect anatomical orientation and completeness, import the full FlyWire
circuit, measure full-anatomy performance on target hardware and capture genuine
anatomical screenshots before describing the anatomical viewer as complete or
publishing it as that result. The topology preview alone does not complete these
milestones.
