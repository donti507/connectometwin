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

test('packed geometry validates counts, units, ranges and corrupt headers',async()=>{
 const {decodeSkeletonBundle,vertexCount,edgeCount,vertexAt}=await import('../web/js/anatomy.mjs');
 const buffer=new ArrayBuffer(48),view=new DataView(buffer);
 new Uint8Array(buffer,0,8).set(new TextEncoder().encode('CTSK0001'));
 view.setUint32(8,2,true);view.setUint32(12,1,true);
 [1,2,3,4,5,6].forEach((v,i)=>view.setFloat32(16+i*4,v,true));view.setUint32(40,0,true);view.setUint32(44,1,true);
 const entries=[{id:'123',offset:8,bytes:40,vertices:2,edges:1}];
 const value=decodeSkeletonBundle(buffer,entries).get('123');
 assert.equal(vertexCount(value),2);assert.equal(edgeCount(value),1);assert.deepEqual([...vertexAt(value,1)],[4,5,6]);
 assert.throws(()=>decodeSkeletonBundle(buffer.slice(0,25),entries),/range/);
 assert.throws(()=>decodeSkeletonBundle(new ArrayBuffer(48),entries),/header/);
 assert.throws(()=>decodeSkeletonBundle(buffer,[{...entries[0],vertices:3}]),/counts/);
});

test('published anatomy covers exactly the complete FlyWire circuit and its variants',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {createHash}=await import('node:crypto');
 const {decodeSkeletonBundle,vertexCount,edgeCount}=await import('../web/js/anatomy.mjs');
 const load=async name=>JSON.parse(await readFile(new URL(`../web/data/${name}.json`,import.meta.url)));
 const manifest=await load('anatomy/manifest'),buffer=await readFile(new URL('../web/data/anatomy/flywire-783.ctsk',import.meta.url));
 assert.equal(manifest.status,'ready');assert.equal(manifest.coordinate_units,'micrometers');assert.equal(manifest.license,'CC-BY-4.0');
 assert.equal(buffer.byteLength,manifest.bundle.bytes);assert.equal(createHash('sha256').update(buffer).digest('hex'),manifest.bundle.sha256);
 const decoded=decodeSkeletonBundle(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),manifest.neurons);
 let vertices=0,edges=0;
 for(const skeleton of decoded.values()){
  vertices+=vertexCount(skeleton);edges+=edgeCount(skeleton);
  assert.equal(edgeCount(skeleton),vertexCount(skeleton)-1,'Each source skeleton remains a tree');
  const parent=Uint32Array.from({length:vertexCount(skeleton)},(_,i)=>i);
  const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let i=0;i<skeleton.edges.length;i+=2){const a=root(skeleton.edges[i]),b=root(skeleton.edges[i+1]);assert.notEqual(a,b,'No invented cycles');parent[a]=b;}
  for(const coordinate of skeleton.vertices)assert.ok(coordinate>=0&&coordinate<1000,'Coordinates are micrometers, not nanometers');
 }
 assert.equal(vertices,manifest.display_vertices);assert.equal(edges,manifest.display_edges);assert.equal(decoded.size,433);
 for(const version of ['fafb','fafb_buhmann','fafb_unfiltered']){
  const model=await load(version);assert.deepEqual(new Set(decoded.keys()),new Set(model.neurons.map(n=>n.id)));
 }
 for(const version of ['mcns','hemibrain','banc'])assert.equal(matchAnatomy(manifest,(await load(version)).neurons).length,0);
});

test('fast overview has every neuron, genuine source coordinates and its own verified bundle',async()=>{
 const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
 const {decodeSkeletonBundle,vertexCount,edgeCount,vertexAt}=await import('../web/js/anatomy.mjs');
 const manifest=JSON.parse(await readFile(new URL('../web/data/anatomy/manifest.json',import.meta.url)));
 const full=await readFile(new URL('../web/data/anatomy/'+manifest.bundle.file,import.meta.url));
 const overview=manifest.levels.overview,buffer=await readFile(new URL('../web/data/anatomy/'+overview.bundle.file,import.meta.url));
 assert.equal(createHash('sha256').update(buffer).digest('hex'),overview.bundle.sha256);
 const array=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
 const original=decodeSkeletonBundle(array(full),manifest.neurons),reduced=decodeSkeletonBundle(array(buffer),overview.neurons);
 assert.deepEqual(new Set(reduced.keys()),new Set(original.keys()));let segments=0;
 for(const [id,skeleton] of reduced){
  assert.equal(edgeCount(skeleton),vertexCount(skeleton)-1);segments+=edgeCount(skeleton);
  const source=original.get(id),coordinates=new Set();
  for(let i=0;i<vertexCount(source);i++)coordinates.add([...vertexAt(source,i)].join(','));
  for(let i=0;i<vertexCount(skeleton);i++)assert.ok(coordinates.has([...vertexAt(skeleton,i)].join(',')),'Overview must use genuine retained source points');
 }
 assert.equal(segments,overview.display_edges);assert.ok(segments<manifest.display_edges);
});
