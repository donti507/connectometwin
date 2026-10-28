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

export function validateSkeleton(value,expectedId) {
  if(value.id!==expectedId) throw new Error('Anatomy ID does not match the circuit neuron');
  if(!Array.isArray(value.vertices) || !value.vertices.length || !Array.isArray(value.edges)) throw new Error('Missing skeleton geometry');
  if(value.vertices.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)))) throw new Error('Invalid anatomical coordinate');
  if(value.edges.some(edge=>!Array.isArray(edge)||edge.length!==2||edge.some(v=>!Number.isInteger(v)||v<0||v>=value.vertices.length)||edge[0]===edge[1])) throw new Error('Invalid anatomical edge');
  return value;
}

/** Match by exact string IDs; no nearest-angle or cross-fly geometry substitution. */
export function matchAnatomy(manifest,neurons) {
  const ids=new Set(neurons.map(n=>n.id));
  return (manifest.neurons||[]).filter(item=>ids.has(item.id)).map(item=>{
    if(!/^\d+$/.test(item.id)||item.file!==`${item.id}.json`) throw new Error('Unsafe anatomy file in manifest');
    return item;
  });
}

export function normalizeSkeletons(skeletons) {
  const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
  for(const s of skeletons) for(const p of s.vertices) for(let k=0;k<3;k++) {minimum[k]=Math.min(minimum[k],p[k]);maximum[k]=Math.max(maximum[k],p[k]);}
  if(!Number.isFinite(minimum[0])) throw new Error('No anatomical coordinates available');
  const center=minimum.map((v,k)=>(v+maximum[k])/2),scale=2.4/Math.max(1e-6,...maximum.map((v,k)=>v-minimum[k]));
  return {center,scale,transform:p=>p.map((v,k)=>(v-center[k])*scale)};
}
