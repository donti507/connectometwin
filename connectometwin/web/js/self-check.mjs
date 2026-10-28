import {compileWiring, simulate, transplant, wrapped} from './engine.mjs';
const status = document.getElementById('status'), results = document.getElementById('results'), run = document.getElementById('run');
const load = async name => {
  const response = await fetch(`data/${name}.json`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
};
run.addEventListener('click', async () => {
  run.disabled = true; status.textContent = 'Running…'; results.textContent = '';
  let passed = 0, failed = 0;
  try {
    const [reference, index, maps] = await Promise.all(['reference', 'index', 'maps'].map(load));
    const data = Object.fromEntries(await Promise.all(index.versions.map(async v => [v, await load(v)])));
    const wiring = Object.fromEntries(index.versions.map(v => [v, compileWiring(data[v])]));
    const cases = [
      ...Object.entries(reference.own).map(([key, expected]) => ({name: `own ${key}`, expected: expected.error, headings: expected.decoded_t39, calculate: () => { const [v, label] = key.split('|'); return simulate(wiring[v], data[v].nets[label], reference.theta); }})),
      ...Object.entries(reference.scale).map(([key, expected]) => ({name: `scale ${key}`, expected, calculate: () => { const [v, label, scale] = key.split('|'); return simulate(wiring[v], data[v].nets[label], reference.theta, {scale: +scale}); }})),
      ...Object.entries(reference.transplant).map(([key, expected]) => ({name: `transplant ${key}`, expected, calculate: () => { const [pair, label] = key.split('|'), [s, t] = pair.split('__'); return simulate(wiring[t], transplant(data[s].nets[label], maps[pair], data[t].neurons), reference.theta); }})),
    ];
    if (cases.length !== 46) throw new Error(`Expected 46 reference cases, found ${cases.length}`);
    for (const check of cases) {
      await new Promise(resolve => setTimeout(resolve, 0));
      const actual = check.calculate();
      const difference = Math.abs(actual.error - check.expected);
      const headingsOK = !check.headings || actual.decoded.every((trace, i) => Math.abs(wrapped(trace[39] - check.headings[i])) <= 0.001);
      const ok = Number.isFinite(actual.error) && difference <= 0.05 && headingsOK;
      if (ok) passed++; else failed++;
      results.textContent += `${ok ? 'PASS' : 'FAIL'} ${check.name}: ${actual.error.toFixed(5)}° (expected ${check.expected}°)\n`;
      status.textContent = `${passed} passed · ${failed} failed · ${cases.length - passed - failed} remaining`;
    }
    status.textContent = `${failed ? 'FAIL' : 'PASS'}: ${passed}/46 reference cases passed; ${failed} failed.`;
    document.body.dataset.result = failed ? 'fail' : 'pass';
  } catch (error) {
    status.textContent = `FAIL: ${error.message}`; document.body.dataset.result = 'fail';
  } finally { run.disabled = false; }
});
