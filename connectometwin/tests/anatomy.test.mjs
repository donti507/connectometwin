import {test} from 'node:test';
import assert from 'node:assert/strict';
import {topologyPositions,validateSkeleton,matchAnatomy,normalizeSkeletons} from '../web/js/anatomy.mjs';
test('topology is finite with missing angles, preserves angle and never mutates neurons',()=>{
 const neurons=[{id:'1',family:'EPG',angle:0},{id:'2',family:'EPGt',angle:null},{id:'3',family:'ER',angle:null}];
 const before=JSON.stringify(neurons),points=topologyPositions(neurons);
 assert.equal(points.length,3);assert.ok(points.flat().every(Number.isFinite));assert.equal(points[0][1],0);assert.equal(JSON.stringify(neurons),before);
});
test('anatomy matches only exact string IDs, including IDs beyond JS integer precision',()=>{
 const id='720575940604801993';const manifest={neurons:[{id,file:id+'.json'},{id:'720575940604801994',file:'720575940604801994.json'}]};
 assert.deepEqual(matchAnatomy(manifest,[{id}]),[manifest.neurons[0]]);
 assert.deepEqual(matchAnatomy(manifest,[{id:'unrelated'}]),[]);
 assert.throws(()=>matchAnatomy({neurons:[{id,file:'../other.json'}]},[{id}]),/Unsafe/);
});
test('skeleton validation rejects mismatched IDs, non-finite coordinates and corrupt edges',()=>{
 const valid={id:'123',vertices:[[0,0,0],[1,2,3]],edges:[[0,1]]};
 assert.equal(validateSkeleton(valid,'123'),valid);
 assert.throws(()=>validateSkeleton(valid,'124'),/ID/);
 assert.throws(()=>validateSkeleton({...valid,vertices:[[NaN,0,0]]},'123'),/coordinate/);
 assert.throws(()=>validateSkeleton({...valid,edges:[[0,2]]},'123'),/edge/);
});
test('anatomical display transform uses one uniform scale and preserves relative placement',()=>{
 const skeletons=[{vertices:[[100,200,300],[110,220,330]]},{vertices:[[120,240,360]]}];
 const n=normalizeSkeletons(skeletons),a=n.transform(skeletons[0].vertices[0]),b=n.transform(skeletons[0].vertices[1]),c=n.transform(skeletons[1].vertices[0]);
 assert.ok(Math.abs((b[0]-a[0])/(c[0]-a[0])-.5)<1e-10);
 assert.deepEqual(n.center,[110,220,330]);assert.throws(()=>normalizeSkeletons([]),/No anatomical/);
});
