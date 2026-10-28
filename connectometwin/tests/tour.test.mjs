import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildTour,study} from '../web/js/tour.mjs';
import {configureRun,referenceFor} from '../web/js/run.mjs';
import {compileWiring,simulate} from '../web/js/engine.mjs';
const load=async name=>JSON.parse(await readFile(new URL(`../web/data/${name}.json`,import.meta.url)));
const [reference,refits,diffs,maps,index]=await Promise.all(['reference','refits','diffs','maps','index'].map(load));
const data=Object.fromEntries(await Promise.all(index.versions.map(async v=>[v,await load(v)])));
const steps=buildTour(reference,refits,diffs);
test('five stable steps reset all controls and use one network for own/transplant/refit',()=>{
  assert.equal(steps.length,5);
  for (const step of steps) {
    assert.equal(step.settings.scalePercent,0);assert.equal(step.settings.darkness,true);
    assert.equal(step.settings.network,'noise');assert.equal(step.settings.a,'fafb');assert.equal(step.settings.b,'fafb_buhmann');
    assert.equal(step.settings.angle,45);assert.equal(step.settings.allEdges,false);
  }
  assert.equal(steps[0].settings.playing,false);
  assert.equal(steps[1].settings.diff,true);assert.equal(steps[1].settings.playing,false);
  assert.equal(steps[2].settings.mode,'own');assert.equal(steps[2].settings.playing,true);
  assert.equal(steps[3].settings.mode,'transplant');assert.equal(steps[3].settings.refit,false);
  assert.equal(steps[4].settings.refit,true);
});
test('captions derive counts and errors from exported data, without calling 19 gains 30',()=>{
  assert.match(steps[1].caption,/3,470 added, 1,759 removed and 5,560 changed/);
  assert.match(steps[2].caption,/8.32°/);assert.match(steps[3].caption,/85.47°/);
  assert.match(steps[4].caption,/about 30/);assert.match(steps[4].caption,/has 19/);assert.match(steps[4].caption,/15.92°/);
  assert.notEqual(study.detector,reference.transplant['fafb__fafb_buhmann|noise']);
});
for (const index of [2,3,4]) test(`tour step ${index+1} reproduces displayed benchmark`,()=>{
  const run=configureRun(data,maps,refits,steps[index].settings);
  const actual=simulate(compileWiring(data[run.target]),run.net,reference.theta,run.options).error;
  assert.ok(Math.abs(actual-referenceFor(run,reference,refits).value)<0.05);
});
test('filtering example stays within step five and uses the supported 32-gain pair',()=>{
  const alternative=buildTour(reference,refits,diffs,true);
  assert.equal(alternative.length,5);assert.deepEqual(alternative.slice(0,4),steps.slice(0,4));
  const step=alternative[4];assert.equal(step.settings.a,'mcns');assert.equal(step.settings.b,'mcns_neuprint');
  assert.match(step.caption,/32 cell-type gains/);assert.match(step.caption,/20.94° to 5.56°/);
  const run=configureRun(data,maps,refits,step.settings);
  assert.equal(run.refit,true);
  const actual=simulate(compileWiring(data[run.target]),run.net,reference.theta,run.options).error;
  assert.ok(Math.abs(actual-refits.mcns__mcns_neuprint.error_after_refit)<0.05);
  assert.ok(actual<reference.own['mcns|noise'].error);
});
