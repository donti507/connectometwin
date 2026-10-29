// Redirect historical hash addresses to real documents; no in-page routing.
function redirectLegacyPage(){
 if(!/\/(?:index\.html)?$/.test(location.pathname))return;
 const target={story:'story.html',matrix:'matrix.html',neuron:'neuron.html',projection:'projection.html',circuit:'circuit.html'}[location.hash.slice(1)];
 if(target)location.replace(target+location.search);
}
window.addEventListener('hashchange',redirectLegacyPage);redirectLegacyPage();
