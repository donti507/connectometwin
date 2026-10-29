const tau=2*Math.PI;
export const angularBin=(angle,count=16)=>Math.floor(((angle%tau+tau)%tau)/tau*count)%count;
export function activityProfile(neurons,activity,count=16){
 const sums=Array(count).fill(0),counts=Array(count).fill(0);let missing=0;
 neurons.forEach((n,i)=>{if(!n.family.startsWith('EPG'))return;if(!Number.isFinite(n.angle)){missing++;return;}const k=angularBin(n.angle,count);counts[k]++;sums[k]+=Math.max(0,activity?.[i]||0);});
 const values=sums.map((sum,i)=>counts[i]?sum/counts[i]:null),peak=Math.max(0,...values.filter(Number.isFinite)),peakBin=peak?values.indexOf(peak):null;
 let width=null;
 if(peak&&counts.every(Boolean)){
  const half=peak/2;
  const crossing=direction=>{for(let step=1;step<=count;step++){const previous=values[(peakBin+direction*(step-1)+count*2)%count],next=values[(peakBin+direction*step+count*2)%count];if(next<half)return step-1+(previous-half)/(previous-next);}return count/2;};
  width=Math.min(360,(crossing(1)+crossing(-1))*360/count);
 }
 return {values,counts,peak,peakBin,width,missing};
}
