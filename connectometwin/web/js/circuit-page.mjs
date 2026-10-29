import {$} from './elements.mjs';
import {explorerSnapshot} from './app.mjs';
import {families} from './view.mjs';
import {familyConnections,weightProfile} from './circuit-metrics.mjs';
import {text,updateShell} from './page-shell.mjs';
import {svgNode,linePlot} from './svg.mjs';
const roles={ER:'Visual input in the model',EPG:'Heading readout',PEN_a:'Angular pathway',PEN_b:'Angular pathway',PEG:'Recurrent pathway',Delta7:'Inhibitory pathway'};
let lastVersion='';
const color=family=>getComputedStyle(document.documentElement).getPropertyValue('--family-'+families.indexOf(family)).trim();
for(const id of ['profile-pre','profile-post']){$(id).replaceChildren(...families.map(f=>new Option(f,f)));$(id).value='EPG';$(id).addEventListener('change',drawProfile);}
function drawProfile(){
 const s=explorerSnapshot();if(!s.data)return;const profile=weightProfile(s.data,$('profile-pre').value,$('profile-post').value);
 linePlot($('weight-profile'),profile.bins.map(bin=>({x:bin.angle*180/Math.PI,y:bin.mean,count:bin.count})),{minX:-180,maxX:180,xLabel:'Postsynaptic minus presynaptic angle',yLabel:'Mean exported base weight',fit:profile.coefficients?angle=>profile.coefficients[0]+profile.coefficients[1]*Math.cos(angle)+profile.coefficients[2]*Math.sin(angle):null});
 text('profile-edges',profile.count.toLocaleString());text('profile-r2',profile.r2===null?'Not available':profile.r2.toFixed(3));
 text('weight-profile-note',`${$('profile-pre').value} → ${$('profile-post').value}: ${profile.count.toLocaleString()} known-angle directed edges; ${profile.missing.toLocaleString()} missing-angle edges excluded. These are exported base weights, before trained gains and the weight-scale control.`);
 text('weight-fit',profile.coefficients?`Descriptive fit: ${profile.coefficients[0].toFixed(5)} ${profile.coefficients[1]>=0?'+':'−'} ${Math.abs(profile.coefficients[1]).toFixed(5)} cos(Δθ) ${profile.coefficients[2]>=0?'+':'−'} ${Math.abs(profile.coefficients[2]).toFixed(5)} sin(Δθ)`:'A harmonic fit is unavailable: the selected edges do not span enough angular directions.');
}
function drawCircuit(){
 const s=explorerSnapshot();if(!s.data)return;const {matrix,counts}=familyConnections(s.data),layers=$('circuit-layers');layers.replaceChildren();
 for(const group of [['ER'],['EPG'],['PEN_a','PEN_b'],['PEG'],['Delta7']]){
  const row=document.createElement('div');row.className='circuit-layer';
  for(const family of group){const i=families.indexOf(family),card=document.createElement('div');card.className='circuit-node';card.style.setProperty('--node-color',color(family));const title=document.createElement('strong');title.textContent=family;const role=document.createElement('span');role.textContent=roles[family];const count=document.createElement('small');count.textContent=`${counts[i]} neurons · ${matrix[i].reduce((sum,cell)=>sum+cell.count,0).toLocaleString()} outgoing edges`;card.append(title,role,count);row.append(card);}
  layers.append(row);if(group[0]!=='Delta7'){const arrow=document.createElement('div');arrow.className='pathway-arrow';arrow.textContent='↓';layers.append(arrow);}
 }
 const svg=$('circuit-feedback');svg.replaceChildren();const points=[[350,45],[560,105],[560,245],[350,280],[140,245],[140,105]],max=Math.max(1e-9,...matrix.flat().map(cell=>cell.magnitude));
 const defs=svgNode('defs'),marker=svgNode('marker',{id:'circuit-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});marker.append(svgNode('path',{d:'M0 0L10 5L0 10Z',fill:'context-stroke'}));defs.append(marker);svg.append(defs);
 for(let i=0;i<6;i++)for(let j=0;j<6;j++){const cell=matrix[i][j];if(!cell.count)continue;const [x,y]=points[i],[xx,yy]=points[j];const path=svgNode('path',{d:i===j?`M${x-6} ${y-8} C${x-55} ${y-70},${x+55} ${y-70},${x+6} ${y-8}`:`M${x} ${y} Q350 160 ${xx} ${yy}`,fill:'none',stroke:color(families[i]),'stroke-width':.5+4*cell.magnitude/max,'stroke-opacity':.35,'marker-end':'url(#circuit-arrow)'});path.append(svgNode('title',{},`${families[i]} → ${families[j]}: ${cell.count} edges, sum |W| ${cell.magnitude.toFixed(5)}`));svg.append(path);}
 for(let i=0;i<6;i++){const [x,y]=points[i];svg.append(svgNode('circle',{cx:x,cy:y,r:7,fill:color(families[i])}),svgNode('text',{x:x+(x<350?-14:x>350?14:0),y:x===350?(y<160?y-17:y+24):y+4,'text-anchor':x<350?'end':x>350?'start':'middle',class:'plot-label'},families[i]));}
 drawProfile();
}
function refresh(){const s=explorerSnapshot();if(s.data?.version!==lastVersion){lastVersion=s.data?.version;drawCircuit();}updateShell();}
window.addEventListener('explorer-update',refresh);window.addEventListener('themechange',drawCircuit);refresh();

window.addEventListener('resize',drawProfile);
