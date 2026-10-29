import {explorerSnapshot} from './app.mjs';
import {$} from './elements.mjs';
export const pages={explore:'index.html',story:'story.html',matrix:'matrix.html',neuron:'neuron.html',projection:'projection.html',circuit:'circuit.html'};
export function pageLink(name,overrides={}){
 const s=explorerSnapshot(),query=new URLSearchParams();
 const settings={a:$('wiring').value,b:$('compare').value,mode:$('mode').value,network:$('model').value,cue:$('angle').value,scale:$('scale').value,dark:$('darkness').checked?'1':'0',refit:$('refit').checked?'1':'0',...overrides};
 const selected=s.selected>=0?s.data.neurons[s.selected].id:new URLSearchParams(location.search).get('neuron');if(selected&&/^\d+$/.test(selected))settings.neuron=selected;
 if(name==='story'){settings.chapter=Math.max(0,s.tourIndex);settings.filtering=s.filtering?'1':'0';}
 const detail=s.view?.detail||new URLSearchParams(location.search).get('detail');if(['full','overview'].includes(detail))settings.detail=detail;
 for(const [key,value] of Object.entries(settings))if(value!==undefined&&value!==null)query.set(key,String(value));
 return (pages[name]||pages.explore)+'?'+query;
}
export function navigate(name,overrides={}){location.assign(pageLink(name,overrides));}
export function updateLinks(){for(const link of document.querySelectorAll('[data-screen-link]'))link.href=pageLink(link.dataset.screenLink);}
updateLinks();window.addEventListener('explorer-update',updateLinks);window.addEventListener('neuron-selected',updateLinks);
