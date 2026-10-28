import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWiringLoader} from '../web/js/data.mjs';
test('wiring loads only on demand, deduplicates concurrent loads and compiles once',async()=>{
  const calls=[],compiles=[];
  const load=createWiringLoader(async version=>{calls.push(version);return {version};},data=>{compiles.push(data.version);return data.version;});
  assert.deepEqual(calls,[]);
  const first=load('fafb');assert.equal(load('fafb'),first);
  assert.deepEqual(await first,{data:{version:'fafb'},compiled:'fafb'});
  await load('fafb');assert.deepEqual(calls,['fafb']);assert.deepEqual(compiles,['fafb']);
  await load('banc');assert.deepEqual(calls,['fafb','banc']);
});
test('failed wiring loads are retryable',async()=>{
  let attempts=0;const load=createWiringLoader(async()=>{if(++attempts===1)throw new Error('offline');return {ok:true};},x=>x);
  await assert.rejects(load('fafb'),/offline/);
  assert.deepEqual((await load('fafb')).data,{ok:true});assert.equal(attempts,2);
});
