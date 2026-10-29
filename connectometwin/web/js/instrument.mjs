import {explorerSnapshot,inspectNeuron,jumpTour,cameraAction} from './app.mjs';
import {families,familyOf,orientedDiff} from './view.mjs';
import {buildTour} from './tour.mjs';
import {compareWirings,neuronMetrics} from './metrics.mjs';
import {vertexCount,vertexAt,edgeCount,edgeAt} from './anatomy.mjs';
const $=id=>document.getElementById(id);
const nf=value=>value.toLocaleString('en-US');
const text=(id,value)=>{if($(id).textContent!==String(value))$(id).textContent=String(value);};
const names={explore:'Explore connectome',story:'Guided story',matrix:'Wiring differences',neuron:'Neuron deep dive'};
let screen='explore',pairKey='',neuronKey='',lastRun=null,frames=[],comparison=null,detail=null;
const panel=document.querySelector('.network-panel');
function route(next,{startStory=false}={}) {
  if(!names[next])return;
  if(screen==='neuron'&&next!=='neuron')cameraAction('home');
  screen=next;document.body.dataset.screen=next;
  for(const name of Object.keys(names))$('screen-'+name).hidden=name!==next;
  $(next+'-viewer').append(panel);
  for(const link of document.querySelectorAll('[data-screen-link]')){
    if(link.dataset.screenLink===next)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  text('screen-subtitle',names[next]);text('network-title',names[next]);
  if(next==='story'&&startStory&&explorerSnapshot().tourIndex<0)jumpTour(0);
  if(next==='neuron'&&explorerSnapshot().data&&explorerSnapshot().selected<0){const snapshot=explorerSnapshot();inspectNeuron(Math.max(0,snapshot.data.neurons.findIndex(n=>familyOf(n)==='EPG')));}
  if(next==='neuron')cameraAction('focus');
  if(next==='matrix'){if(!$('show-diff').disabled&&!$('show-diff').checked){$('show-diff').checked=true;$('show-diff').dispatchEvent(new Event('change'));}drawMatrix();}
  requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));explorerSnapshot().view?.resize();drawCharts();});
}
for(const link of document.querySelectorAll('[data-screen-link]'))link.addEventListener('click',event=>{
 event.preventDefault();const next=link.dataset.screenLink;
 history.pushState(null,'','#'+next);route(next,{startStory:next==='story'});window.scrollTo({top:0,behavior:'instant'});
});
window.addEventListener('popstate',()=>route(location.hash.slice(1)||'explore'));
$('tour-exit').addEventListener('click',()=>{history.pushState(null,'','#explore');route('explore');window.scrollTo(0,0);});
$('take-over').addEventListener('click',()=>{ $('tour-exit').click(); });
$('open-detail').addEventListener('click',()=>{history.pushState(null,'','#neuron');route('neuron');window.scrollTo(0,0);});
for(const button of document.querySelectorAll('[data-camera]'))button.addEventListener('click',()=>cameraAction(button.dataset.camera));
$('quick-detail').addEventListener('click',()=>{const select=$('three-detail');select.value=select.value==='full'?'overview':'full';select.dispatchEvent(new Event('change'));});
const fullscreen=$('viewer-fullscreen');if(!document.fullscreenEnabled)fullscreen.hidden=true;
fullscreen.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await panel.requestFullscreen();}catch{ text('three-status','Fullscreen is unavailable. The viewer remains available on this page.');$('three-status').hidden=false; }});
document.addEventListener('fullscreenchange',()=>{fullscreen.textContent=document.fullscreenElement?'⤢ Exit fullscreen':'⤢ Fullscreen';fullscreen.setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen viewer':'Enter fullscreen viewer');});
// Use the renderer's existing filter, so legend chips and selector stay in sync.
const legend = $('family-legend');
function makeChips() {
  if (!legend.children.length || legend.querySelector('button')) return;
  for (const item of [...legend.children]) {
    const family = item.textContent.trim();
    const button = document.createElement('button');
    button.className = 'family-chip';
    button.type = 'button';
    button.dataset.family = family;
    button.setAttribute('aria-label', `Focus ${family} neurons in 3D`);
    button.setAttribute('aria-pressed', 'false');
    button.append(...item.childNodes);
    button.addEventListener('click', () => {
      const filter = $('three-family');
      filter.value = filter.value === family ? 'all' : family;
      filter.dispatchEvent(new Event('change'));
    });
    item.replaceWith(button);
  }
}
new MutationObserver(makeChips).observe(legend, {childList:true});
makeChips();
function syncChips() {
  const in3D = $('view-three').getAttribute('aria-pressed') === 'true';
  for (const button of legend.querySelectorAll('button')) {
    button.disabled = !in3D;
    button.title = in3D ? 'Focus this neuron family; click again for all' : 'Family filtering is available in the 3D explorer';
    button.setAttribute('aria-pressed', String(in3D && button.dataset.family === $('three-family').value));
  }
}
$('three-family').addEventListener('change', syncChips);
new MutationObserver(syncChips).observe($('view-three'), {attributes:true,attributeFilter:['aria-pressed']});
new MutationObserver(syncChips).observe(legend, {childList:true});
syncChips();


function cloneSelector(id,label){
 const field=document.createElement('label');field.className='field';field.textContent=label;
 const select=document.createElement('select');select.id='matrix-'+id;select.setAttribute('aria-label',label);
 for(const option of $(id).options)select.add(new Option(option.text,option.value));
 select.value=$(id).value;select.addEventListener('change',()=>{$(id).value=select.value;$(id).dispatchEvent(new Event('change'));});
 field.append(select);$('matrix-selectors').append(field);
}
cloneSelector('wiring','Wiring A · trained on');cloneSelector('compare','Wiring B · compare / test');
function rowBar(container,label,value,fraction,color){
 const row=document.createElement('div');row.className='family-bar';
 const title=document.createElement('div');title.className='bar-label';
 const a=document.createElement('span'),b=document.createElement('span');a.textContent=label;b.textContent=value;
 title.append(a,b);const track=document.createElement('div');track.className='bar-track';const fill=document.createElement('div');fill.className='bar-fill';fill.style.width=`${fraction*100}%`;fill.style.background=color;track.append(fill);row.append(title,track);container.append(row);
}
function color(family){return getComputedStyle(document.documentElement).getPropertyValue('--family-'+families.indexOf(family)).trim();}
function drawMatrix(){
 if(!comparison)return;
 const table=$('weight-matrix');table.replaceChildren();
 const caption=document.createElement('caption');caption.className='sr-only';caption.textContent='B minus A, summed signed model weights by presynaptic and postsynaptic family';table.append(caption);
 const head=document.createElement('thead'),tr=document.createElement('tr');
 for(const name of ['PRE / POST',...families]){const th=document.createElement('th');th.scope='col';th.textContent=name;tr.append(th);}head.append(tr);table.append(head);
 const body=document.createElement('tbody'),max=Math.max(1e-9,...comparison.matrix.flat().map(Math.abs)),threshold=+$('matrix-threshold').value;
 for(let i=0;i<6;i++){const row=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=families[i];row.append(th);
  for(let j=0;j<6;j++){const value=comparison.matrix[i][j],cell=document.createElement('td'),visible=Math.abs(value)>=threshold;
   cell.textContent=visible?`${value>0?'+':''}${value.toFixed(2)}`:'·';cell.title=`${families[i]} → ${families[j]}: ${value.toFixed(6)} model weight units${visible?'':' (hidden by display threshold)'}`;
   const dark=document.documentElement.dataset.theme==='dark';cell.style.background=visible?(value>=0?`rgba(68,226,205,${.08+.38*Math.abs(value)/max})`:`rgba(255,180,168,${.08+.38*Math.abs(value)/max})`):'transparent';
   cell.style.color=dark?(value>=0?'#8df3e0':'#ffd0c7'):(value>=0?'#004c47':'#782b26');row.append(cell);
  }body.append(row);
 }table.append(body);text('matrix-threshold-value',threshold.toFixed(2));
}
$('matrix-threshold').addEventListener('input',drawMatrix);
$('simulate-comparison').addEventListener('click',()=>{
 $('mode').value='transplant';$('mode').dispatchEvent(new Event('change'));history.pushState(null,'','#explore');route('explore');window.scrollTo(0,0);
});
function updateComparison(s){
 const key=`${s.a?.version}/${s.b?.version}`;if(!s.a||!s.b||key===pairKey)return;pairKey=key;
 const sameFly=s.a.fly===s.b.fly;comparison=compareWirings(s.a,s.b,sameFly);
 text('net-delta',`${comparison.net>0?'+':''}${nf(comparison.net)}`);text('edge-overlap',comparison.overlap===null?'N/A':`${(100*comparison.overlap).toFixed(1)}%`);
 text('matrix-pair',`${s.a.name} → ${s.b.name}. ${sameFly?'Same-fly comparison.':'Different flies: family-level aggregates only; anatomical edge overlap is not defined.'}`);
 $('matrix-wiring').value=s.a.version;$('matrix-compare').value=s.b.version;
 $('family-deltas').replaceChildren();const max=Math.max(1,...comparison.families.map(x=>Math.abs(x.delta)));
 for(const row of comparison.families)rowBar($('family-deltas'),row.family,`${row.delta>0?'+':''}${nf(row.delta)} (${nf(row.a)} → ${nf(row.b)})`,Math.abs(row.delta)/max,color(row.family));
 drawMatrix();
}
function updateTour(s){
 const steps=buildTour(s.reference,s.refits,s.diffs,s.filtering);
 for(let i=0;i<steps.length;i++){
  let button=$('chapter-'+i);
  if(!button){const li=document.createElement('li');button=document.createElement('button');button.id='chapter-'+i;button.className='chapter-button';button.addEventListener('click',()=>jumpTour(i));li.append(button);$('chapter-list').append(li);}
  button.textContent=steps[i].title;if(i===s.tourIndex)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
 }
 text('story-configuration',`${s.index.names[s.run.source]} → ${s.index.names[s.run.target]}`);
 text('story-refit',s.run.refit?'ENABLED':'DISABLED');text('story-demo-error',$('benchmark-error').textContent);text('story-live-error',$('current-error').textContent);
}
function updateDetail(s){
 const index=s.selected,neuron=s.data.neurons[index];if(!neuron)return;
 const key=`${s.data.version}:${index}:${s.view?.detail}:${s.view?.mode}`;
 if(key===neuronKey)return;neuronKey=key;detail=neuronMetrics(s.data,index);
 text('detail-title',neuron.type);text('detail-family',familyOf(neuron));text('detail-id',`ID: ${neuron.id}`);$('detail-neuron').value=String(index);
 text('detail-inputs',nf(detail.incoming));text('detail-outputs',nf(detail.outgoing));
 const skeleton=s.view?.skeletons?.find(value=>value.id===neuron.id);
 if(skeleton){let length=0;for(let e=0;e<edgeCount(skeleton);e++){const [a,b]=edgeAt(skeleton,e),x=vertexAt(skeleton,a),y=vertexAt(skeleton,b);length+=Math.hypot(...x.map((v,k)=>v-y[k]));}
  text('detail-segments',nf(edgeCount(skeleton)));text('detail-length',`${length.toFixed(1)} µm`);text('detail-morphology-note',`${s.view.detail==='full'?'Full branches':'Fast overview'}: skeleton polyline length and segment count at the loaded simplification level. These are not synapse counts.`);
 }else{text('detail-segments','Unavailable');text('detail-length','Unavailable');text('detail-morphology-note','No loaded anatomical skeleton for this neuron. Graph statistics remain available.');}
 $('export-neuron').disabled=!skeleton;
 $('partner-groups').replaceChildren();$('partner-stack').replaceChildren();const total=detail.groups.reduce((sum,g)=>sum+g.strength,0);
 for(const group of detail.groups){const fraction=total?group.strength/total:0;rowBar($('partner-groups'),group.family,`${(fraction*100).toFixed(1)}% · ${group.incoming} in / ${group.outgoing} out`,fraction,color(group.family));const segment=document.createElement('span');segment.style.width=`${fraction*100}%`;segment.style.background=color(group.family);segment.title=`${group.family} ${(fraction*100).toFixed(1)}%`;$('partner-stack').append(segment);}
 const svg=$('partner-schematic'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 for(let i=0;i<6;i++){const angle=i*Math.PI/3,x=180+115*Math.cos(angle),y=110+78*Math.sin(angle),g=detail.groups[i];
  const line=document.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1:180,y1:110,x2:x,y2:y,stroke:color(families[i]),'stroke-width':1+5*(total?g.strength/total:0),opacity:g.strength?.8:.15}))line.setAttribute(k,v);svg.append(line);
  const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r','6');circle.setAttribute('fill',color(families[i]));svg.append(circle);
  const label=document.createElementNS(ns,'text');label.setAttribute('x',x);label.setAttribute('y',y+(y>110?21:-14));label.setAttribute('text-anchor','middle');label.textContent=families[i];svg.append(label);
 }
 const center=document.createElementNS(ns,'text');center.setAttribute('x','180');center.setAttribute('y','114');center.setAttribute('text-anchor','middle');center.textContent=familyOf(neuron);svg.append(center);
}
$('detail-neuron').addEventListener('change',()=>inspectNeuron(+$('detail-neuron').value));
$('isolate-neuron').addEventListener('click',()=>cameraAction('isolate'));
$('clear-isolation').addEventListener('click',()=>cameraAction('clear'));
$('export-neuron').addEventListener('click',()=>{
 const s=explorerSnapshot(),neuron=s.data.neurons[s.selected],skeleton=s.view?.skeletons?.find(value=>value.id===neuron.id);if(!skeleton)return;
 const json={id:neuron.id,type:neuron.type,units:'micrometers',detail:s.view.detail,source:'Schlegel & Jefferis (2024), https://doi.org/10.5281/zenodo.10877326',license:'CC-BY-4.0',note:'Simplified skeleton coordinates and edges; radii and synapse locations are not included.',vertices:Array.from({length:vertexCount(skeleton)},(_,i)=>Array.from(vertexAt(skeleton,i))),edges:Array.from({length:edgeCount(skeleton)},(_,i)=>Array.from(edgeAt(skeleton,i)))};
 const url=URL.createObjectURL(new Blob([JSON.stringify(json)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`${neuron.id}-${s.view.detail}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);text('export-status','Exported real skeleton coordinates in µm with source attribution.');
});
function chart(id,values,{bars=false}={}){
 const canvas=$(id),rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
 const dpr=Math.min(devicePixelRatio||1,2);canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
 const styles=getComputedStyle(document.documentElement),w=rect.width,h=rect.height,max=Math.max(1e-9,...values.filter(Number.isFinite)),left=35,right=w-18,top=22,bottom=h-28;
 ctx.fillStyle=styles.getPropertyValue('--surface');ctx.fillRect(0,0,w,h);if(!values.length){ctx.fillStyle=styles.getPropertyValue('--muted-text');ctx.font='11px monospace';ctx.fillText('Play a run to collect model activity.',18,h/2);return;}ctx.strokeStyle=styles.getPropertyValue('--rule');ctx.lineWidth=.5;
 for(let i=0;i<3;i++){const y=top+(bottom-top)*i/2;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}
 ctx.fillStyle=styles.getPropertyValue('--muted-text');ctx.font='10px monospace';ctx.fillText(max.toFixed(2),3,top);ctx.fillText('0',15,bottom);ctx.fillText(bars?'EPG neurons':'Model steps 0–39',left,h-9);
 ctx.strokeStyle=styles.getPropertyValue('--accent');ctx.fillStyle=styles.getPropertyValue('--accent');ctx.lineWidth=1.6;ctx.beginPath();
 values.forEach((v,i)=>{const x=left+(right-left)*i/Math.max(1,(bars?values.length:40)-1),y=bottom-v/max*(bottom-top);if(bars)ctx.fillRect(x,y,Math.max(1,(right-left)/Math.max(1,values.length)-1),bottom-y);else if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});if(!bars)ctx.stroke();
}
function drawCharts(){const s=explorerSnapshot();if(!s.data)return;
 if(screen==='story')chart('population-chart',s.data.neurons.map((n,i)=>familyOf(n)==='EPG'?Math.max(0,s.frame?.activity[i]||0):null).filter(v=>v!==null),{bars:true});
 if(screen==='neuron')chart('neuron-activity',frames.map(frame=>Math.max(0,frame[s.selected]||0)));
}
function refresh(){
 const s=explorerSnapshot();if(!s.data||!s.a||!s.b)return;
 if(s.run!==lastRun){lastRun=s.run;frames=[];neuronKey='';$('detail-neuron').replaceChildren(...s.data.neurons.map((neuron,index)=>new Option(`${neuron.type} · ${neuron.id}`,String(index))));}
 if(s.frame&&frames.length<=s.frame.t)frames[s.frame.t]=Array.from(s.frame.activity);
 text('viewer-error',$('current-error').textContent);
 text('dataset-badge',s.data.fly==='FlyWire'?'FLYWIRE v783':s.data.name);text('roi-name',`${s.data.fly.toUpperCase()} / CENTRAL COMPLEX`);
 const view=s.view;$('renderer-notice').hidden=!view?.projection;text('quick-detail',view?.detail==='full'?'Full branches ✓':'Load full branches');$('quick-detail').setAttribute('aria-pressed',String(view?.detail==='full'));$('quick-detail').disabled=!view?.available||view.mode!=='anatomy';text('geometry-readout',view?.mode==='anatomy'?`${nf(Number($('three-wrap').dataset.segments||0))} SEGMENTS · ${view.detail.toUpperCase()}`:'TOPOLOGY · NOT ANATOMICAL');
 text('anatomy-badge',view?.mode==='anatomy'?(view.projection?'ANATOMY · CANVAS PROJECTION':'REAL NEURON SKELETONS'):'CIRCUIT GRAPH');
 const diff=orientedDiff(s.diffs,s.a.version,s.b.version);$('wiring-difference').hidden=!$('show-diff').checked||!diff;
 if(diff)for(const kind of ['added','removed','changed'])text(kind+'-count',nf(diff[kind].length));
 updateComparison(s);updateTour(s);updateDetail(s);drawCharts();
}
for(const event of ['explorer-update','neuron-selected','themechange'])window.addEventListener(event,()=>{if(event==='neuron-selected'&&screen==='neuron')cameraAction('focus');if(event==='themechange'){pairKey='';neuronKey='';}refresh();});
$('show-diff').addEventListener('change',refresh);
new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['data-three','data-benchmark']});
window.addEventListener('resize',drawCharts);
refresh();route(names[location.hash.slice(1)]?location.hash.slice(1):'explore',{startStory:location.hash==='#story'});
