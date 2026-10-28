import * as THREE from '../vendor/three.module.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {families,familyOf,strongestEdges,orientedDiff} from './view.mjs';
import {topologyPositions,validateSkeleton,matchAnatomy,normalizeSkeletons} from './anatomy.mjs';

const vertexShader=`
attribute float owner;
attribute vec3 color;
uniform sampler2D states;
uniform float count;
varying vec3 tint;
varying float visibility;
void main(){
 vec4 state=texture2D(states,vec2((owner+0.5)/count,0.5));
 visibility=state.a;
 tint=mix(color,vec3(1.0),min(0.95,state.r*0.75+state.g*0.9+state.b*0.25));
 gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;
const fragmentShader=`
varying vec3 tint;
varying float visibility;
uniform float opacity;
void main(){
 if(visibility<0.5) discard;
 gl_FragColor=vec4(tint,opacity);
 #include <colorspace_fragment>
}`;

export class ThreeView {
  constructor(container,onSelect) {
    this.container=container;this.onSelect=onSelect;this.family='all';this.mode='topology';this.selected=-1;this.showEdges=true;this.adjacent=new Set();this.white=new THREE.Color(0xffffff);
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(42,1,.01,100);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.domElement.tabIndex=0;this.renderer.domElement.setAttribute('role','img');
    this.renderer.domElement.setAttribute('aria-label','Interactive 3D circuit. Drag to rotate, scroll to zoom, arrow keys to pan, plus or minus to zoom, Home to reset, brackets to select neurons.');
    container.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.09;
    this.controls.minDistance=.5;this.controls.maxDistance=15;this.controls.listenToKeyEvents(this.renderer.domElement);
    this.controls.autoRotateSpeed=.7;
    this.nodes=new THREE.Group();this.lines=new THREE.Group();this.scene.add(this.nodes,this.lines);
    this.manifest=null;this.skeletonCache=new Map();this.revision=0;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);
    this.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();container.dispatchEvent(new CustomEvent('three-error',{bubbles:true,detail:'3D graphics context lost. Return to the 2D ring view and retry.'}));});
    let down=null;
    this.renderer.domElement.addEventListener('pointerdown',event=>{down=[event.clientX,event.clientY];});
    this.renderer.domElement.addEventListener('pointerup',event=>{
      if(!down||Math.hypot(event.clientX-down[0],event.clientY-down[1])>5)return;
      this.pick(event);down=null;
    });
    this.renderer.domElement.addEventListener('keydown',event=>{
      if(['+','=','-','Home','[',']'].includes(event.key)) {
        event.preventDefault();
        if(event.key==='Home')this.home();
        else if(['+','=','-'].includes(event.key)) {this.camera.position.sub(this.controls.target).multiplyScalar(event.key==='-'?1.15:.87).add(this.controls.target);}
        else if(this.data) {const visible=[...this.present].filter(i=>this.family==='all'||familyOf(this.data.neurons[i])===this.family).sort((a,b)=>a-b);if(visible.length){const current=visible.indexOf(this.selected);this.select(visible[(current+(event.key===']'?1:-1)+visible.length)%visible.length]);this.onSelect(this.selected);}}
      }
    });
    this.home();this.resize();
  }
  home(){this.controls.target.set(0,0,0);this.camera.position.set(1.5,.9,3.8);this.controls.update();}
  resize(){const {width,height}=this.container.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  setTheme(palette,colors){this.palette=palette;this.colors=colors;this.scene.background=new THREE.Color(palette.surface);if(this.data)this.rebuild();}
  clear(group){for(const object of [...group.children]){group.remove(object);object.geometry?.dispose();if(Array.isArray(object.material))object.material.forEach(m=>m.dispose());else object.material?.dispose();}}
  async setWiring(data,options={}) {
    const revision=++this.revision;this.data=data;this.options=options;this.selected=-1;this.adjacent.clear();this.skeletons=[];this.mode='topology';
    if(!this.manifest) {const response=await fetch('data/anatomy/manifest.json');if(!response.ok)throw new Error(`Anatomy manifest: HTTP ${response.status}`);this.manifest=await response.json();}
    if(revision!==this.revision)return false;
    const matches=matchAnatomy(this.manifest,data.neurons);
    this.available=matches.length;this.rebuild();
    this.container.dispatchEvent(new CustomEvent('anatomy-status',{bubbles:true,detail:{available:matches.length,total:data.neurons.length,status:this.manifest.status}}));
    return true;
  }
  async setMode(mode) {
    const revision=++this.revision;
    if(mode==='topology'){this.mode=mode;this.rebuild();return;}
    const data=this.data,matches=matchAnatomy(this.manifest,data.neurons);
    if(!matches.length)throw new Error('No matching anatomical skeletons are bundled yet. The topology preview is not anatomical.');
    const pending=matches.filter(item=>!this.skeletonCache.has(item.id));
    // Bounded concurrent loads avoid a burst of hundreds of requests.
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
      while(cursor<pending.length){const item=pending[cursor++];const response=await fetch(`data/anatomy/${item.file}`);if(!response.ok)throw new Error(`Skeleton ${item.id}: HTTP ${response.status}`);this.skeletonCache.set(item.id,validateSkeleton(await response.json(),item.id));}
    }));
    if(revision!==this.revision||data!==this.data)return;
    this.skeletons=matches.map(item=>this.skeletonCache.get(item.id));this.mode='anatomy';this.showEdges=false;this.rebuild();this.home();
  }
  material(opacity=1){return new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{states:{value:this.texture},count:{value:this.data.neurons.length},opacity:{value:opacity}},transparent:opacity<1,depthWrite:opacity===1});}
  rebuild(){
    if(!this.data||!this.colors)return;
    this.clear(this.nodes);this.clear(this.lines);this.texture?.dispose();
    const n=this.data.neurons.length;this.stateValues=new Float32Array(n*4);
    this.texture=new THREE.DataTexture(this.stateValues,n,1,THREE.RGBAFormat,THREE.FloatType);this.texture.needsUpdate=true;
    this.positions=topologyPositions(this.data.neurons);this.present=new Set();this.geometryOwners=[];
    const xyz=[],rgb=[],owners=[];
    const append=(a,b,index)=>{const color=new THREE.Color(this.colors[families.indexOf(familyOf(this.data.neurons[index]))]);xyz.push(...a,...b);rgb.push(color.r,color.g,color.b,color.r,color.g,color.b);owners.push(index,index);this.geometryOwners.push(index);};
    if(this.mode==='anatomy'){
      const normalized=normalizeSkeletons(this.skeletons),indices=new Map(this.data.neurons.map((neuron,i)=>[neuron.id,i]));
      for(const skeleton of this.skeletons){const i=indices.get(skeleton.id),points=skeleton.vertices.map(normalized.transform);this.present.add(i);this.positions[i]=[0,0,0];for(const p of points)for(let k=0;k<3;k++)this.positions[i][k]+=p[k]/points.length;for(const [a,b] of skeleton.edges)append(points[a],points[b],i);}
    }else{
      for(let i=0;i<n;i++)this.present.add(i);
    }
    if(xyz.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));geometry.setAttribute('owner',new THREE.Float32BufferAttribute(owners,1));this.skeletonLines=new THREE.LineSegments(geometry,this.material(.8));this.nodes.add(this.skeletonLines);}else this.skeletonLines=null;
    // Small selectable markers indicate neuron anchors, not reconstructed somata.
    this.markers=new THREE.InstancedMesh(new THREE.SphereGeometry(this.mode==='anatomy'?.012:.022,10,8),new THREE.MeshBasicMaterial({color:0xffffff}),n);
    this.container.dataset.mode=this.mode;this.container.dataset.neurons=String(this.present.size);this.container.dataset.segments=String(this.geometryOwners.length);
    this.nodes.add(this.markers);this.matrix=new THREE.Matrix4();this.color=new THREE.Color();this.buildConnections();this.updateActivity(this.activity);
  }
  buildConnections(){
    this.clear(this.lines);if(!this.data)return;
    const xyz=[],rgb=[],edgePairs=[],color=new THREE.Color();
    const add=(a,b,hex)=>{
      if(!this.present.has(a)||!this.present.has(b))return;
      const start=new THREE.Vector3(...this.positions[a]),end=new THREE.Vector3(...this.positions[b]);
      const control=start.clone().add(end).multiplyScalar(.20);control.z+=.10;
      const curve=new THREE.QuadraticBezierCurve3(start,control,end),points=curve.getPoints(10);color.set(hex);
      for(let k=0;k<10;k++){xyz.push(...points[k].toArray(),...points[k+1].toArray());rgb.push(color.r,color.g,color.b,1,color.r,color.g,color.b,1);edgePairs.push([a,b]);}
    };
    const {data,options}=this;
    if(options.diff){const diff=orientedDiff(options.diffs,options.a,options.b);if(diff){for(const [kind,hex] of [['added',this.palette.added],['removed',this.palette.removed],['changed',this.palette.changed]])for(const pair of diff[kind].slice(0,options.all?undefined:400))add(...pair,hex);}}
    else for(const index of strongestEdges(data.edges,options.all))add(data.edges.pre[index],data.edges.post[index],data.edges.w[index]>=0?this.palette.positive:this.palette.negative);
    this.edgePairs=edgePairs;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(rgb,4));
    this.edgeColors=new Float32Array(rgb);
    this.connections=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.17,depthWrite:false}));this.lines.add(this.connections);this.lines.visible=this.showEdges;this.updateEdges();
  }
  setOptions(options){this.options=options;if(this.data)this.buildConnections();}
  setFilter(family){this.family=family;this.updateActivity(this.activity);this.updateEdges();}
  select(index){this.selected=index;this.adjacent.clear();const e=this.data.edges;for(let k=0;k<e.w.length;k++){if(e.pre[k]===index)this.adjacent.add(e.post[k]);if(e.post[k]===index)this.adjacent.add(e.pre[k]);}this.updateActivity(this.activity);this.updateEdges();}
  updateActivity(activity){
    this.activity=activity;if(!this.data||!this.texture)return;
    let peak=0;for(let i=0;i<this.data.neurons.length;i++)if(familyOf(this.data.neurons[i])==='EPG')peak=Math.max(peak,activity?.[i]||0);
    for(let i=0;i<this.data.neurons.length;i++){
      const family=familyOf(this.data.neurons[i]),visible=this.present.has(i)&&(this.family==='all'||this.family===family);
      const intensity=family==='EPG'&&peak>0?Math.max(0,activity?.[i]||0)/peak:0;
      this.stateValues.set([intensity,+(i===this.selected),+this.adjacent.has(i),+visible],i*4);
      this.color.set(this.colors[families.indexOf(family)]);if(i===this.selected)this.color.set(this.palette.cue);else this.color.lerp(this.white,intensity*.8);
      this.markers.setColorAt(i,this.color);this.matrix.makeScale(visible?1+intensity*1.7:0,visible?1+intensity*1.7:0,visible?1+intensity*1.7:0);this.matrix.setPosition(...this.positions[i]);this.markers.setMatrixAt(i,this.matrix);
    }
    this.texture.needsUpdate=true;this.markers.instanceMatrix.needsUpdate=true;if(this.markers.instanceColor)this.markers.instanceColor.needsUpdate=true;
  }
  updateEdges(){
    if(!this.connections || !this.edgeColors)return;
    const attribute=this.connections.geometry.getAttribute('color');
    for(let k=0;k<this.edgePairs.length;k++){
      const [a,b]=this.edgePairs[k];
      const visible=this.present.has(a)&&this.present.has(b)&&(this.family==='all'||(familyOf(this.data.neurons[a])===this.family&&familyOf(this.data.neurons[b])===this.family));
      const factor=visible?(this.selected<0||a===this.selected||b===this.selected?1:.1):0;
      for(let vertex=0;vertex<2;vertex++){const start=k*8+vertex*4;for(let component=0;component<3;component++)attribute.array[start+component]=this.edgeColors[start+component];attribute.array[start+3]=factor;}
    }
    attribute.needsUpdate=true;
  }

  pick(event){
    const rect=this.renderer.domElement.getBoundingClientRect(),pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),ray=new THREE.Raycaster();ray.params.Line.threshold=.018;ray.setFromCamera(pointer,this.camera);
    const hits=ray.intersectObjects([this.markers,...(this.skeletonLines?[this.skeletonLines]:[])]);
    for(const hit of hits){const index=hit.instanceId ?? this.geometryOwners[Math.floor(hit.index/2)];if(index!==undefined&&this.stateValues[index*4+3]){this.select(index);this.onSelect(index);break;}}
  }
  render(){this.controls.update();this.renderer.render(this.scene,this.camera);}
  dispose(){this.revision++;this.resizeObserver.disconnect();this.controls.dispose();this.clear(this.nodes);this.clear(this.lines);this.texture?.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
