import {$} from './elements.mjs';
import {explorerSnapshot} from './app.mjs';
import {activityProfile} from './projection-metrics.mjs';
import {text,updateShell} from './page-shell.mjs';
import {svgNode,linePlot} from './svg.mjs';
const atlas=$('orthogonal-atlas');
const point=(angle,radius=110)=>[350+Math.cos(angle)*radius,360-Math.sin(angle)*radius];
let plane='atlas',view=null,revision=0,lastVersion='';
function drawAtlas(s,profile){
 atlas.replaceChildren();
 const defs=svgNode('defs'),gradient=svgNode('linearGradient',{id:'atlas-spectrum',x1:'0%',x2:'100%'});
 for(const [offset,color] of [[0,'#38bdf8'],[.5,'#44e2cd'],[1,'#e1bfff']])gradient.append(svgNode('stop',{offset:offset*100+'%','stop-color':color}));defs.append(gradient);atlas.append(defs);
 atlas.append(svgNode('text',{x:350,y:34,'text-anchor':'middle',class:'atlas-label'},'PROTOCEREBRAL BRIDGE · SCHEMATIC PB'),svgNode('path',{d:'M130 111 Q350 15 570 111',stroke:'#303a49','stroke-width':18,'stroke-linecap':'round',fill:'none'}),svgNode('path',{d:'M130 111 Q350 15 570 111',stroke:'url(#atlas-spectrum)','stroke-width':3,fill:'none'}));
 for(let i=0;i<18;i++){
  const t=i/17,x=130+440*t,y=111-150*t*(1-t),hue=195+85*t;
  atlas.append(svgNode('line',{x1:x,y1:y+6,x2:350+(t-.5)*80,y2:292,stroke:'#38bdf8','stroke-opacity':.24,'stroke-dasharray':'2 5'}),svgNode('circle',{cx:x,cy:y,r:4,fill:`hsl(${hue} 86% 73%)`}));
 }
 atlas.append(svgNode('path',{d:'M205 180 Q350 152 495 180 L475 218 Q350 193 225 218 Z',fill:'#1c2331',stroke:'#3e4855'}),svgNode('text',{x:350,y:181,'text-anchor':'middle',class:'atlas-label'},'FAN-SHAPED BODY · FB'),svgNode('text',{x:350,y:247,'text-anchor':'middle',class:'atlas-label'},'ELLIPSOID BODY · EB'));
 for(let i=0;i<16;i++){
  const a=i*Math.PI/8,b=(i+1)*Math.PI/8,p=point(a),q=point(b),r=point(b,69),u=point(a,69),level=profile.peak?(profile.values[i]||0)/profile.peak:0;
  const path=svgNode('path',{d:`M${p} A110 110 0 0 0 ${q} L${r} A69 69 0 0 1 ${u} Z`,fill:level?`rgba(68,226,205,${.12+.86*level})`:'#1c2331',stroke:'#3a4452','stroke-width':1});
  path.append(svgNode('title',{},`Angular bin ${i+1}: ${profile.values[i]===null?'no known-angle neurons':profile.values[i].toFixed(6)+' model activity'}`));atlas.append(path);
 }
 atlas.append(svgNode('circle',{cx:350,cy:360,r:67,fill:'#0f131c',stroke:'#59677b'}));
 for(const [angle,label] of [[0,'0°'],[Math.PI/2,'90°'],[Math.PI,'180°'],[3*Math.PI/2,'270°']]){const p=point(angle,138);atlas.append(svgNode('text',{x:p[0],y:p[1]+4,'text-anchor':'middle',class:'atlas-label'},label));}
 const needle=(angle,color,radius,dashed=false)=>{const p=point(angle,radius);atlas.append(svgNode('line',{x1:350,y1:360,x2:p[0],y2:p[1],stroke:color,'stroke-width':2,'stroke-dasharray':dashed?'4 4':''}));};
 needle(Number($('angle').value)*Math.PI/180,'#ffb4a8',97,true);
 if(s.frame)needle(s.frame.heading,'#44e2cd',102);
 atlas.append(svgNode('circle',{cx:350,cy:360,r:5,fill:'#dfe2ef'}),svgNode('text',{x:350,y:530,'text-anchor':'middle',class:'atlas-label'},s.frame?`DECODED ${(s.frame.heading*180/Math.PI).toFixed(1)}° · MODEL STEP ${s.frame.t}`:'AWAITING MODEL FRAME'),svgNode('text',{x:350,y:554,'text-anchor':'middle',class:'atlas-label'},'Illustrated atlas · no anatomical coordinate registration'));
}
async function choosePlane(next){
 const ticket=++revision;plane=next;
 for(const button of document.querySelectorAll('[data-plane]'))button.setAttribute('aria-pressed',String(button.dataset.plane===plane));
 document.querySelector('.plane-zoom').hidden=plane==='atlas';
 atlas.hidden=plane!=='atlas';$('orthogonal-anatomy').hidden=plane==='atlas';text('plane-label',plane==='atlas'?'SCHEMATIC ATLAS':plane.toUpperCase()+' SOURCE PLANE');text('projection-pass',plane==='atlas'?'Pure 2D SVG':'Canvas projection');
 if(plane==='atlas')return;
 try{
  text('projection-note','Loading exact-ID anatomical skeletons…');
  if(!view){const {ProjectedView}=await import('./projected-view.mjs');view=new ProjectedView($('orthogonal-anatomy'),()=>{});view.lockPlane=true;const s=getComputedStyle(document.documentElement);view.setTheme({surface:s.getPropertyValue('--surface')},Array.from({length:6},(_,i)=>s.getPropertyValue('--family-'+i).trim()));}
  const s=explorerSnapshot();if(view.data!==s.data)await view.setWiring(s.data,{a:s.a.version,b:s.b.version,diffs:s.diffs,diff:false,all:false});if(!view.available)throw new Error('No exact-ID skeletons are bundled for this wiring. Choose a FlyWire wiring for anatomical planes.');if(view.mode!=='anatomy')await view.setMode('anatomy');
  if(ticket!==revision)return;view.home();view.pitch=plane==='xz'?Math.PI/2:0;view.yaw=plane==='yz'?Math.PI/2:0;view.lockedAngles=[view.yaw,view.pitch];view.resize();view.dirty=true;
  text('projection-note',`${plane.toUpperCase()} orthographic projection of ${view.skeletons.length} real skeletons. Source coordinates are in µm. Drag to pan; scroll or use the zoom buttons. Axis names refer to source coordinates, not an independently verified dorsal/sagittal registration.`);
 }catch(error){if(ticket===revision){text('projection-note',error.message);$('orthogonal-anatomy').hidden=true;atlas.hidden=false;document.querySelector('.plane-zoom').hidden=true;text('plane-label','ANATOMY NOT AVAILABLE');text('projection-pass','Schematic only');}}
}
for(const button of document.querySelectorAll('[data-plane]'))button.addEventListener('click',()=>choosePlane(button.dataset.plane));
function refresh(){
 const s=explorerSnapshot();if(!s.data)return;const profile=activityProfile(s.data.neurons,s.frame?.activity);drawAtlas(s,profile);
 text('bump-sector',profile.peakBin===null?'Awaiting activity':`BIN ${String(profile.peakBin+1).padStart(2,'0')} / 16`);text('bump-width',profile.width===null?'Not available':`${profile.width.toFixed(1)}° FWHM`);
 linePlot($('bump-profile'),profile.values.map((y,i)=>({x:(i+.5)*22.5,y})),{yLabel:'Mean EPG rate-model activity'});
 text('profile-note',`Peak ${profile.peak.toFixed(4)} model units · ${profile.counts.reduce((a,b)=>a+b,0)} known-angle EPG neurons · ${profile.missing} missing angles excluded. Width is estimated from the binned profile, not fluorescence or voltage.`);
 if(lastVersion&&lastVersion!==s.data.version&&plane!=='atlas')choosePlane(plane);lastVersion=s.data.version;updateShell();
}
window.addEventListener('explorer-update',refresh);refresh();
function animate(){if(view&&view.mode==='anatomy'&&plane!=='atlas'&&!document.hidden){view.updateActivity(explorerSnapshot().frame?.activity);view.render();}requestAnimationFrame(animate);}requestAnimationFrame(animate);
window.addEventListener('themechange',()=>{if(view){const s=getComputedStyle(document.documentElement);view.setTheme({surface:s.getPropertyValue('--surface')},Array.from({length:6},(_,i)=>s.getPropertyValue('--family-'+i).trim()));}refresh();});

for(const button of document.querySelectorAll('[data-plane-zoom]'))button.addEventListener('click',()=>{if(!view)return;if(button.dataset.planeZoom==='reset')choosePlane(plane);else view.zoomBy(button.dataset.planeZoom==='in'?1.2:.83);});

export function projectionSnapshot(){return {plane,mode:view?.mode,yaw:view?.yaw,pitch:view?.pitch,pan:view?.pan};}

window.addEventListener('resize',refresh);
