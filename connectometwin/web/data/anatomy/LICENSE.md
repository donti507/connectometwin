# Anatomical data attribution and license

The anatomical geometry in `flywire-783.ctsk` is derived from:

Schlegel, P., & Jefferis, G. S. X. E. (2024). *Supplemental Files for Schlegel
et al., Nature (2024)* [Dataset]. Zenodo.
https://doi.org/10.5281/zenodo.10877326

Original file: `sk_lod1_783_healed_ds2.parquet`, FlyWire materialization 783.
License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**.
License terms: https://creativecommons.org/licenses/by/4.0/

Paper: Schlegel et al., *Whole-brain annotation and multi-connectome cell typing
of Drosophila*, Nature (2024). https://doi.org/10.1038/s41586-024-07686-5
The underlying FlyWire resource and proofreading are described by Dorkenwald
et al., Nature (2024). Please cite the original resource as appropriate.

Changes made for ConnectomeTwin:

- Selected the exact 433 root IDs in the FlyWire compass-circuit model.
- Converted source coordinates from nanometers to micrometers.
- Simplified degree-two paths with a 0.25 µm geometric tolerance, retaining
  branch points, endpoints and the original connectivity of each skeleton.
- Rounded retained coordinates to four decimal places in micrometers and packed
  them as float32; parent links are stored as exact uint32 local vertex indices.
- Applied one shared translation and uniform display scale at render time;
  neurons are not individually rearranged into rings.

The uploaded 24,440,179-byte subset was supplied by the project owner after
filtering the original Zenodo file. Its SHA-256 is
`f373005d749d094d70f4f97747d6891e981f719f62a2a7af40d35762dab409d7`.
The original 5.4 GB file was not uploaded or independently checksummed here.
The supplied source-record text identifies the CC BY 4.0 license; the import
used that explicit license metadata without requiring a new network download.

The bundle SHA-256, coverage and segment counts are recorded in `manifest.json`.
Simulation brightness and connection-center arcs are generated overlays, not
recorded fluorescence or localized synapse coordinates. Use of these derived
data does not imply endorsement by the original authors or data providers.

The optional fast-overview derivative additionally omits terminal twigs shorter
than 5 µm and simplifies the remaining core at 0.75 µm. It is explicitly labelled
as reduced display detail; the full bundle remains available and is not pruned.
