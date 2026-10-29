import {compileWiring, Simulation, wrapped} from './engine.mjs';
import {families, colors as defaultColors, layout, strongestEdges, orientedDiff, ratioWidth} from './view.mjs';
import {configureRun, referenceFor} from './run.mjs';
import {buildTour, study} from './tour.mjs';
import {createWiringLoader} from './data.mjs';
const $ = id => document.getElementById(id);
const radians = degrees => degrees * Math.PI / 180;
const degrees = angle => angle * 180 / Math.PI;
const fetchJSON = async name => {
  const response = await fetch(`data/${name}.json`);
  if (!response.ok) throw new Error(`Cannot load ${name}: HTTP ${response.status}`);
  return response.json();
};
const state = {data: {}, compiled: {}, current: null, simulation: null,
  points: [], trace: [], frame: null, running: false, lastStep: 0, activity: null, dirty: true};
const layer = document.createElement('canvas');
const canvas = $('network'), dial = $('dial'), chart = $('error-chart');
const ctx = canvas.getContext('2d'), dialCtx = dial.getContext('2d'), chartCtx = chart.getContext('2d');
let size = {width: 0, height: 0, dpr: 1};
let threeView=null,threePromise=null,viewMode='ring',previousAnimationTime=0;
let geometryPreference=new URLSearchParams(location.search).get('geometry')==='topology'?'topology':'anatomy';
let colors = [...defaultColors], palette = {}, request = 0, worker = null;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const loadWiring = createWiringLoader(fetchJSON,compileWiring);
async function ensureWiring(version) {
  const loaded = await loadWiring(version);
  state.data[version] = loaded.data; state.compiled[version] = loaded.compiled;
}
function updatePalette() {
  const style = getComputedStyle(document.documentElement);
  for (const token of ['surface','muted-text','canvas-grid','canvas-ring','cue','accent','text','positive','negative','added','removed','changed','cue-shade']) palette[token] = style.getPropertyValue(`--${token}`).trim();
  colors = families.map((_,i) => style.getPropertyValue(`--family-${i}`).trim());
  document.querySelectorAll('.family-dot').forEach((dot,i)=>{dot.style.background=colors[i];});
  threeView?.setTheme(palette,colors);
  drawConnections(); drawDial(); drawChart(); state.dirty = true;
}
window.addEventListener('themechange',updatePalette);
updatePalette();
function fail(error) {
  console.error(error); state.running = false;
  $('error-message').textContent = `${error.message}. Serve web/ with a static HTTP server, then reload to retry.`;
  $('error-message').hidden = false; $('load-state').textContent = 'Unable to load';
  $('play').disabled = true;
}
function fit(element) {
  const rect = element.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  element.width = Math.round(rect.width * dpr); element.height = Math.round(rect.height * dpr);
  const context = element.getContext('2d'); context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return {width: rect.width, height: rect.height, dpr};
}
function line(context, a, b, color, width = 1) {
  context.strokeStyle = color; context.lineWidth = width;
  context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
}
function drawConnections() {
  if (!state.current || !size.width || !size.height || state.loading) return;
  const data = state.data[state.current], points = state.points;
  layer.width = canvas.width; layer.height = canvas.height;
  const context = layer.getContext('2d'); context.scale(size.dpr, size.dpr);
  context.fillStyle = palette['surface']; context.fillRect(0, 0, size.width, size.height);
  const maxRadius = Math.max(1, Math.min(size.width, size.height) / 2 - 36);
  families.forEach((family, ring) => {
    const radius = maxRadius * (0.30 + ring * 0.135);
    context.strokeStyle = palette['canvas-ring']; context.lineWidth = 0.6;
    context.beginPath(); context.arc(size.width / 2, size.height / 2, radius, 0, Math.PI * 2); context.stroke();
    context.fillStyle = colors[ring]; context.font = '12px system-ui'; context.textAlign = 'center';
    context.fillText(family, size.width / 2, size.height / 2 - radius - 5);
  });
  const all = $('all-edges').checked, ids = strongestEdges(data.edges, all);
  context.globalAlpha = all ? 0.10 : 0.24;
  for (const i of ids) {
    const weight = data.edges.w[i];
    line(context, points[data.edges.pre[i]], points[data.edges.post[i]], weight >= 0 ? palette['positive'] : palette['negative'], all ? 0.45 : 0.65);
  }
  context.globalAlpha = 1;
  const missing = points.filter(p => p.fallback).length;
  $('connection-note').textContent = `${ids.length.toLocaleString()} / ${data.edges.w.length.toLocaleString()} connections · ${all ? 'all edges' : 'strongest by absolute weight'} · ${missing} missing angles placed evenly on their family rings (◇).`;
  const from = $('wiring').value, to = $('compare').value;
  const diff = orientedDiff(state.diffs, from, to);
  if (!diff) $('show-diff').checked = false;
  $('show-diff').disabled = !diff;
  $('diff-legend').hidden = viewMode==='three' || !($('show-diff').checked && diff);
  $('diff-note').hidden = viewMode==='three' || !$('show-diff').checked;
  if ($('show-diff').checked && diff) {
    const other = state.data[state.current === from ? to : from];
    const strength = new Map();
    for (const d of [data, other]) for (let i = 0; i < d.edges.w.length; i++) {
      const key = `${d.edges.pre[i]}:${d.edges.post[i]}`;
      strength.set(key, Math.max(strength.get(key) || 0, Math.abs(d.edges.w[i])));
    }
    const overlay = [ ...diff.added.map(pair => ({pair, color: palette['added'], width: 1.1})),
      ...diff.removed.map(pair => ({pair, color: palette['removed'], width: 1.1})),
      ...diff.changed.map((pair, i) => ({pair, color: palette['changed'], width: ratioWidth(diff.changed_ratio[i])})) ];
    if (!all) overlay.sort((a, b) => (strength.get(b.pair.join(':')) || 0) - (strength.get(a.pair.join(':')) || 0));
    const shown = all ? overlay : overlay.slice(0, 1200);
    context.globalAlpha = all ? 0.23 : 0.5;
    for (const item of shown) line(context, points[item.pair[0]], points[item.pair[1]], item.color, item.width);
    context.globalAlpha = 1;
    $('diff-note').textContent = `${state.data[from].name} → ${state.data[to].name}: ${diff.added.length.toLocaleString()} added, ${diff.removed.length.toLocaleString()} removed, ${diff.changed.length.toLocaleString()} changed (>1.5× in either direction). Showing ${shown.length.toLocaleString()} / ${overlay.length.toLocaleString()} diff edges. Width shows the magnitude of the log weight ratio for changed edges.`;
  }
  if(threeView && viewMode==='three'){threeView.setOptions(threeOptions());$('three-edges').checked=threeView.showEdges;}
  state.dirty = true;
}
function drawNetwork() {
  if(viewMode==='three' || !size.width || !size.height) return;
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.drawImage(layer, 0, 0, size.width, size.height);
  if (!state.current) return;
  let peak = 0;
  state.points.forEach((p, i) => { if (p.family === 'EPG') peak = Math.max(peak, state.activity?.[i] || 0); });
  state.points.forEach((point, i) => {
    const intensity = point.family === 'EPG' && peak > 0 ? Math.max(0, state.activity[i]) / peak : 0;
    if (intensity > 0.03) {
      const radius = 4 + 12 * intensity;
      const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      glow.addColorStop(0, colors[0] + Math.round(190 * intensity).toString(16).padStart(2,'0')); glow.addColorStop(1, colors[0]+'00');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = colors[point.ring];
    if (point.fallback) {
      ctx.strokeStyle = colors[point.ring]; ctx.lineWidth = 0.65;
      ctx.beginPath(); ctx.moveTo(point.x, point.y - 2); ctx.lineTo(point.x + 2, point.y); ctx.lineTo(point.x, point.y + 2); ctx.lineTo(point.x - 2, point.y); ctx.closePath(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(point.x, point.y, 1.6 + intensity * 2.2, 0, Math.PI * 2); ctx.fill();
    }
  });
  const selected = state.points[selectedNeuron];
  if (selected) { ctx.strokeStyle=palette.cue;ctx.lineWidth=2;ctx.beginPath();ctx.arc(selected.x,selected.y,7,0,Math.PI*2);ctx.stroke(); }
}
function drawDial() {
  const {width, height} = dial.getBoundingClientRect();
  if(!width || !height)return;
  dialCtx.clearRect(0, 0, width, height);
  const center = {x: width / 2, y: height / 2}, radius = Math.max(1,Math.min(width / 2 - 45, height / 2 - 25));
  dialCtx.strokeStyle = palette['canvas-ring']; dialCtx.lineWidth = 1;
  dialCtx.beginPath(); dialCtx.arc(center.x, center.y, radius, 0, Math.PI * 2); dialCtx.stroke();
  for (let i = 0; i < 36; i++) {
    const angle = i * Math.PI / 18, major = i % 9 === 0;
    const point = r => ({x: center.x + Math.cos(angle) * r, y: center.y - Math.sin(angle) * r});
    line(dialCtx, point(radius - (major ? 8 : 4)), point(radius), palette['canvas-grid']);
    if (major) { const p = point(radius + 14); dialCtx.fillStyle = palette['muted-text']; dialCtx.font = '12px system-ui'; dialCtx.textAlign = 'center'; dialCtx.textBaseline = 'middle'; dialCtx.fillText(`${i === 27 ? -90 : i * 10}°`, p.x, p.y); }
  }
  const target = radians(+$('angle').value);
  const needle = (angle, color, length, dashed) => {
    dialCtx.setLineDash(dashed ? [5, 5] : []);
    line(dialCtx, center, {x: center.x + Math.cos(angle) * length, y: center.y - Math.sin(angle) * length}, color, 2.5);
    dialCtx.setLineDash([]);
  };
  needle(target, palette['cue'], radius - 11, state.frame && state.frame.t >= state.run.options.cueSteps);
  if (state.frame) needle(state.frame.heading, palette['accent'], radius - 22, false);
  dialCtx.fillStyle = palette['text']; dialCtx.beginPath(); dialCtx.arc(center.x, center.y, 3, 0, Math.PI * 2); dialCtx.fill();
}
function drawChart() {
  const {width, height} = chart.getBoundingClientRect();
  if(!width || !height)return;
  const left = 43, right = width - 24, top = 15, bottom = height - 32;
  const x = t => left + t / 39 * (right - left), y = error => bottom - error / 180 * (bottom - top);
  chartCtx.clearRect(0, 0, width, height);
  chartCtx.fillStyle = palette['cue-shade']; chartCtx.fillRect(left, top, x(state.run?.options.cueSteps === 40 ? 39 : 4.5) - left, bottom - top);
  chartCtx.font = '12px system-ui'; chartCtx.textBaseline = 'middle';
  for (const error of [0, 60, 120, 180]) {
    line(chartCtx, {x: left, y: y(error)}, {x: right, y: y(error)}, palette['canvas-grid'], 0.6);
    chartCtx.fillStyle = palette['muted-text']; chartCtx.textAlign = 'right'; chartCtx.fillText(`${error}°`, left - 9, y(error));
  }
  for (const t of [0, 5, 10, 20, 30, 39]) { chartCtx.textAlign = 'center'; chartCtx.fillText(t, x(t), bottom + 15); }
  chartCtx.strokeStyle = palette['accent']; chartCtx.lineWidth = 1.8; chartCtx.beginPath();
  state.trace.forEach((error, t) => t ? chartCtx.lineTo(x(t), y(error)) : chartCtx.moveTo(x(t), y(error)));
  chartCtx.stroke();
  if (state.trace.length) {
    chartCtx.fillStyle = palette['accent']; chartCtx.beginPath(); chartCtx.arc(x(state.trace.length - 1), y(state.trace.at(-1)), 3, 0, Math.PI * 2); chartCtx.fill();
  }
}
function updateNumbers() {
  const t = state.frame?.t;
  $('decoded-number').textContent = state.frame ? `${degrees(state.frame.heading).toFixed(1)}°` : '—';
  $('step-number').textContent = `Step ${t ?? '—'} / 39`;
  $('cue-state').textContent = t === undefined ? 'READY' : t === 39 ? 'COMPLETE' : t < state.run.options.cueSteps ? 'CUE ON' : 'MEMORY';
  $('current-error').textContent = state.trace.length ? `${state.trace.at(-1).toFixed(2)}°` : '—';
  const errors = state.trace.slice(5);
  $('mean-error').textContent = errors.length ? `${(errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(2)}°` : '—';
  $('play').textContent = state.running ? 'Pause' : state.simulation?.t === 40 ? 'Replay' : 'Play';
  window.dispatchEvent(new Event('explorer-update'));
}
function selection() {
  return {a:$('wiring').value, b:$('compare').value, mode:$('mode').value,
    network:$('model').value, refit:$('refit').checked, scalePercent:+$('scale').value,
    darkness:$('darkness').checked};
}
const benchmarks = new Map();
async function restart() {
  if (!state.index) return false;
  const ticket = ++request, selected = selection();
  state.loading = true; state.running = false;
  document.body.dataset.ready = 'loading'; document.body.dataset.benchmark = 'loading';
  $('load-state').textContent = 'Loading selected wirings…';
  $('play').disabled = true; $('reset').disabled = true;
  worker?.terminate(); worker = null;
  try { await Promise.all([...new Set([selected.a,selected.b])].map(ensureWiring)); }
  catch (error) { if (ticket === request) { state.loading=false; fail(error); } return false; }
  if (ticket !== request) return false;
  state.loading = false;
  $('error-message').hidden = true;
  state.run = configureRun(state.data, state.maps, state.refits, selected);
  $('refit').disabled = !state.run.refitAvailable;
  if (!state.run.refitAvailable) $('refit').checked = false;
  $('refit-note').textContent = state.run.refitAvailable ? 'Cell-type gains fitted for this directed pair.' : 'Available for exported noise-trained transplant pairs only.';
  $('scale').disabled = $('model').value !== 'clean';
  if ($('scale').disabled) $('scale').value = '0';
  const baseline = state.reference.own[`${state.run.source}|clean`].error;
  $('scale-note').textContent = state.run.network === 'clean' ? `Unscaled own-wiring reference: ${baseline.toFixed(2)}° (16 headings).` : 'Switch to a clean network to explore the knife-edge.';
  $('scale-value').textContent = `${state.run.scalePercent > 0 ? '+' : ''}${state.run.scalePercent.toFixed(1)}%`;
  state.current = state.run.target;
  selectedNeuron = -1; $('neuron-details').textContent = 'No neuron selected.';
  $('run-announcement').textContent = '';
  state.points = layout(state.data[state.current].neurons, size.width, size.height);
  $('tooltip').hidden = true;
  $('neuron-count').textContent = `${state.data[state.current].neurons.length} neurons`;
  const sourceName = state.index.names[state.run.source], targetName = state.index.names[state.run.target];
  $('run-description').textContent = state.run.mode === 'own' ? `Own wiring: train and test on ${sourceName}. B is used for the diff overlay only.` : `Train on ${sourceName} → test on ${targetName}${state.run.refit ? ' · refitted cell-type gains' : ''}. Map and activity show wiring B.`;
  $('cue-note').textContent = $('darkness').checked ? 'Shaded: cue on (steps 0–4)' : 'Cue stays on for all 40 steps';
  const theta = radians(+$('angle').value);
  state.simulation = new Simulation(state.compiled[state.current], state.run.net, {...state.run.options, theta});
  state.trace = []; state.frame = null; state.activity = new Float64Array(state.simulation.wiring.n);
  state.lastStep = 0; state.running = true; state.dirty = true;
  $('cue-number').textContent = `${$('angle').value}°`; $('angle-value').textContent = `${$('angle').value}°`;
  const key = JSON.stringify([state.run.source,state.run.target,state.run.mode,state.run.network,state.run.refit,state.run.options]);
  const reference = referenceFor(state.run, state.reference, state.refits);
  $('benchmark-error').textContent = 'Calculating…';
  $('reference-error').textContent = reference ? `${reference.value.toFixed(2)}°` : 'Not available';
  const showBenchmark = benchmark => {
    if (ticket !== request) return;
    benchmarks.set(key,benchmark); $('benchmark-error').textContent = `${benchmark.toFixed(2)}°`;
    $('reference-note').textContent = reference ? `${reference.source}. Same 16 headings and steps 5–39; difference ${Math.abs(benchmark-reference.value).toFixed(4)}°. The live run above uses one heading.` : 'No exported reference for these settings. Current settings are calculated over the same 16 headings and steps 5–39. The live run above uses one heading.';
    document.body.dataset.benchmark = 'ready';
  };
  if (benchmarks.has(key)) showBenchmark(benchmarks.get(key));
  else {
    $('reference-note').textContent = 'Calculating the 16-heading benchmark in the background…';
    worker = new Worker(new URL('./benchmark-worker.mjs',import.meta.url),{type:'module'});
    const currentWorker = worker;
    worker.onmessage = ({data}) => { currentWorker.terminate(); if (ticket !== request) return; worker=null; if (data.failure) fail(new Error(data.failure)); else showBenchmark(data.error); };
    worker.onerror = () => { currentWorker.terminate(); if (ticket !== request) return; worker=null;fail(new Error('Benchmark calculation failed')); };
    worker.postMessage({wiring:state.compiled[state.current],net:state.run.net,theta:state.reference.theta,options:state.run.options});
  }
  $('play').disabled = false; $('reset').disabled = false;
  $('load-state').textContent = `● 7 wirings available · ${Object.keys(state.data).length} loaded`;
  document.body.dataset.ready = 'ready';
  drawConnections(); updateNumbers(); drawChart();
  if(threeView && viewMode==='three') syncThree().catch(threeFailure);
  return true;
}
function chooseWiring() { return restart(); }
function resize() {
  size = fit(canvas); fit(dial); fit(chart);
  if (state.current) state.points = layout(state.data[state.current].neurons, size.width, size.height);
  drawConnections(); drawDial(); drawChart(); state.dirty = true;
}
function animate(now) {
  const smoothingFactor=reduceMotion.matches?1:1-Math.exp(-Math.min(1000,previousAnimationTime?now-previousAnimationTime:16.7)/45);previousAnimationTime=now;
  if (!document.hidden && state.running && state.simulation && (!state.lastStep || now - state.lastStep >= 100)) {
    state.frame = state.simulation.step(); state.lastStep = now;
    state.trace.push(Math.abs(degrees(wrapped(state.frame.heading - state.simulation.theta))));
    if (state.simulation.t >= 40) { state.running = false; $('run-announcement').textContent = 'Run complete. Final error and mean are shown below.'; }
    updateNumbers(); drawChart(); state.dirty = true;
  }
  let smoothing = false;
  if (state.frame) for (let i = 0; i < state.activity.length; i++) {
    const difference = Math.max(0, state.frame.activity[i]) - state.activity[i];
    state.activity[i] += difference * smoothingFactor;
    if (Math.abs(difference) > 0.0001) smoothing = true;
  }
  if (state.dirty || smoothing) { drawNetwork(); drawDial(); state.dirty = false; }
  if(threeView && viewMode==='three' && !document.hidden){threeView.updateActivity(state.activity);threeView.render();}
  requestAnimationFrame(animate);
}
canvas.addEventListener('pointermove', event => {
  const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
  let nearest = -1, distance = 8;
  state.points.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < distance) { nearest = i; distance = d; } });
  const tooltip = $('tooltip'); tooltip.hidden = nearest < 0;
  if (nearest < 0) return;
  const neuron = state.data[state.current].neurons[nearest];
  tooltip.textContent = `${neuron.type} · ${neuron.family}\nID ${neuron.id}\n${state.points[nearest].fallback ? 'Angle unavailable · fallback position' : `Angle ${degrees(neuron.angle).toFixed(1)}°`}\nActivity ${Math.max(0, state.frame?.activity[nearest] || 0).toFixed(3)}`;
  tooltip.style.left = `${Math.max(0, Math.min(rect.width - 235, x + 12))}px`; tooltip.style.top = `${Math.min(rect.height - 100, y + 12)}px`;
});
canvas.addEventListener('pointerleave', () => { $('tooltip').hidden = true; });
let selectedNeuron = -1;
function describeNeuron(index) {
  const neuron = state.data[state.current]?.neurons[index];
  if (!neuron) return;
  selectedNeuron = index; state.dirty=true; threeView?.select(index);
  $('neuron-details').textContent = `Neuron ${index+1} of ${state.points.length}: ${neuron.type}, ${neuron.family}, ID ${neuron.id}. ${state.points[index].fallback ? 'Angle unavailable; fallback position.' : `Ring-layout angle ${degrees(neuron.angle).toFixed(1)} degrees.`} Activity ${Math.max(0,state.frame?.activity[index] || 0).toFixed(3)}.`;
  window.dispatchEvent(new Event('neuron-selected'));
}
canvas.addEventListener('keydown',event=>{
  if (!state.points.length || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const count = state.points.length;
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? count-1 : event.key === 'ArrowRight' ? (selectedNeuron+1)%count : (selectedNeuron-1+count)%count;
  describeNeuron(index);
});
canvas.addEventListener('click', event=>{
  const rect=canvas.getBoundingClientRect();let nearest=-1,distance=14;
  state.points.forEach((point,i)=>{const d=Math.hypot(point.x-(event.clientX-rect.left),point.y-(event.clientY-rect.top));if(d<distance){distance=d;nearest=i;}});
  if(nearest>=0) describeNeuron(nearest);
});
document.addEventListener('keydown',event=>{
  if(event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.target.closest('input,select,textarea,button,a,summary,[contenteditable]')) return;
  if(event.code==='Space' && !$('play').disabled){event.preventDefault();$('play').click();}
  if(event.key.toLowerCase()==='r' && !$('reset').disabled){event.preventDefault();$('reset').click();}
});

function threeOptions(){return {a:$('wiring').value,b:$('compare').value,diffs:state.diffs,diff:$('show-diff').checked,all:$('all-edges').checked};}
function threeFailure(error){
  $('three-status').hidden=false;$('three-status').textContent=`3D view: ${error.message} The 2D ring remains available.`;
  document.body.dataset.three='failed';
}
async function syncThree(){
  if(!threeView || !state.current || state.loading)return;
  document.body.dataset.three='loading';
  const data=state.data[state.current];
  if(threeView.data!==data){if(!await threeView.setWiring(data,threeOptions()))return;}
  else threeView.setOptions(threeOptions());
  if(geometryPreference==='anatomy' && threeView.available && threeView.mode!=='anatomy'){$('three-status').textContent=`Loading ${threeView.available} real neuron skeletons…` ;await threeView.setMode('anatomy');}
  $('three-mode').value=threeView.mode;
  $('three-detail').value=threeView.manifest.levels?.overview?threeView.detail:'full';$('three-detail').disabled=threeView.mode!=='anatomy'||!threeView.manifest.levels?.overview;
  const anatomical=$('three-mode').querySelector('[value=anatomy]');anatomical.disabled=!threeView.available;
  anatomical.textContent=threeView.available?`Anatomical skeletons · ${threeView.available}/${data.neurons.length} available`:'Anatomical skeletons · not imported';
  $('three-edges').checked=threeView.showEdges;
  $('three-status').textContent=threeView.mode==='anatomy'?`Real FlyWire-783 anatomy: ${threeView.skeletons.length}/${data.neurons.length} matching neurons. ${threeView.detail==='overview'&&threeView.manifest.levels?.overview?'Fast overview hides fine terminal twigs; choose Full branches for full detail.':'Full branch detail at 0.25 µm path tolerance.'} Source coordinates are rescaled together.`:`Topology preview: ${data.neurons.length} model neurons in a 3D graph layout. This is not anatomical neuron shape. ${threeView.available ? `${threeView.available} matching anatomical skeletons can be loaded with the Geometry selector.`:'The public morphology source is identified, but no anatomical skeletons are bundled yet.'}`;
  if(threeView.projection)$('three-status').textContent='WebGL unavailable: displaying real anatomy with a Canvas projection. Drag to rotate; scroll to zoom. Lower refresh rate; browser graphics acceleration enables full 3D. '+$('three-status').textContent;
  if(selectedNeuron>=0){threeView.select(selectedNeuron);if(document.body.dataset.screen==='neuron')threeView.focusSelected();}
  document.body.dataset.renderer=threeView.projection?'canvas-projection':'webgl';
  document.body.dataset.three='ready';threeView.resize();
}
async function chooseThree(){
  $('three-status').hidden=false;document.body.dataset.three='loading';
  try{
    $('three-status').textContent='Preparing the 3D anatomy explorer…';
    if(!threePromise)threePromise=import('./three-view.mjs');
    const {ThreeView}=await threePromise;
    $('three-wrap').hidden=false;$('three-controls').hidden=false;$('three-help').hidden=false;
    if(!threeView){
      const probe=document.createElement('canvas'),context=probe.getContext('webgl2');
      if(context){context.getExtension('WEBGL_lose_context')?.loseContext();try{threeView=new ThreeView($('three-wrap'),describeNeuron);}catch{const {ProjectedView}=await import('./projected-view.mjs');threeView=new ProjectedView($('three-wrap'),describeNeuron);}}
      else {const {ProjectedView}=await import('./projected-view.mjs');threeView=new ProjectedView($('three-wrap'),describeNeuron);}
      threeView.setTheme(palette,colors);
    }
    viewMode='three';$('network').style.visibility='hidden';$('network').tabIndex=-1;$('network').setAttribute('aria-hidden','true');
    $('network-help').hidden=true;$('tooltip').hidden=true;
    $('connection-note').hidden=true;$('diff-note').hidden=true;
    $('view-three').setAttribute('aria-pressed','true');$('view-ring').setAttribute('aria-pressed','false');
    await syncThree();
  }catch(error){showRing();threeFailure(error);}
}
function showRing(){viewMode='ring';$('connection-note').hidden=false;drawConnections();$('three-status').hidden=true;$('three-wrap').hidden=true;$('three-controls').hidden=true;$('three-help').hidden=true;$('network-help').hidden=false;$('network').style.visibility='visible';$('network').tabIndex=0;$('network').removeAttribute('aria-hidden');$('view-three').setAttribute('aria-pressed','false');$('view-ring').setAttribute('aria-pressed','true');state.dirty=true;}
$('view-three').addEventListener('click',chooseThree);$('view-ring').addEventListener('click',showRing);
$('three-wrap').addEventListener('three-error',event=>threeFailure(new Error(event.detail)));
$('three-home').addEventListener('click',()=>threeView?.home());
$('three-family').addEventListener('change',()=>threeView?.setFilter($('three-family').value));
$('three-rotate').addEventListener('change',()=>{if(threeView)threeView.controls.autoRotate=$('three-rotate').checked;});
$('three-edges').addEventListener('change',()=>{if(threeView){threeView.showEdges=$('three-edges').checked;threeView.lines.visible=threeView.showEdges;threeView.dirty=true;}});
$('three-detail').addEventListener('change',async()=>{if(!threeView)return;try{document.body.dataset.three='loading';threeView.detail=$('three-detail').value;await threeView.setMode('anatomy');await syncThree();}catch(error){threeFailure(error);}});
$('three-mode').addEventListener('change',async()=>{try{geometryPreference=$('three-mode').value;document.body.dataset.three='loading';await threeView.setMode(geometryPreference);await syncThree();}catch(error){$('three-mode').value=threeView.mode;threeFailure(error);}});
const tour = {index:-1, filtering:false};
function endTour() {
  tour.index = -1; tour.filtering = false;
  $('tour-progress').textContent = 'GUIDED TOUR · 5 STEPS';
  $('tour-title').textContent = 'Explore freely—or replay the story.';
  $('tour-caption').textContent = 'Your controls are yours to change. Restart the tour to return to the same-fly comparison.';
  $('tour-back').disabled = true; $('tour-next').textContent = 'Start tour';
  $('tour-exit').hidden = true; $('tour-examples').hidden = true;
  $('tour-number-note').hidden = true;
}
async function applyTour(index) {
  const steps = buildTour(state.reference,state.refits,state.diffs,tour.filtering);
  tour.index = Math.max(0,Math.min(steps.length-1,index));
  const step = steps[tour.index], settings = step.settings;
  for (const [id,value] of Object.entries({wiring:settings.a,compare:settings.b,mode:settings.mode,model:settings.network,angle:settings.angle,scale:settings.scalePercent})) $(id).value = value;
  for (const [id,value] of Object.entries({refit:settings.refit,darkness:settings.darkness,'show-diff':settings.diff,'all-edges':settings.allEdges})) $(id).checked = value;
  const tourStep = tour.index;
  if (!await chooseWiring() || tour.index !== tourStep) return;
  state.running = settings.playing; updateNumbers();
  $('tour-progress').textContent = `GUIDED TOUR · STEP ${tour.index+1} OF ${steps.length}`;
  $('tour-title').textContent = step.title; $('tour-caption').textContent = step.caption;
  $('tour-back').disabled = tour.index === 0;
  $('tour-next').textContent = tour.index === steps.length-1 ? 'Finish tour' : 'Next';
  $('tour-exit').hidden = false; $('tour-examples').hidden = tour.index !== 4;
  $('tour-number-note').hidden = false;
  $('tour-detector').setAttribute('aria-pressed',String(!tour.filtering));
  $('tour-filtering').setAttribute('aria-pressed',String(tour.filtering));
}
function manualChange(action) {
  return () => { if (tour.index >= 0) endTour(); action(); };
}
$('tour-next').addEventListener('click',()=>tour.index===4 ? endTour() : applyTour(tour.index+1));
$('tour-back').addEventListener('click',()=>applyTour(tour.index-1));
$('tour-exit').addEventListener('click',endTour);
for (const [id,filtering] of [['tour-detector',false],['tour-filtering',true]]) $(id).addEventListener('click',()=>{tour.filtering=filtering;applyTour(4);});
$('wiring').addEventListener('change', manualChange(chooseWiring));
$('compare').addEventListener('change', manualChange(chooseWiring));
for (const id of ['mode','refit','darkness']) $(id).addEventListener('change', manualChange(restart));
$('scale').addEventListener('input', manualChange(restart));
for (const id of ['all-edges', 'show-diff']) $(id).addEventListener('change', manualChange(drawConnections));
$('model').addEventListener('change', manualChange(restart)); $('angle').addEventListener('input', manualChange(restart));
$('reset').addEventListener('click', restart);
$('play').addEventListener('click', () => {
  if (state.simulation.t >= 40) restart(); else { state.running = !state.running; state.lastStep = 0;if(!state.running&&state.frame){for(let i=0;i<state.activity.length;i++)state.activity[i]=Math.max(0,state.frame.activity[i]);state.dirty=true;} updateNumbers(); }
});
document.addEventListener('visibilitychange', () => { state.lastStep = 0; });
new ResizeObserver(resize).observe($('network').parentElement);
for (const [i, family] of families.entries()) {
  const item = document.createElement('span'), dot = document.createElement('i');
  dot.className = 'family-dot'; dot.style.background = colors[i]; item.append(dot, family); $('family-legend').append(item);
}
try {
  [state.index, state.diffs, state.maps, state.refits, state.reference] = await Promise.all(['index','diffs','maps','refits','reference'].map(fetchJSON));
  for (const id of ['wiring','compare']) { $(id).replaceChildren(...state.index.versions.map(v => new Option(state.index.names[v], v))); $(id).disabled = false; }
  $('compare').value = 'fafb_buhmann';
  $('wiring').value = 'fafb'; $('wiring').disabled = false; $('play').disabled = false; $('reset').disabled = false;
  fit(dial); fit(chart); size = fit(canvas); await chooseWiring();
  if (reduceMotion.matches) { state.running=false; updateNumbers(); }
  const numberRows = [
    ['Princeton on own wiring',study.own,state.reference.own['fafb|noise'].error],
    ['Princeton → Buhmann',study.detector,state.reference.transplant['fafb__fafb_buhmann|noise']],
    ['Detector difference, refitted',study.detectorRefit,state.refits.fafb__fafb_buhmann.error_after_refit],
    ['Male CNS filtering difference',study.filtering,state.refits.mcns__mcns_neuprint.error_zero_shot],
    ['Filtering difference, refitted',study.filteringRefit,state.refits.mcns__mcns_neuprint.error_after_refit],
  ];
  for (const [label,paper,demo] of numberRows) {
    const row = document.createElement('tr');
    for (const value of [label,`${paper.toFixed(2)}°`,`${demo.toFixed(2)}°`]) { const cell = document.createElement('td'); cell.textContent=value; row.append(cell); }
    $('tour-source-values').append(row);
  }
  $('study-results-link').href = study.source; $('tour-next').disabled = false;
  requestAnimationFrame(animate);
  if(new URLSearchParams(location.search).get('view')!=='ring')chooseThree();
} catch (error) { fail(error); }

// Read-only presentation snapshot and explicit UI actions. The engine is unchanged.
export function explorerSnapshot(){return {data:state.data[state.current],a:state.data[$('wiring').value],b:state.data[$('compare').value],index:state.index,diffs:state.diffs,reference:state.reference,refits:state.refits,frame:state.frame,trace:state.trace,selected:selectedNeuron,run:state.run,tourIndex:tour.index,filtering:tour.filtering,view:threeView};}
export function inspectNeuron(index){if(Number.isInteger(index)&&index>=0&&index<(state.data[state.current]?.neurons.length||0))describeNeuron(index);}
export async function jumpTour(index){await applyTour(index);}
export function cameraAction(action){if(!threeView)return;if(action==='home')threeView.home();else if(action==='isolate')threeView.isolate(selectedNeuron);else if(action==='clear')threeView.isolate(-1);else if(action==='focus')threeView.focusSelected();else if(action==='zoom-in'||action==='zoom-out'){if(threeView.projection){threeView.zoomBy(action==='zoom-in'?1.2:.83);return;}threeView.camera.position.sub(threeView.controls.target).multiplyScalar(action==='zoom-in'?.83:1.2).add(threeView.controls.target);threeView.dirty=true;}}
