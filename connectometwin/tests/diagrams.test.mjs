import test from 'node:test';
import assert from 'node:assert/strict';
import {angularBin,activityProfile} from '../web/js/projection-metrics.mjs';
import {familyConnections,weightProfile} from '../web/js/circuit-metrics.mjs';
test('angular bins wrap positive and negative headings consistently',()=>{assert.equal(angularBin(0),0);assert.equal(angularBin(2*Math.PI),0);assert.equal(angularBin(-Math.PI/2),12);assert.equal(angularBin(Math.PI),8);});
test('EPG profile excludes missing angles and all other cell families',()=>{
 const p=activityProfile([{family:'EPG',angle:0},{family:'EPGt',angle:0},{family:'EPG',angle:null},{family:'ER',angle:0}],[2,-4,50,100]);assert.equal(p.values[0],1);assert.equal(p.counts[0],2);assert.equal(p.missing,1);assert.equal(p.peak,1);assert.equal(p.width,null);
});
test('FWHM interpolates both sides of a periodic bump, including wraparound',()=>{
 const neurons=Array.from({length:16},(_,i)=>({family:'EPG',angle:(i+.5)*Math.PI/8}));
 const values=Array(16).fill(0);values[0]=1;values[1]=.5;values[15]=.5;
 const p=activityProfile(neurons,values);assert.equal(p.peakBin,0);assert.ok(Math.abs(p.width-45)<1e-9);
 const flat=activityProfile(neurons,Array(16).fill(1));assert.equal(flat.width,360);
 const zero=activityProfile(neurons,Array(16).fill(0));assert.equal(zero.width,null);assert.equal(zero.peakBin,null);
});
test('family graph preserves directed counts, signed weights and absolute magnitudes',()=>{
 const data={neurons:[{family:'EPG'},{family:'ER'}],edges:{pre:[0,0,1],post:[0,1,0],w:[.2,-.3,.4]}};
 const p=familyConnections(data);assert.equal(p.matrix[0][5].weight,-.3);assert.equal(p.matrix[0][5].magnitude,.3);assert.equal(p.matrix[5][0].count,1);assert.equal(p.counts[0],1);assert.equal(p.counts[5],1);
});
test('descriptive harmonic regression recovers a known signed profile',()=>{
 const neurons=[{family:'EPG',angle:0},...Array.from({length:16},(_,i)=>({family:'EPG',angle:i*Math.PI/8}))];
 const w=neurons.slice(1).map(n=>.1+.3*Math.cos(n.angle)-.2*Math.sin(n.angle));
 const p=weightProfile({neurons,edges:{pre:w.map(()=>0),post:w.map((_,i)=>i+1),w}});
 assert.equal(p.count,16);for(const [i,v] of [.1,.3,-.2].entries())assert.ok(Math.abs(p.coefficients[i]-v)<1e-12);assert.ok(Math.abs(p.r2-1)<1e-12);assert.equal(p.bins.reduce((n,b)=>n+b.count,0),16);
});
test('missing angles and rank-deficient fits stay explicitly unavailable',()=>{
 const neurons=[{family:'ER',angle:null},{family:'EPG',angle:0}];
 const p=weightProfile({neurons,edges:{pre:[0],post:[1],w:[1]}},'ER','EPG');assert.equal(p.count,0);assert.equal(p.missing,1);assert.equal(p.coefficients,null);assert.equal(p.r2,null);
 const q=weightProfile({neurons:[{family:'EPG',angle:0}],edges:{pre:[0,0,0],post:[0,0,0],w:[1,2,3]}});assert.equal(q.coefficients,null);assert.equal(q.r2,null);
});
