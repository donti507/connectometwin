export const ns='http://www.w3.org/2000/svg';
export function svgNode(tag,attrs={},text){const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;}
export function linePlot(svg,points,{minX=0,maxX=360,fit=null,xLabel='Angle (degrees)',yLabel='Model units'}={}){
 svg.replaceChildren();const width=svg.viewBox.baseVal.width||700,height=svg.viewBox.baseVal.height||260,left=matchMedia('(max-width:760px)').matches?85:55,right=width-24,top=36,bottom=height-42;
 const valid=points.filter(p=>Number.isFinite(p.y)),fitPoints=fit?Array.from({length:101},(_,i)=>({x:minX+(maxX-minX)*i/100,y:fit((minX+(maxX-minX)*i/100)*Math.PI/180)})):[];
 const values=[0,...valid.map(p=>p.y),...fitPoints.map(p=>p.y)],low=Math.min(...values),high=Math.max(1e-9,...values),range=high-low||1;
 const x=v=>left+(v-minX)/(maxX-minX)*(right-left),y=v=>bottom-(v-low)/range*(bottom-top);
 for(let i=0;i<4;i++){const value=low+range*i/3,yy=y(value);svg.append(svgNode('line',{x1:left,y1:yy,x2:right,y2:yy,class:'plot-grid'}),svgNode('text',{x:left-8,y:yy+4,'text-anchor':'end',class:'plot-label'},value.toFixed(3)));}
 for(let i=0;i<5;i++){const value=minX+(maxX-minX)*i/4;svg.append(svgNode('text',{x:x(value),y:bottom+20,'text-anchor':'middle',class:'plot-label'},`${Math.round(value)}°`));}
 svg.append(svgNode('text',{x:left,y:18,class:'plot-label'},yLabel),svgNode('text',{x:width-20,y:height-7,'text-anchor':'end',class:'plot-label'},xLabel));
 const path=pts=>{let d='',last=false;for(const point of pts){if(!Number.isFinite(point.y)){last=false;continue;}d+=`${last?'L':'M'}${x(point.x)},${y(point.y)} `;last=true;}return d;};
 if(fitPoints.length)svg.append(svgNode('path',{d:path(fitPoints),class:'fit-line'}));
 svg.append(svgNode('path',{d:path(points),class:'profile-line'}));
 for(const point of valid){const dot=svgNode('circle',{cx:x(point.x),cy:y(point.y),r:3,class:'profile-dot'});dot.append(svgNode('title',{},`${point.x.toFixed(1)}°: ${point.y.toFixed(6)}${point.count!==undefined?` (${point.count} edges)`:''}`));svg.append(dot);}
 if(!valid.length)svg.append(svgNode('text',{x:width/2,y:height/2,'text-anchor':'middle',class:'plot-label'},'No known-angle measurements for these settings.'));
}
