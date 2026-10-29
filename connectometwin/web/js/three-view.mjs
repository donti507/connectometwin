import * as THREE from '../vendor/three.module.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {families,familyOf,strongestEdges,orientedDiff} from './view.mjs';
import {topologyPositions,validateSkeleton,matchAnatomy,normalizeSkeletons,decodeSkeletonBundle,vertexCount,edgeCount,vertexAt,edgeAt} from './anatomy.mjs';

export class ThreeView {
  constructor(container,onSelect) {
    this.container=container;this.onSelect=onSelect;this.family='all';this.mode='topology';this.detail='overview';this.selected=-1;this.isolated=-1;this.showEdges=true;this.adjacent=new Set();this.white=new THREE.Color(0xffffff);
    this.present=new Set();this.positions=[];
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(42,1,.01,100);
    let canvas=document.createElement('canvas'),context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
    const debug=context?.getExtension('WEBGL_debug_renderer_info');
    this.software=Boolean(debug&&/swiftshader|llvmpipe|software|lavapipe/i.test(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)));
    if(this.software){context.getExtension('WEBGL_lose_context')?.loseContext();canvas=undefined;context=undefined;}
    this.renderer=new THREE.WebGLRenderer({canvas,context,antialias:!this.software,alpha:false,powerPreference:'high-performance'});
    this.detail=this.software?'overview':'full';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.software?1:2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.domElement.tabIndex=0;this.renderer.domElement.setAttribute('role','img');
    this.renderer.domElement.setAttribute('aria-label','Interactive 3D circuit. Drag to rotate, scroll to zoom, arrow keys to pan, plus or minus to zoom, Home to reset, brackets to select neurons.');
    container.append(this.renderer.domElement);
    this.dirty=true;
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=!this.software;this.controls.dampingFactor=.09;
    this.controls.minDistance=.5;this.controls.maxDistance=15;this.controls.listenToKeyEvents(this.renderer.domElement);
    this.controls.autoRotateSpeed=.7;this.controls.addEventListener('change',()=>{this.dirty=true;});
    this.nodes=new THREE.Group();this.lines=new THREE.Group();this.scene.add(this.nodes,this.lines);
    this.manifest=null;this.bundlePromises=new Map();this.skeletonCache=new Map();this.revision=0;
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
  home(){this.controls.target.set(0,0,0);const tangent=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));let distance=(this.fitRadius||1.3)/Math.sin(THREE.MathUtils.degToRad(this.camera.fov/2))*1.12;if(this.mode==='anatomy'&&this.halfExtents){const [x,y,z]=this.halfExtents;distance=(Math.max(y/tangent,x/(tangent*this.camera.aspect))+z)*1.08;this.camera.position.set(0,0,distance);}else this.camera.position.set(1.5,.9,3.8).normalize().multiplyScalar(distance);this.controls.update();}
  resize(){const {width,height}=this.container.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();if(this.markers?.material.uniforms)this.markers.material.uniforms.viewportScale.value=this.renderer.domElement.height/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)));this.dirty=true;}
  setTheme(palette,colors){this.palette=palette;this.colors=colors;this.scene.background=new THREE.Color(palette.surface);if(this.data)this.rebuild();}
  clear(group){for(const object of [...group.children]){group.remove(object);object.geometry?.dispose();if(Array.isArray(object.material))object.material.forEach(m=>m.dispose());else object.material?.dispose();}}
  async setWiring(data,options={}) {
    const revision=++this.revision;this.present=new Set();this.stateValues=null;this.data=data;this.options=options;this.selected=-1;this.isolated=-1;this.adjacent.clear();this.skeletons=[];this.mode='topology';this.showEdges=true;
    if(!this.manifest) {const response=await fetch('data/anatomy/manifest.json');if(!response.ok)throw new Error(`Anatomy manifest: HTTP ${response.status}`);this.manifest=await response.json();}
    if(revision!==this.revision)return false;
    const matches=matchAnatomy(this.manifest,data.neurons);
    this.available=matches.length;this.rebuild();
    this.container.dispatchEvent(new CustomEvent('anatomy-status',{bubbles:true,detail:{available:matches.length,total:data.neurons.length,status:this.manifest.status}}));
    return true;
  }
  async setMode(mode) {
    const revision=++this.revision;
    if(mode==='topology'){if(this.software)this.renderer.setPixelRatio(1);this.mode=mode;this.rebuild();return;}
    const source=this.manifest.levels?.[this.detail]||this.manifest;
    const data=this.data,matches=matchAnatomy(source,data.neurons);
    if(!matches.length)throw new Error('No matching anatomical skeletons are bundled yet.');
    let skeletons;
    if(source.bundle){
      const key=source.bundle.file;
      if(!this.bundlePromises.has(key))this.bundlePromises.set(key,(async()=>{
        const response=await fetch(`data/anatomy/${key}`);
        if(!response.ok)throw new Error(`Anatomy bundle: HTTP ${response.status}`);
        const buffer=await response.arrayBuffer();
        if(buffer.byteLength!==source.bundle.bytes)throw new Error('Incomplete anatomy bundle');
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==source.bundle.sha256)throw new Error('Anatomy bundle checksum mismatch');
        return decodeSkeletonBundle(buffer,source.neurons);
      })().catch(error=>{this.bundlePromises.delete(key);throw error;}));
      const decoded=await this.bundlePromises.get(key);skeletons=matches.map(item=>decoded.get(item.id));
    }else{
      const pending=matches.filter(item=>!this.skeletonCache.has(item.id));let cursor=0;
      await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
        while(cursor<pending.length){const item=pending[cursor++];const response=await fetch(`data/anatomy/${item.file}`);if(!response.ok)throw new Error(`Skeleton ${item.id}: HTTP ${response.status}`);this.skeletonCache.set(item.id,validateSkeleton(await response.json(),item.id));}
      }));
      skeletons=matches.map(item=>this.skeletonCache.get(item.id));
    }
    if(revision!==this.revision||data!==this.data)return;
    this.skeletons=skeletons;if(this.software)this.renderer.setPixelRatio(this.detail==='overview'?.8:1);this.mode='anatomy';this.showEdges=Boolean(this.options.diff);this.rebuild();this.home();
  }
  material(opacity=1){return new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity,depthWrite:false});}
  rebuild(){
    if(!this.data||!this.colors)return;
    this.dirty=true;this.clear(this.nodes);this.clear(this.lines);
    const n=this.data.neurons.length;this.stateValues=new Float32Array(n*4);
    this.neuronRanges=new Array(n);this.baseColors=this.data.neurons.map(neuron=>{
      // Stable per-neuron grading is cosmetic, never a new biological measurement.
      const color=new THREE.Color(this.colors[families.indexOf(familyOf(neuron))]);
      const seed=Number(BigInt(neuron.id)%97n)/96;
      return color.offsetHSL((seed-.5)*.035,(seed-.5)*.06,(seed-.5)*.07);
    });
    this.positions=topologyPositions(this.data.neurons);this.present=new Set();this.geometryOwners=[];
    const segmentCount=this.mode==='anatomy'?this.skeletons.reduce((sum,s)=>sum+edgeCount(s),0):0;
    const xyz=new Float32Array(segmentCount*6),rgba=new Uint8Array(segmentCount*8);
    this.geometryOwners=new Uint32Array(segmentCount);let segment=0;
    this.scene.background=new THREE.Color(this.mode==='anatomy'&&new THREE.Color(this.palette.surface).getHex()<0x555555?'#05090e':this.palette.surface);
    this.scene.fog=this.mode==='anatomy'?new THREE.FogExp2(this.scene.background,.11):null;
    this.fitRadius=1.3;
    if(this.mode==='anatomy'){
      const normalized=normalizeSkeletons(this.skeletons),indices=new Map(this.data.neurons.map((neuron,i)=>[neuron.id,i]));
      this.halfExtents=normalized.size.map(value=>value/2);
      let radiusSquared=0;
      for(const skeleton of this.skeletons){
        const i=indices.get(skeleton.id),count=vertexCount(skeleton),mean=[0,0,0],color=new THREE.Color(this.colors[families.indexOf(familyOf(this.data.neurons[i]))]);
        this.present.add(i);this.neuronRanges[i]={start:segment*2,count:edgeCount(skeleton)*2};
        for(let v=0;v<count;v++){const p=vertexAt(skeleton,v);let distance=0;for(let k=0;k<3;k++){mean[k]+=p[k]/count;const value=(p[k]-normalized.center[k])*normalized.scale;distance+=value*value;}radiusSquared=Math.max(radiusSquared,distance);}
        this.positions[i]=normalized.transform(mean);
        for(let e=0;e<edgeCount(skeleton);e++){
          const pair=edgeAt(skeleton,e);
          for(let endpoint=0;endpoint<2;endpoint++){
            const point=vertexAt(skeleton,pair[endpoint]),offset=segment*6+endpoint*3;
            for(let k=0;k<3;k++)xyz[offset+k]=(point[k]-normalized.center[k])*normalized.scale;
            const colorOffset=segment*8+endpoint*4;rgba[colorOffset]=Math.round(color.r*255);rgba[colorOffset+1]=Math.round(color.g*255);rgba[colorOffset+2]=Math.round(color.b*255);rgba[colorOffset+3]=255;
          }
          this.geometryOwners[segment++]=i;
        }
      }
      this.fitRadius=Math.sqrt(radiusSquared);
    }else for(let i=0;i<n;i++)this.present.add(i);
    if(segmentCount){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(xyz,3));geometry.setAttribute('color',new THREE.BufferAttribute(rgba,4,true).setUsage(THREE.DynamicDrawUsage));this.skeletonLines=new THREE.LineSegments(geometry,this.material(this.detail==='full'?.57:.74));this.nodes.add(this.skeletonLines);}else this.skeletonLines=null;
    // Small selectable markers indicate neuron anchors, not reconstructed somata.
    const markerGeometry=new THREE.BufferGeometry();markerGeometry.setAttribute('position',new THREE.Float32BufferAttribute(this.positions.flat(),3));markerGeometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(n*3),3));markerGeometry.setAttribute('pointSize',new THREE.Float32BufferAttribute(new Float32Array(n),1));
    const markerMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{viewportScale:{value:this.renderer.domElement.height/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)))}},vertexShader:`attribute vec3 color;attribute float pointSize;uniform float viewportScale;varying vec3 tint;varying float visibility;void main(){visibility=step(0.00001,pointSize);tint=color;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=pointSize>0.0?clamp(pointSize*viewportScale/-mv.z,1.0,64.0):0.0;}`,fragmentShader:`varying vec3 tint;varying float visibility;void main(){if(visibility<0.5)discard;float radius=length(gl_PointCoord-vec2(0.5));if(radius>0.5)discard;gl_FragColor=vec4(tint,exp(-radius*radius*12.0));
#include <colorspace_fragment>
}`});
    this.markers=new THREE.Points(markerGeometry,markerMaterial);
    this.container.dataset.mode=this.mode;this.container.dataset.neurons=String(this.present.size);this.container.dataset.segments=String(segmentCount);
    this.nodes.add(this.markers);this.color=new THREE.Color();this.buildConnections();this.updateActivity(this.activity);
  }
  buildConnections(){
    this.dirty=true;this.clear(this.lines);if(!this.data)return;
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
  setOptions(options){const previous=this.options?.diff;this.options=options;if(options.diff&&!previous)this.showEdges=true;else if(!options.diff&&previous&&this.mode==='anatomy')this.showEdges=false;if(this.data)this.buildConnections();}
  setFilter(family){this.family=family;this.updateActivity(this.activity);this.updateEdges();}
  select(index){this.selected=index;this.adjacent.clear();const e=this.data.edges;for(let k=0;k<e.w.length;k++){if(e.pre[k]===index)this.adjacent.add(e.post[k]);if(e.post[k]===index)this.adjacent.add(e.pre[k]);}this.updateActivity(this.activity);this.updateEdges();}
  updateActivity(activity){
    this.activity=activity;if(!this.data||!this.stateValues)return;
    let peak=0;for(let i=0;i<this.data.neurons.length;i++)if(familyOf(this.data.neurons[i])==='EPG')peak=Math.max(peak,activity?.[i]||0);
    const changed=[];
    for(let i=0;i<this.data.neurons.length;i++){
      const family=familyOf(this.data.neurons[i]),visible=this.present.has(i)&&(this.family==='all'||this.family===family)&&(this.isolated<0||i===this.isolated);
      const opacity=visible?(this.selected<0||i===this.selected?1:this.adjacent.has(i)?.18:.055):0;
      const intensity=family==='EPG'&&peak>0?Math.max(0,activity?.[i]||0)/peak:0;
      const values=[intensity,+(i===this.selected),+this.adjacent.has(i),opacity];let difference=false;
      for(let k=0;k<4;k++){if(Math.abs(this.stateValues[i*4+k]-values[k])>1e-5)difference=true;this.stateValues[i*4+k]=values[k];}
      if(difference)changed.push(i);
    }
    if(!changed.length)return;
    this.dirty=true;const attribute=this.skeletonLines?.geometry.getAttribute('color');
    for(const i of changed){
      const intensity=this.stateValues[i*4],visible=this.stateValues[i*4+3];
      this.color.copy(this.baseColors[i]);if(i===this.selected)this.color.set(this.palette.cue);else this.color.lerp(this.white,intensity*.25);
      this.markers.geometry.getAttribute('color').setXYZ(i,this.color.r,this.color.g,this.color.b);this.markers.geometry.getAttribute('pointSize').setX(i,visible?(this.mode==='anatomy'?.009:.055)*(1+intensity*1.7):0);
      const range=this.neuronRanges[i];
      if(attribute&&range){
        this.color.copy(this.baseColors[i]).lerp(this.white,Math.min(.65,intensity*.24+this.stateValues[i*4+1]*.55+this.stateValues[i*4+2]*.10));
        const r=Math.round(this.color.r*255),g=Math.round(this.color.g*255),b=Math.round(this.color.b*255),a=Math.round(visible*255);
        for(let vertex=range.start;vertex<range.start+range.count;vertex++){const offset=vertex*4;attribute.array[offset]=r;attribute.array[offset+1]=g;attribute.array[offset+2]=b;attribute.array[offset+3]=a;}
        attribute.addUpdateRange(range.start*4,range.count*4);
      }
    }
    if(attribute)attribute.needsUpdate=true;
    this.markers.geometry.getAttribute('color').needsUpdate=true;this.markers.geometry.getAttribute('pointSize').needsUpdate=true;
  }
  isolate(index){this.isolated=index;this.updateActivity(this.activity);this.updateEdges();if(index>=0)this.focusSelected();else this.home();}
  focusSelected(){if(this.selected<0||!this.positions?.[this.selected])return;const target=new THREE.Vector3(...this.positions[this.selected]);const direction=this.camera.position.clone().sub(this.controls.target).normalize();this.controls.target.copy(target);this.camera.position.copy(target).addScaledVector(direction,1.55);this.controls.update();this.dirty=true;}
  updateEdges(){
    if(!this.connections || !this.edgeColors)return;
    const attribute=this.connections.geometry.getAttribute('color');
    for(let k=0;k<this.edgePairs.length;k++){
      const [a,b]=this.edgePairs[k];
      const visible=this.present.has(a)&&this.present.has(b)&&(this.isolated<0||a===this.isolated||b===this.isolated)&&(this.family==='all'||(familyOf(this.data.neurons[a])===this.family&&familyOf(this.data.neurons[b])===this.family));
      const factor=visible?(this.selected<0||a===this.selected||b===this.selected?1:.1):0;
      for(let vertex=0;vertex<2;vertex++){const start=k*8+vertex*4;for(let component=0;component<3;component++)attribute.array[start+component]=this.edgeColors[start+component];attribute.array[start+3]=factor;}
    }
    attribute.needsUpdate=true;this.dirty=true;
  }

  pick(event){
    if(!this.stateValues||!this.data)return;
    const rect=this.renderer.domElement.getBoundingClientRect(),pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),ray=new THREE.Raycaster();ray.params.Line.threshold=.018;ray.params.Points.threshold=.025;ray.setFromCamera(pointer,this.camera);
    const hits=ray.intersectObjects([this.markers,...(this.skeletonLines?[this.skeletonLines]:[])]);
    for(const hit of hits){const index=hit.object===this.markers?hit.index:this.geometryOwners[Math.floor(hit.index/2)];if(index!==undefined&&this.stateValues[index*4+3]){this.select(index);this.onSelect(index);break;}}
  }
  selectionScreen(){if(this.selected<0||!this.positions?.[this.selected]||!this.stateValues?.[this.selected*4+3])return null;const point=new THREE.Vector3(...this.positions[this.selected]).project(this.camera);if(point.z < -1||point.z>1||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;const rect=this.container.getBoundingClientRect();return {x:(point.x+1)*rect.width/2,y:(1-point.y)*rect.height/2};}
  render(){this.controls.update();if(this.dirty){this.renderer.render(this.scene,this.camera);this.dirty=false;this.container.dispatchEvent(new Event('view-rendered'));}}
  dispose(){this.revision++;this.resizeObserver.disconnect();this.controls.dispose();this.clear(this.nodes);this.clear(this.lines);this.texture?.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
