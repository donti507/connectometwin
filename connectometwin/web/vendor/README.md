Three.js r170 (0.170.0), vendored from https://github.com/mrdoob/three.js/tree/r170
under the MIT license (THREE-LICENSE.txt). Files: build/three.module.js and
examples/jsm/controls/OrbitControls.js. OrbitControls' bare `three` import is
changed to `./three.module.js` for a static deployment without an import map.
These files load only when the visitor chooses 3D; no CDN is used.
