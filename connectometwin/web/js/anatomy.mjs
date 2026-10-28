import {families,familyOf} from './view.mjs';

/** Deliberately a graph layout, never a claim about anatomical coordinates. */
export function topologyPositions(neurons) {
  const missing=new Map(families.map(f=>[f,neurons.filter(n=>familyOf(n)===f && !Number.isFinite(n.angle))]));
  return neurons.map(neuron=>{
    const family=familyOf(neuron),ring=families.indexOf(family),group=missing.get(family);
    const angle=Number.isFinite(neuron.angle)?neuron.angle:2*Math.PI*group.indexOf(neuron)/group.length;
    const radius=.50+ring*.13;
    return [Math.cos(angle)*radius,Math.sin(angle)*radius,(ring-2.5)*.18];
  });
}

export const vertexCount = value => value.packed ? value.vertices.length/3 : value.vertices.length;
export const edgeCount = value => value.packed ? value.edges.length/2 : value.edges.length;
export const vertexAt = (value,index) => value.packed ? value.vertices.subarray(index*3,index*3+3) : value.vertices[index];
export const edgeAt = (value,index) => value.packed ? value.edges.subarray(index*2,index*2+2) : value.edges[index];

export function validateSkeleton(value,expectedId) {
  if(value.id!==expectedId) throw new Error('Anatomy ID does not match the circuit neuron');
  if(value.packed){
    if(!(value.vertices instanceof Float32Array)||value.vertices.length%3||!value.vertices.length||!(value.edges instanceof Uint32Array)||value.edges.length%2)throw new Error('Invalid packed skeleton geometry');
    for(const coordinate of value.vertices)if(!Number.isFinite(coordinate))throw new Error('Invalid anatomical coordinate');
    for(let k=0;k<value.edges.length;k+=2)if(value.edges[k]>=vertexCount(value)||value.edges[k+1]>=vertexCount(value)||value.edges[k]===value.edges[k+1])throw new Error('Invalid anatomical edge');
  }else{
    if(!Array.isArray(value.vertices) || !value.vertices.length || !Array.isArray(value.edges)) throw new Error('Missing skeleton geometry');
    if(value.vertices.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)))) throw new Error('Invalid anatomical coordinate');
    if(value.edges.some(edge=>!Array.isArray(edge)||edge.length!==2||edge.some(v=>!Number.isInteger(v)||v<0||v>=value.vertices.length)||edge[0]===edge[1])) throw new Error('Invalid anatomical edge');
  }
  return value;
}

export function decodeSkeletonBundle(buffer,entries){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<8||new TextDecoder().decode(new Uint8Array(buffer,0,8))!=='CTSK0001')throw new Error('Invalid anatomical bundle header');
  if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1)throw new Error('Unsupported byte order');
  const view=new DataView(buffer),result=new Map(),ranges=[];
  for(const item of entries){
    if(!Number.isSafeInteger(item.offset)||item.offset<8||item.offset%4||!Number.isSafeInteger(item.bytes)||item.bytes<8||item.offset+item.bytes>buffer.byteLength)throw new Error('Invalid anatomical bundle range');
    const n=view.getUint32(item.offset,true),m=view.getUint32(item.offset+4,true);
    if(!n||n!==item.vertices||m!==item.edges||8+n*12+m*8!==item.bytes||result.has(item.id))throw new Error('Anatomical bundle counts do not match the manifest');
    const value={id:item.id,packed:true,vertices:new Float32Array(buffer,item.offset+8,n*3),edges:new Uint32Array(buffer,item.offset+8+n*12,m*2)};
    result.set(item.id,validateSkeleton(value,item.id));ranges.push([item.offset,item.offset+item.bytes]);
  }
  ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)if(ranges[i][0]<ranges[i-1][1])throw new Error('Overlapping anatomical bundle ranges');
  return result;
}

/** Match by exact string IDs; no nearest-angle or cross-fly geometry substitution. */
export function matchAnatomy(manifest,neurons) {
  const ids=new Set(neurons.map(n=>n.id));
  return (manifest.neurons||[]).filter(item=>ids.has(item.id)).map(item=>{
    const packed=manifest.bundle?.format==='ct-skeletons-v1'&&/^flywire-783(?:-overview)?\.ctsk$/.test(manifest.bundle.file)&&Number.isSafeInteger(item.offset)&&Number.isSafeInteger(item.bytes);
    if(!/^\d+$/.test(item.id)||(!packed&&item.file!==`${item.id}.json`)) throw new Error('Unsafe anatomy file in manifest');
    return item;
  });
}

export function normalizeSkeletons(skeletons) {
  const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
  for(const s of skeletons)for(let i=0;i<vertexCount(s);i++){const p=vertexAt(s,i);for(let k=0;k<3;k++){minimum[k]=Math.min(minimum[k],p[k]);maximum[k]=Math.max(maximum[k],p[k]);}}
  if(!Number.isFinite(minimum[0])) throw new Error('No anatomical coordinates available');
  const center=minimum.map((v,k)=>(v+maximum[k])/2),scale=2.4/Math.max(1e-6,...maximum.map((v,k)=>v-minimum[k]));
  return {center,scale,size:maximum.map((v,k)=>(v-minimum[k])*scale),transform:p=>p.map((v,k)=>(v-center[k])*scale)};
}
