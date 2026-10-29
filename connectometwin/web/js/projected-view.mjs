import {families,familyOf,orientedDiff,strongestEdges} from './view.mjs';
import {matchAnatomy,decodeSkeletonBundle,validateSkeleton,normalizeSkeletons,topologyPositions,vertexAt,vertexCount,edgeAt,edgeCount} from './anatomy.mjs';

/** Real skeleton coordinates projected by Canvas when WebGL is unavailable.
 * No anatomy is fabricated; this is explicitly labelled a CPU projection. */
export class ProjectedView {
 constructor(container,onSelect){
  this.container=container;this.onSelect=onSelect;this.projection=true;this.detail='overview';this.family='all';this.mode='topology';this.selected=-1;this.isolated=-1;this.showEdges=false;this.skeletons=[];this.cache=new Map();this.revision=0;this.controls={autoRotate:false};this.lines={visible:false};this.available=0;this.dirty=true;
  this.canvas=document.createElement('canvas');this.canvas.tabIndex=0;this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Real neuron anatomy projected with Canvas. Drag to rotate, scroll to zoom, brackets to select neurons. WebGL is unavailable.');container.append(this.canvas);this.ctx=this.canvas.getContext('2d');
  this.home();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);
  let down=null,moved=false;
  this.canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];moved=false;this.canvas.setPointerCapture(e.pointerId);});
  this.canvas.addEventListener('pointermove',e=>{if(!down)return;const dx=e.clientX-down[0],dy=e.clientY-down[1];moved||=Math.abs(dx)+Math.abs(dy)>2;this.yaw+=dx*.006;this.pitch+=dy*.006;down=[e.clientX,e.clientY];this.dirty=true;});
  this.canvas.addEventListener('pointerup',e=>{down=null;if(!moved)this.pick(e);});
  this.canvas.addEventListener('pointercancel',()=>{down=null;});
  this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.3,Math.min(8,this.zoom*Math.exp(-e.deltaY*.001)));this.dirty=true;},{passive:false});
  this.canvas.addEventListener('keydown',e=>{if(!['[',']','Home','+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='Home')this.home();else if(e.key==='['||e.key===']'){const indices=[...(this.present||[])].filter(i=>this.family==='all'||familyOf(this.data.neurons[i])===this.family).sort((a,b)=>a-b);if(indices.length){this.select(indices[(indices.indexOf(this.selected)+(e.key===']'?1:-1)+indices.length)%indices.length]);this.onSelect(this.selected);}}else if(['+','=','-'].includes(e.key))this.zoom*=e.key==='-'?.9:1.1;else if(e.key==='ArrowLeft')this.yaw-=.08;else if(e.key==='ArrowRight')this.yaw+=.08;else this.pitch+=e.key==='ArrowUp'?.08:-.08;this.dirty=true;});
 }
 home(){this.yaw=0;this.pitch=0;this.zoom=1;this.center=[0,0,0];this.dirty=true;}
 resize(){const r=this.container.getBoundingClientRect();if(!r.width||!r.height)return;this.width=r.width;this.height=r.height;this.canvas.width=r.width;this.canvas.height=r.height;this.dirty=true;}
 setTheme(palette,colors){this.palette=palette;this.colors=colors;this.dirty=true;}
 async setWiring(data,options){const rev=++this.revision;this.data=data;this.options=options;this.selected=-1;this.isolated=-1;this.mode='topology';this.skeletons=[];if(!this.manifest){const response=await fetch('data/anatomy/manifest.json');if(!response.ok)throw new Error('Anatomy manifest unavailable');this.manifest=await response.json();}if(rev!==this.revision)return false;this.available=matchAnatomy(this.manifest,data.neurons).length;this.rebuild();return true;}
 async setMode(mode){const rev=++this.revision;if(mode==='topology'){this.mode=mode;this.rebuild();return;}
  const source=this.manifest.levels?.[this.detail]||this.manifest,matches=matchAnatomy(source,this.data.neurons);if(!matches.length)throw new Error('No exact-ID anatomical skeletons are available.');
  let skeletons;
  if(source.bundle){const key=source.bundle.file;if(!this.cache.has(key))this.cache.set(key,(async()=>{const response=await fetch('data/anatomy/'+key);if(!response.ok)throw new Error('Anatomy download failed');const buffer=await response.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');if(buffer.byteLength!==source.bundle.bytes||hash!==source.bundle.sha256)throw new Error('Anatomy checksum mismatch');return decodeSkeletonBundle(buffer,source.neurons);})().catch(error=>{this.cache.delete(key);throw error;}));const all=await this.cache.get(key);skeletons=matches.map(item=>all.get(item.id));}
  else skeletons=await Promise.all(matches.map(async item=>{const r=await fetch('data/anatomy/'+item.file);return validateSkeleton(await r.json(),item.id);}));
  if(rev!==this.revision)return;this.skeletons=skeletons;this.mode='anatomy';this.rebuild();this.home();
 }
 rebuild(){this.positions=topologyPositions(this.data.neurons);this.present=new Set();this.paths=new Map();const ids=new Map(this.data.neurons.map((n,i)=>[n.id,i]));let segments=0;
  if(this.mode==='anatomy'){const norm=normalizeSkeletons(this.skeletons);for(const s of this.skeletons){const index=ids.get(s.id),points=new Float32Array(vertexCount(s)*3),mean=[0,0,0];for(let v=0;v<vertexCount(s);v++){const point=norm.transform(Array.from(vertexAt(s,v)));points.set(point,v*3);for(let k=0;k<3;k++)mean[k]+=point[k]/vertexCount(s);}this.paths.set(index,{points,skeleton:s});this.positions[index]=mean;this.present.add(index);segments+=edgeCount(s);}}
  else for(let i=0;i<this.data.neurons.length;i++)this.present.add(i);
  Object.assign(this.container.dataset,{mode:this.mode,neurons:String(this.present.size),segments:String(segments),renderer:'canvas-projection'});this.dirty=true;
 }
 setOptions(options){const old=this.options?.diff;this.options=options;if(options.diff&&!old)this.showEdges=true;else if(!options.diff&&old)this.showEdges=false;this.dirty=true;}
 setFilter(family){this.family=family;this.dirty=true;}
 select(index){this.selected=index;this.dirty=true;}
 isolate(index){this.isolated=index;if(index>=0)this.focusSelected();else this.home();this.dirty=true;}
 focusSelected(){if(this.positions?.[this.selected]){this.center=this.positions[this.selected];this.zoom=1.8;this.dirty=true;}}
 zoomBy(factor){this.zoom=Math.max(.3,Math.min(8,this.zoom*factor));this.dirty=true;}
 updateActivity(activity){this.activity=activity;if(!this.data)return;let peak=0;for(let i=0;i<this.data.neurons.length;i++)if(familyOf(this.data.neurons[i])==='EPG')peak=Math.max(peak,activity?.[i]||0);const values=this.data.neurons.map((n,i)=>familyOf(n)==='EPG'&&peak?Math.round(Math.max(0,activity?.[i]||0)/peak*12):0);if(!this.activityLevels||values.some((v,i)=>v!==this.activityLevels[i]))this.dirty=true;this.activityLevels=values;}
 project(p){const x=p[0]-this.center[0],y=p[1]-this.center[1],z=p[2]-this.center[2],cx=Math.cos(this.yaw),sx=Math.sin(this.yaw),cy=Math.cos(this.pitch),sy=Math.sin(this.pitch),xx=x*cx+z*sx,zz=-x*sx+z*cx,yy=y*cy-zz*sy;const scale=Math.min(this.width/2.9,this.height/2.5)*this.zoom;return [this.width/2+xx*scale,this.height/2-yy*scale];}
 render(){if(!this.width||!this.data)return;if(this.controls.autoRotate){this.yaw+=.003;this.dirty=true;}if(!this.dirty||performance.now()-(this.lastDraw||0)<80)return;this.lastDraw=performance.now();this.dirty=false;const c=this.ctx;c.fillStyle=this.mode==='anatomy'?'#06080d':this.palette.surface;c.fillRect(0,0,this.width,this.height);this.projected=[];
  for(const i of this.present){if(this.family!=='all'&&familyOf(this.data.neurons[i])!==this.family||this.isolated>=0&&i!==this.isolated)continue;const family=familyOf(this.data.neurons[i]),color=this.colors[families.indexOf(family)],selected=this.selected===i,muted=this.selected>=0&&!selected;c.strokeStyle=selected?'#e1f8ff':color;c.globalAlpha=muted?.13:selected?1:.5+(this.activityLevels?.[i]||0)/12*.35;c.lineWidth=selected?1.2:.65;c.beginPath();
   const path=this.paths.get(i);if(path){const {points,skeleton}=path;for(let e=0;e<edgeCount(skeleton);e++){const [a,b]=edgeAt(skeleton,e),p=this.project(points.subarray(a*3,a*3+3)),q=this.project(points.subarray(b*3,b*3+3));c.moveTo(...p);c.lineTo(...q);}c.stroke();}
   const p=this.project(this.positions[i]);this.projected.push({index:i,p});if(selected||!path){c.globalAlpha=1;c.fillStyle=color;c.beginPath();c.arc(...p,selected?3:2,0,Math.PI*2);c.fill();}
  }
  if(this.showEdges||this.lines.visible){const add=(a,b,color)=>{if(!this.present.has(a)||!this.present.has(b))return;if(this.family!=='all'&&(familyOf(this.data.neurons[a])!==this.family||familyOf(this.data.neurons[b])!==this.family))return;if(this.isolated>=0&&a!==this.isolated&&b!==this.isolated)return;const x=this.project(this.positions[a]),y=this.project(this.positions[b]);c.strokeStyle=color;c.globalAlpha=.3;c.lineWidth=.7;c.beginPath();c.moveTo(...x);c.lineTo(...y);c.stroke();};if(this.options.diff){const diff=orientedDiff(this.options.diffs,this.options.a,this.options.b);if(diff)for(const kind of ['added','removed','changed'])for(const pair of diff[kind].slice(0,this.options.all?undefined:400))add(...pair,this.palette[kind]);}else for(const i of strongestEdges(this.data.edges,this.options.all))add(this.data.edges.pre[i],this.data.edges.post[i],this.palette.positive);}
  c.globalAlpha=1;
 }
 pick(event){
  const r=this.canvas.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;let best=null,distance=12;
  for(const item of this.projected||[]){const d=Math.hypot(item.p[0]-x,item.p[1]-y);if(d<distance){distance=d;best=item.index;}}
  for(const [index,path] of this.paths){
   if(this.family!=='all'&&familyOf(this.data.neurons[index])!==this.family||this.isolated>=0&&index!==this.isolated)continue;
   for(let e=0;e<edgeCount(path.skeleton);e++){
    const [a,b]=edgeAt(path.skeleton,e),p=this.project(path.points.subarray(a*3,a*3+3)),q=this.project(path.points.subarray(b*3,b*3+3));
    const dx=q[0]-p[0],dy=q[1]-p[1],denom=dx*dx+dy*dy,t=denom?Math.max(0,Math.min(1,((x-p[0])*dx+(y-p[1])*dy)/denom)):0;
    const d=Math.hypot(x-p[0]-t*dx,y-p[1]-t*dy);if(d<distance){distance=d;best=index;}
   }
  }
  if(best!==null){this.select(best);this.onSelect(best);}
 }

 dispose(){this.observer.disconnect();this.canvas.remove();}
}
