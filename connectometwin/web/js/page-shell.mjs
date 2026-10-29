import {$} from './elements.mjs';
import {explorerSnapshot} from './app.mjs';
import {updateLinks} from './navigation.mjs';
export const text=(id,value)=>{const el=$(id);if(el.textContent!==String(value))el.textContent=String(value);};
const names={projection:'Orthogonal projection',circuit:'Compass circuit wiring'};
text('screen-subtitle',names[document.body.dataset.page]);
export function updateShell(){const s=explorerSnapshot();if(!s.data)return;text('dataset-badge',s.data.fly==='FlyWire'?'FLYWIRE v783':s.data.fly);text('roi-name',`${s.data.fly.toUpperCase()} / CENTRAL COMPLEX`);updateLinks();for(const button of document.querySelectorAll('[data-playback=play]'))button.textContent=$('play').textContent;}
window.addEventListener('explorer-update',updateShell);updateShell();

for(const button of document.querySelectorAll('[data-playback]'))button.addEventListener('click',()=>$(''+button.dataset.playback).click());
