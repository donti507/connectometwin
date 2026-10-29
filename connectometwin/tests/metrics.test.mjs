import test from 'node:test';
import assert from 'node:assert/strict';
import {neuronMetrics,compareWirings} from '../web/js/metrics.mjs';
const neurons=[{id:'1',family:'EPG',type:'EPG'},{id:'2',family:'PEN_a',type:'PEN_a'},{id:'3',family:'ER',type:'ER'}];
const a={neurons,edges:{pre:[0,1,2],post:[1,0,0],w:[.5,-.25,.1]}};
const b={neurons:[neurons[2],neurons[0],neurons[1]],edges:{pre:[1,2,1],post:[2,1,0],w:[.75,-.2,.3]}};
test('partner metrics preserve direction, signs and family weight shares',()=>{
 const m=neuronMetrics(a,0);assert.equal(m.incoming,2);assert.equal(m.outgoing,1);assert.equal(m.incomingWeight,.35);assert.equal(m.outgoingWeight,.5);assert.equal(m.groups[1].strength,.75);assert.equal(m.groups[5].strength,.1);assert.equal(neuronMetrics(a,8),null);
});
test('comparison aligns graph identity by exact IDs, including reordered neurons',()=>{
 const m=compareWirings(a,b,true);assert.equal(m.net,0);assert.equal(m.overlap,.5);assert.equal(m.matrix[0][1],.25);assert.ok(Math.abs(m.matrix[1][0]-.05)<1e-12);assert.equal(m.matrix[5][0],-.1);assert.equal(m.matrix[0][5],.3);assert.equal(m.families[0].delta,1);assert.equal(m.families[5].delta,-1);
});
test('cross-fly comparisons never imply anatomical edge overlap',()=>{assert.equal(compareWirings(a,b,false).overlap,null);});
test('empty graphs have finite, zero aggregates and unavailable overlap',()=>{
 const empty={neurons,edges:{pre:[],post:[],w:[]}},m=compareWirings(empty,empty,true);assert.equal(m.overlap,null);assert.equal(m.net,0);assert.ok(m.matrix.flat().every(value=>value===0));assert.equal(neuronMetrics(empty,0).incoming,0);
});
