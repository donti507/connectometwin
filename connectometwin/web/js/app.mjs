import {compileWiring, Simulation, simulate, wrapped} from './engine.mjs';
import {families, colors, layout, strongestEdges, orientedDiff, ratioWidth} from './view.mjs';
import {configureRun, referenceFor} from './run.mjs';
import {buildTour, study} from './tour.mjs';
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
  if (!state.current || !size.width) return;
  const data = state.data[state.current], points = state.points;
  layer.width = canvas.width; layer.height = canvas.height;
  const context = layer.getContext('2d'); context.scale(size.dpr, size.dpr);
  context.fillStyle = '#16201c'; context.fillRect(0, 0, size.width, size.height);
  const maxRadius = Math.max(1, Math.min(size.width, size.height) / 2 - 36);
  families.forEach((family, ring) => {
    const radius = maxRadius * (0.30 + ring * 0.135);
    context.strokeStyle = '#34453a'; context.lineWidth = 0.6;
    context.beginPath(); context.arc(size.width / 2, size.height / 2, radius, 0, Math.PI * 2); context.stroke();
    context.fillStyle = colors[ring]; context.font = '9px system-ui'; context.textAlign = 'center';
    context.fillText(family, size.width / 2, size.height / 2 - radius - 5);
  });
  const all = $('all-edges').checked, ids = strongestEdges(data.edges, all);
  context.globalAlpha = all ? 0.10 : 0.24;
  for (const i of ids) {
    const weight = data.edges.w[i];
    line(context, points[data.edges.pre[i]], points[data.edges.post[i]], weight >= 0 ? '#789b90' : '#ab7390', all ? 0.45 : 0.65);
  }
  context.globalAlpha = 1;
  const missing = points.filter(p => p.fallback).length;
  $('connection-note').textContent = `${ids.length.toLocaleString()} / ${data.edges.w.length.toLocaleString()} connections · ${all ? 'all edges' : 'strongest by absolute weight'} · ${missing} missing angles placed evenly on their family rings (◇).`;
  const from = $('wiring').value, to = $('compare').value;
  const diff = orientedDiff(state.diffs, from, to);
  if (!diff) $('show-diff').checked = false;
  $('show-diff').disabled = !diff;
  $('diff-legend').hidden = !($('show-diff').checked && diff);
  $('diff-note').hidden = !$('show-diff').checked;
  if ($('show-diff').checked && diff) {
    const other = state.data[state.current === from ? to : from];
    const strength = new Map();
    for (const d of [data, other]) for (let i = 0; i < d.edges.w.length; i++) {
      const key = `${d.edges.pre[i]}:${d.edges.post[i]}`;
      strength.set(key, Math.max(strength.get(key) || 0, Math.abs(d.edges.w[i])));
    }
    const overlay = [ ...diff.added.map(pair => ({pair, color: '#60e795', width: 1.1})),
      ...diff.removed.map(pair => ({pair, color: '#fa7272', width: 1.1})),
      ...diff.changed.map((pair, i) => ({pair, color: '#e6bb67', width: ratioWidth(diff.changed_ratio[i])})) ];
    if (!all) overlay.sort((a, b) => (strength.get(b.pair.join(':')) || 0) - (strength.get(a.pair.join(':')) || 0));
    const shown = all ? overlay : overlay.slice(0, 1200);
    context.globalAlpha = all ? 0.23 : 0.5;
    for (const item of shown) line(context, points[item.pair[0]], points[item.pair[1]], item.color, item.width);
    context.globalAlpha = 1;
    $('diff-note').textContent = `${state.data[from].name} → ${state.data[to].name}: ${diff.added.length.toLocaleString()} added, ${diff.removed.length.toLocaleString()} removed, ${diff.changed.length.toLocaleString()} changed (>1.5× in either direction). Showing ${shown.length.toLocaleString()} / ${overlay.length.toLocaleString()} diff edges. Width shows the magnitude of the log weight ratio for changed edges.`;
  }
  state.dirty = true;
}
function drawNetwork() {
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
      glow.addColorStop(0, `rgba(104,224,189,${0.75 * intensity})`); glow.addColorStop(1, 'rgba(104,224,189,0)');
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
}
function drawDial() {
  const {width, height} = dial.getBoundingClientRect();
  dialCtx.clearRect(0, 0, width, height);
  const center = {x: width / 2, y: height / 2}, radius = Math.min(width / 2 - 45, height / 2 - 25);
  dialCtx.strokeStyle = '#405247'; dialCtx.lineWidth = 1;
  dialCtx.beginPath(); dialCtx.arc(center.x, center.y, radius, 0, Math.PI * 2); dialCtx.stroke();
  for (let i = 0; i < 36; i++) {
    const angle = i * Math.PI / 18, major = i % 9 === 0;
    const point = r => ({x: center.x + Math.cos(angle) * r, y: center.y - Math.sin(angle) * r});
    line(dialCtx, point(radius - (major ? 8 : 4)), point(radius), '#50685a');
    if (major) { const p = point(radius + 14); dialCtx.fillStyle = '#9baea6'; dialCtx.font = '10px system-ui'; dialCtx.textAlign = 'center'; dialCtx.textBaseline = 'middle'; dialCtx.fillText(`${i === 27 ? -90 : i * 10}°`, p.x, p.y); }
  }
  const target = radians(+$('angle').value);
  const needle = (angle, color, length, dashed) => {
    dialCtx.setLineDash(dashed ? [5, 5] : []);
    line(dialCtx, center, {x: center.x + Math.cos(angle) * length, y: center.y - Math.sin(angle) * length}, color, 2.5);
    dialCtx.setLineDash([]);
  };
  needle(target, '#ffb378', radius - 11, state.frame && state.frame.t >= state.run.options.cueSteps);
  if (state.frame) needle(state.frame.heading, '#68e0bd', radius - 22, false);
  dialCtx.fillStyle = '#e9eee9'; dialCtx.beginPath(); dialCtx.arc(center.x, center.y, 3, 0, Math.PI * 2); dialCtx.fill();
}
function drawChart() {
  const {width, height} = chart.getBoundingClientRect();
  const left = 43, right = width - 24, top = 15, bottom = height - 32;
  const x = t => left + t / 39 * (right - left), y = error => bottom - error / 180 * (bottom - top);
  chartCtx.clearRect(0, 0, width, height);
  chartCtx.fillStyle = '#ffb3780c'; chartCtx.fillRect(left, top, x(state.run?.options.cueSteps === 40 ? 39 : 4.5) - left, bottom - top);
  chartCtx.font = '9px system-ui'; chartCtx.textBaseline = 'middle';
  for (const error of [0, 60, 120, 180]) {
    line(chartCtx, {x: left, y: y(error)}, {x: right, y: y(error)}, '#2d3d33', 0.6);
    chartCtx.fillStyle = '#9baea6'; chartCtx.textAlign = 'right'; chartCtx.fillText(`${error}°`, left - 9, y(error));
  }
  for (const t of [0, 5, 10, 20, 30, 39]) { chartCtx.textAlign = 'center'; chartCtx.fillText(t, x(t), bottom + 15); }
  chartCtx.strokeStyle = '#68e0bd'; chartCtx.lineWidth = 1.8; chartCtx.beginPath();
  state.trace.forEach((error, t) => t ? chartCtx.lineTo(x(t), y(error)) : chartCtx.moveTo(x(t), y(error)));
  chartCtx.stroke();
  if (state.trace.length) {
    chartCtx.fillStyle = '#68e0bd'; chartCtx.beginPath(); chartCtx.arc(x(state.trace.length - 1), y(state.trace.at(-1)), 3, 0, Math.PI * 2); chartCtx.fill();
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
}
function selection() {
  return {a:$('wiring').value, b:$('compare').value, mode:$('mode').value,
    network:$('model').value, refit:$('refit').checked, scalePercent:+$('scale').value,
    darkness:$('darkness').checked};
}
const benchmarks = new Map();
function restart() {
  if (!state.current) return;
  state.run = configureRun(state.data, state.maps, state.refits, selection());
  $('refit').disabled = !state.run.refitAvailable;
  if (!state.run.refitAvailable) $('refit').checked = false;
  $('refit-note').textContent = state.run.refitAvailable ? 'Cell-type gains fitted for this directed pair.' : 'Available for exported noise-trained transplant pairs only.';
  $('scale').disabled = $('model').value !== 'clean';
  if ($('scale').disabled) $('scale').value = '0';
  const baseline = state.reference.own[`${state.run.source}|clean`].error;
  $('scale-note').textContent = state.run.network === 'clean' ? `Unscaled own-wiring reference: ${baseline.toFixed(2)}° (16 headings).` : 'Switch to a clean network to explore the knife-edge.';
  $('scale-value').textContent = `${state.run.scalePercent > 0 ? '+' : ''}${state.run.scalePercent.toFixed(1)}%`;
  state.current = state.run.target;
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
  if (!benchmarks.has(key)) benchmarks.set(key, simulate(state.compiled[state.current], state.run.net, state.reference.theta, state.run.options).error);
  const benchmark = benchmarks.get(key), reference = referenceFor(state.run, state.reference, state.refits);
  $('benchmark-error').textContent = `${benchmark.toFixed(2)}°`;
  $('reference-error').textContent = reference ? `${reference.value.toFixed(2)}°` : 'Not available';
  $('reference-note').textContent = reference ? `${reference.source}. Same 16 headings and steps 5–39; difference ${Math.abs(benchmark-reference.value).toFixed(4)}°. The live run above uses one heading.` : 'No exported reference for these settings. Current settings are calculated over the same 16 headings and steps 5–39. The live run above uses one heading.';
  drawConnections(); updateNumbers(); drawChart();
}
function chooseWiring() {
  if (!state.current) state.current = $('wiring').value;
  restart();
}
function resize() {
  size = fit(canvas); fit(dial); fit(chart);
  if (state.current) state.points = layout(state.data[state.current].neurons, size.width, size.height);
  drawConnections(); drawDial(); drawChart(); state.dirty = true;
}
function animate(now) {
  if (state.running && state.simulation && (!state.lastStep || now - state.lastStep >= 100)) {
    state.frame = state.simulation.step(); state.lastStep = now;
    state.trace.push(Math.abs(degrees(wrapped(state.frame.heading - state.simulation.theta))));
    if (state.simulation.t >= 40) state.running = false;
    updateNumbers(); drawChart(); state.dirty = true;
  }
  let smoothing = false;
  if (state.frame) for (let i = 0; i < state.activity.length; i++) {
    const difference = Math.max(0, state.frame.activity[i]) - state.activity[i];
    state.activity[i] += difference * 0.3;
    if (Math.abs(difference) > 0.0001) smoothing = true;
  }
  if (state.dirty || smoothing) { drawNetwork(); drawDial(); state.dirty = false; }
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
function applyTour(index) {
  const steps = buildTour(state.reference,state.refits,state.diffs,tour.filtering);
  tour.index = Math.max(0,Math.min(steps.length-1,index));
  const step = steps[tour.index], settings = step.settings;
  for (const [id,value] of Object.entries({wiring:settings.a,compare:settings.b,mode:settings.mode,model:settings.network,angle:settings.angle,scale:settings.scalePercent})) $(id).value = value;
  for (const [id,value] of Object.entries({refit:settings.refit,darkness:settings.darkness,'show-diff':settings.diff,'all-edges':settings.allEdges})) $(id).checked = value;
  chooseWiring(); state.running = settings.playing; updateNumbers();
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
  if (state.simulation.t >= 40) restart(); else { state.running = !state.running; state.lastStep = 0; updateNumbers(); }
});
document.addEventListener('visibilitychange', () => { state.lastStep = 0; });
new ResizeObserver(resize).observe($('network').parentElement);
for (const [i, family] of families.entries()) {
  const item = document.createElement('span'), dot = document.createElement('i');
  dot.className = 'family-dot'; dot.style.background = colors[i]; item.append(dot, family); $('family-legend').append(item);
}
try {
  [state.index, state.diffs, state.maps, state.refits, state.reference] = await Promise.all(['index','diffs','maps','refits','reference'].map(fetchJSON));
  const data = await Promise.all(state.index.versions.map(fetchJSON));
  for (const d of data) { state.data[d.version] = d; state.compiled[d.version] = compileWiring(d); }
  for (const id of ['wiring','compare']) { $(id).replaceChildren(...state.index.versions.map(v => new Option(state.index.names[v], v))); $(id).disabled = false; }
  $('compare').value = 'fafb_buhmann';
  $('wiring').value = 'fafb'; $('wiring').disabled = false; $('play').disabled = false; $('reset').disabled = false;
  fit(dial); fit(chart); size = fit(canvas); chooseWiring();
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
  $('load-state').textContent = '● 7 wirings · local data'; requestAnimationFrame(animate);
} catch (error) { fail(error); }
