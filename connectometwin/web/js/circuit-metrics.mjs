import {families,familyOf} from './view.mjs';
export function familyConnections(data){
 const matrix=Array.from({length:6},()=>Array.from({length:6},()=>({count:0,weight:0,magnitude:0}))),counts=Array(6).fill(0);
 for(const neuron of data.neurons)counts[families.indexOf(familyOf(neuron))]++;
 for(let k=0;k<data.edges.w.length;k++){const i=families.indexOf(familyOf(data.neurons[data.edges.pre[k]])),j=families.indexOf(familyOf(data.neurons[data.edges.post[k]])),cell=matrix[i][j],w=data.edges.w[k];cell.count++;cell.weight+=w;cell.magnitude+=Math.abs(w);}
 return {matrix,counts};
}
function solve(matrix,rhs){
 const a=matrix.map((row,i)=>[...row,rhs[i]]);
 for(let k=0;k<3;k++){let pivot=k;for(let i=k+1;i<3;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
  if(Math.abs(a[pivot][k])<1e-12)return null;[a[k],a[pivot]]=[a[pivot],a[k]];const v=a[k][k];for(let j=k;j<4;j++)a[k][j]/=v;
  for(let i=0;i<3;i++)if(i!==k){const f=a[i][k];for(let j=k;j<4;j++)a[i][j]-=f*a[k][j];}
 }return a.map(row=>row[3]);
}
/** A descriptive fit to actual exported weights, never an engine parameter. */
export function weightProfile(data,preFamily='EPG',postFamily='EPG',bins=16){
 const buckets=Array.from({length:bins},()=>({sum:0,count:0})),samples=[];let missing=0;
 const normal=Array.from({length:3},()=>Array(3).fill(0)),rhs=Array(3).fill(0);
 for(let k=0;k<data.edges.w.length;k++){
  const pre=data.neurons[data.edges.pre[k]],post=data.neurons[data.edges.post[k]];
  if(familyOf(pre)!==preFamily||familyOf(post)!==postFamily)continue;
  if(!Number.isFinite(pre.angle)||!Number.isFinite(post.angle)){missing++;continue;}
  const delta=Math.atan2(Math.sin(post.angle-pre.angle),Math.cos(post.angle-pre.angle)),w=data.edges.w[k],x=[1,Math.cos(delta),Math.sin(delta)],bin=Math.min(bins-1,Math.floor((delta+Math.PI)/(2*Math.PI)*bins));
  buckets[bin].sum+=w;buckets[bin].count++;samples.push({delta,w});
  for(let i=0;i<3;i++){rhs[i]+=x[i]*w;for(let j=0;j<3;j++)normal[i][j]+=x[i]*x[j];}
 }
 const coefficients=samples.length>=3?solve(normal,rhs):null;
 let r2=null;if(coefficients){const mean=samples.reduce((sum,p)=>sum+p.w,0)/samples.length;let total=0,error=0;for(const p of samples){total+=(p.w-mean)**2;error+=(p.w-(coefficients[0]+coefficients[1]*Math.cos(p.delta)+coefficients[2]*Math.sin(p.delta)))**2;}if(total>1e-18)r2=1-error/total;}
 return {bins:buckets.map((b,i)=>({angle:-Math.PI+(i+.5)*2*Math.PI/bins,mean:b.count?b.sum/b.count:null,count:b.count})),count:samples.length,missing,coefficients,r2};
}
