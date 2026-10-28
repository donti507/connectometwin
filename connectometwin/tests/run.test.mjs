import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileWiring, simulate, Simulation} from '../web/js/engine.mjs';
import {configureRun, referenceFor} from '../web/js/run.mjs';
const load = async name => JSON.parse(await readFile(new URL(`../web/data/${name}.json`,import.meta.url)));
const [index,maps,refits,reference] = await Promise.all(['index','maps','refits','reference'].map(load));
const data = Object.fromEntries(await Promise.all(index.versions.map(async v=>[v,await load(v)])));
const wiring = Object.fromEntries(index.versions.map(v=>[v,compileWiring(data[v])]));
const config = options => configureRun(data,maps,refits,{a:'fafb',b:'fafb_buhmann',mode:'own',network:'noise',darkness:true,scalePercent:0,...options});
function check(run, expected) {
  const actual = simulate(wiring[run.target],run.net,reference.theta,run.options).error;
  assert.ok(Math.abs(actual-expected)<0.05,`${actual} vs ${expected}`);
  assert.equal(referenceFor(run,reference,refits).value,expected);
}
for (const [key,entry] of Object.entries(reference.own)) test(`own controls ${key}`,()=>{
  const [a,network]=key.split('|'); check(config({a,network}),entry.error);
});
for (const [key,expected] of Object.entries(reference.transplant)) test(`transplant controls ${key}`,()=>{
  const [pair,network]=key.split('|'),[a,b]=pair.split('__');check(config({a,b,network,mode:'transplant'}),expected);
});
for (const [key,expected] of Object.entries(reference.scale)) test(`scale controls ${key}`,()=>{
  const [a,network,scale]=key.split('|');check(config({a,network,scalePercent:(+scale-1)*100}),expected);
});
for (const [pair,entry] of Object.entries(refits)) test(`refit controls ${pair}`,()=>{
  const [a,b]=pair.split('__'); const run=config({a,b,mode:'transplant',refit:true});
  assert.equal(run.refit,true);check(run,entry.error_after_refit);
  const zero=config({a,b,mode:'transplant',refit:false});
  const error=simulate(wiring[b],zero.net,reference.theta,zero.options).error;
  assert.ok(Math.abs(error-entry.error_zero_shot)<0.05);
});
test('all 49 directed wiring choices can transplant, including identity maps',()=>{
  for (const a of index.versions) for (const b of index.versions) {
    const run=config({a,b,mode:'transplant'});
    const frame=new Simulation(wiring[b],run.net,run.options).step();
    assert.equal(frame.activity.length,data[b].neurons.length); assert.ok(Number.isFinite(frame.heading));
  }
});
test('refit and scaling never leak into unsupported modes',()=>{
  for (const options of [{mode:'own'},{mode:'transplant',network:'clean'},{mode:'transplant',b:'banc'}]) {
    const run=config({...options,refit:true});assert.equal(run.refitAvailable,false);assert.equal(run.refit,false);
  }
  assert.equal(config({network:'noise',scalePercent:2}).options.scale,1);
  assert.equal(config({mode:'transplant',a:'fafb',b:'fafb',network:'clean'}).net.g.length,data.fafb.neurons.length);
});
test('continuous cue removes reference claim and agrees with own wiring until cue withdrawal',()=>{
  const dark=config(),light=config({darkness:false});
  assert.equal(light.options.cueSteps,40);assert.equal(referenceFor(light,reference,refits),null);
  const a=new Simulation(wiring.fafb,dark.net,{...dark.options,theta:1});
  const b=new Simulation(wiring.fafb,light.net,{...light.options,theta:1});
  for(let t=0;t<5;t++) assert.deepEqual(a.step(),b.step());
  assert.notDeepEqual([...a.step().activity],[...b.step().activity]);
});
test('unexported scaled transplants and slider midpoints have no fabricated reference',()=>{
  assert.equal(referenceFor(config({network:'clean',scalePercent:0.1}),reference,refits),null);
  assert.equal(referenceFor(config({mode:'transplant',network:'clean',scalePercent:1}),reference,refits),null);
});
