import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileWiring, Simulation, simulate, transplant, wrapped} from '../web/js/engine.mjs';
const load = async name => JSON.parse(await readFile(new URL(`../web/data/${name}.json`, import.meta.url)));
const reference = await load('reference'), index = await load('index'), maps = await load('maps');
const data = Object.fromEntries(await Promise.all(index.versions.map(async v => [v, await load(v)])));
const wiring = Object.fromEntries(index.versions.map(v => [v, compileWiring(data[v])]));
const near = (actual, expected, tolerance = 0.05) => {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected} (tolerance ${tolerance})`);
};
for (const [key, expected] of Object.entries(reference.own)) {
  test(`own ${key}`, () => {
    const [v, label] = key.split('|');
    const result = simulate(wiring[v], data[v].nets[label], reference.theta);
    near(result.error, expected.error);
    result.decoded.forEach((trace, i) => near(wrapped(trace[39] - expected.decoded_t39[i]), 0, 0.001));
  });
}
for (const [key, expected] of Object.entries(reference.scale)) {
  test(`scale ${key}`, () => {
    const [v, label, scale] = key.split('|');
    near(simulate(wiring[v], data[v].nets[label], reference.theta, {scale: +scale}).error, expected);
  });
}
for (const [key, expected] of Object.entries(reference.transplant)) {
  test(`transplant ${key}`, () => {
    const [pair, label] = key.split('|'), [src, tgt] = pair.split('__');
    const net = transplant(data[src].nets[label], maps[pair], data[tgt].neurons);
    near(simulate(wiring[tgt], net, reference.theta).error, expected);
  });
}
test('reset reproduces trajectory', () => {
  const simulation = new Simulation(wiring.fafb, data.fafb.nets.clean, {theta: 1});
  const first = Array.from({length: 40}, () => simulation.step().heading);
  simulation.reset();
  assert.deepEqual(Array.from({length: 40}, () => simulation.step().heading), first);
});
test('CSR groups unsorted presynaptic edges and preserves direction', () => {
  const tiny = compileWiring({neurons: [{family: 'ER'}, {family: 'EPG'}], edges: {pre: [1, 0], post: [0, 1], w: [3, 2]}});
  assert.deepEqual([...tiny.row], [0, 1, 2]);
  assert.deepEqual([...tiny.column], [1, 0]);
  const net = {g: [0, 0], Wc: [[0, 0], [0, 0], [1, 0]], bc: [0, 0], bv: [0, 0], R: [[0, 0], [1, 0]], r: [0, 0]};
  const simulation = new Simulation(tiny, net);
  assert.deepEqual([...simulation.step().activity], [0.75, 0.5]);
});
test('transplant maps every parameter and applies offsets by target type', () => {
  const net = {g: [1, 2], Wc: [[1, 2], [3, 4], [5, 6]], bc: [7, 8], bv: [9, 10], R: [[11, 12], [13, 14]], r: [15, 16]};
  const moved = transplant(net, [1, 0], [{type: 'A'}, {type: 'B'}], {types: ['B', 'A'], offset_per_type: [0.5, -0.5]});
  assert.deepEqual([...moved.g], [1.5, 1.5]);
  assert.deepEqual(moved.Wc.map(row => [...row]), [[2, 1], [4, 3], [6, 5]]);
  assert.deepEqual([...moved.bc], [8, 7]); assert.deepEqual([...moved.bv], [10, 9]);
  assert.deepEqual(moved.R.map(row => [...row]), [[13, 14], [11, 12]]);
  assert.deepEqual([...moved.r], [15, 16]);
  assert.deepEqual(net.g, [1, 2]);
});
const refits = await load('refits');
for (const [pair, refit] of Object.entries(refits)) {
  test(`exported refit ${pair}`, () => {
    const [src, tgt] = pair.split('__');
    assert.equal(refit.types.length, refit.offset_per_type.length);
    assert.ok(refit.offset_per_type.every(Number.isFinite));
    const zero = transplant(data[src].nets.noise, maps[pair], data[tgt].neurons);
    const fitted = transplant(data[src].nets.noise, maps[pair], data[tgt].neurons, refit);
    near(simulate(wiring[tgt], zero, reference.theta).error, refit.error_zero_shot);
    near(simulate(wiring[tgt], fitted, reference.theta).error, refit.error_after_refit);
  });
}
assert.equal(Object.keys(refits).length, 5, 'all five full refits must be exported');
