import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layout, strongestEdges, orientedDiff, ratioWidth} from '../web/js/view.mjs';
test('layout preserves angles and groups EPGt with EPG; missing angles stay finite', () => {
  const points = layout([{family:'EPG',angle:0},{family:'EPGt',angle:Math.PI / 2},{family:'ER',angle:null},{family:'ER',angle:NaN},{family:'ER'}], 600, 600);
  assert.equal(points[0].y, 300); assert.equal(points[1].x, 300);
  assert.equal(points[1].family, 'EPG');
  assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.ok(points.slice(2).every(p => p.fallback));
  assert.equal(new Set(points.slice(2).map(p => `${p.x}:${p.y}`)).size, 3);
});
test('strongest edges use absolute weights without changing input', () => {
  const e = {w: [0.1, -5, 2, -0.5]};
  assert.deepEqual(strongestEdges(e, false, 2), [1, 2]);
  assert.deepEqual(strongestEdges(e, true), [0, 1, 2, 3]);
  assert.deepEqual(e.w, [0.1, -5, 2, -0.5]);
});
test('reversed diff swaps added/removed and inverts ratios', () => {
  const diff = {added:[[0,1]], removed:[[1,2]], changed:[[2,0]], changed_ratio:[4]};
  const reverse = orientedDiff({a__b:diff}, 'b', 'a');
  assert.deepEqual(reverse.added,diff.removed); assert.deepEqual(reverse.removed,diff.added);
  assert.deepEqual(reverse.changed_ratio,[0.25]); assert.deepEqual(diff.changed_ratio,[4]);
  assert.equal(orientedDiff({a__b:diff},'a','c'),null);
  assert.equal(ratioWidth(4),ratioWidth(0.25)); assert.ok(ratioWidth(4)>ratioWidth(1.5));
});
