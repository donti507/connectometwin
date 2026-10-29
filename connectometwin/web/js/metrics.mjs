import {families,familyOf} from './view.mjs';

/** Counts are graph connections, not raw synapse-site counts. Weights are exported model units. */
export function neuronMetrics(data,index) {
  const neuron=data.neurons[index];
  if(!neuron)return null;
  const inputs=new Set(),outputs=new Set(),groups=new Map(families.map(f=>[f,{family:f,incoming:0,outgoing:0,strength:0}]));
  let incomingWeight=0,outgoingWeight=0;
  for(let k=0;k<data.edges.w.length;k++){
    const a=data.edges.pre[k],b=data.edges.post[k],w=data.edges.w[k];
    if(b===index){inputs.add(a);incomingWeight+=Math.abs(w);const group=groups.get(familyOf(data.neurons[a]));group.incoming++;group.strength+=Math.abs(w);}
    if(a===index){outputs.add(b);outgoingWeight+=Math.abs(w);const group=groups.get(familyOf(data.neurons[b]));group.outgoing++;group.strength+=Math.abs(w);}
  }
  return {neuron,incoming:inputs.size,outgoing:outputs.size,incomingWeight,outgoingWeight,groups:[...groups.values()]};
}
export function compareWirings(a,b,sameFly=false) {
  const aggregate=data=>{
    const matrix=Array.from({length:6},()=>Array(6).fill(0)),counts=Array(6).fill(0),keys=new Set();
    for(let k=0;k<data.edges.w.length;k++){
      const pre=data.edges.pre[k],post=data.edges.post[k],i=families.indexOf(familyOf(data.neurons[pre])),j=families.indexOf(familyOf(data.neurons[post]));
      matrix[i][j]+=data.edges.w[k];counts[i]++;
      if(sameFly)keys.add(`${data.neurons[pre].id}:${data.neurons[post].id}`);
    }
    return {matrix,counts,keys};
  };
  const x=aggregate(a),y=aggregate(b);
  let intersection=0;for(const key of x.keys)if(y.keys.has(key))intersection++;
  const union=x.keys.size+y.keys.size-intersection;
  return {matrix:y.matrix.map((row,i)=>row.map((v,j)=>v-x.matrix[i][j])),families:families.map((family,i)=>({family,a:x.counts[i],b:y.counts[i],delta:y.counts[i]-x.counts[i]})),edgesA:a.edges.w.length,edgesB:b.edges.w.length,net:b.edges.w.length-a.edges.w.length,overlap:sameFly&&union?intersection/union:null};
}
