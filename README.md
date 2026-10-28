# ConnectomeTwin

An interactive companion to **Reconstruction differences rival individual differences in the fly compass connectome and break trained circuit models** by Md Ali Ashraf Yad and Nazifa Tabassum Nabila (2026).

Compare reconstructions of the same fly compass circuit, watch a trained network remember a heading, and see what happens when its wiring changes. The five-step tour covers detector differences, transplantation, and cell-type gain refitting.

![ConnectomeTwin explorer showing family rings, live EPG activity, the heading dial and error plot in dark mode](connectometwin/docs/images/explorer.png)

## Run locally

No build step or JavaScript dependencies are required. From the repository root:

```sh
cd connectometwin/web
python -m http.server 8000
```

Open `http://localhost:8000/`. Use `python3` if your system names Python 3 that way. Open `self-check.html` on the same server to run the 46 model reference cases in your browser. All application assets and data are local.

## Controls and accessibility

- Theme defaults to your system's `prefers-color-scheme`; choose System, Light or Dark to override. Explicit choices persist locally.
- Use Tab to reach controls, and the native arrow keys for selects and sliders. Outside form controls, **Space** plays/pauses and **R** restarts.
- Focus the connection map and use **Left/Right** to inspect neurons, or **Home/End** to jump to the first/last. Details are also available by hover or tap.
- Playback starts paused when reduced motion is requested. Error values are available as text alongside Canvas plots.
- The layout supports phones and laptops. Readability and keyboard checks are documented in the [development README](connectometwin/README.md).

## GitHub Pages

The [Pages workflow](.github/workflows/pages.yml) validates the model and packages **only `connectometwin/web/`** as the site's root. It runs on pushes to `main` affecting the site or tests, and can be started manually.

1. In the repository, open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
2. Open **Actions → Validate and deploy ConnectomeTwin → Run workflow** if the push did not already trigger it.
3. After a successful deployment, use the URL shown by the `github-pages` environment. The expected project URL is `https://donti507.github.io/connectometwin/`.

Pages must be enabled for the repository/account, and repository policies must permit Actions and Pages deployment. Do not select the branch-based `/docs` option: the workflow publishes the web folder directly, preserving relative JSON, module and worker URLs. Workflow preparation and a successful Git push alone do not establish that the site is live.

## Validation and performance

From the repository root, with Node 24:

```sh
for test in connectometwin/tests/*.test.mjs; do node "$test" || exit; done
```

Optional browser checks require Playwright, Chromium and the local server:

```sh
node connectometwin/tests/browser.cjs
node connectometwin/tests/release.cjs
```

Wiring JSON is fetched and compiled only when selected as A/B, then cached. Startup loads two wirings instead of seven. Background workers calculate 16-heading benchmarks without blocking animation; stale selection/worker results are ignored. Connection layers are cached, with the strongest 1,200 edges shown by default.

In headless Chromium at 1366 px with **4× CPU throttling**, the largest wiring (33,783 edges) measured **58.3 fps** with default edges and **60.4 fps** with all edges; 95th-percentile frame gaps were 25.2 ms and 21.5 ms. This is a repeatable slower-CPU proxy for a mid-range laptop, not a physical laptop benchmark or a guarantee for every device. Run `release.cjs` to measure your machine. Checks also cover 320, 390, 768 and 1366 px layouts, theme persistence, Canvas colors, keyboard operation, text contrast, lazy-loading races and reduced motion.

## Citation and data

[Paper: arXiv:2610.29205](https://arxiv.org/abs/2610.29205) · [Study code and results: ChessFly](https://github.com/donti507/chessfly)

```bibtex
@article{yad2026reconstruction,
  title = {Reconstruction differences rival individual differences in the fly compass connectome and break trained circuit models},
  author = {Yad, Md Ali Ashraf and Nabila, Nazifa Tabassum},
  journal = {arXiv preprint arXiv:2610.29205},
  year = {2026},
  doi = {10.48550/arXiv.2610.29205},
  url = {https://arxiv.org/abs/2610.29205}
}
```

Connectome data: **FlyWire, Janelia FlyEM (male CNS and hemibrain), and BANC**. Imaging context: **DANDI 000289**, Basnak et al. (2025). This page simulates the model; it does not replay imaging recordings. Please cite the original datasets and respect their licenses.

See the [development README](connectometwin/README.md) for the model, experiments and numerical source notes, and the [roadmap](connectometwin/docs/ROADMAP.md) for implementation status.
