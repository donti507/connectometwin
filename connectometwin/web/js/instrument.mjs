// Presentation only: scientific controls remain owned by app.mjs.
const $ = id => document.getElementById(id);
$('story-link').addEventListener('click', () => {
  if ($('tour-exit').hidden && !$('tour-next').disabled) $('tour-next').click();
});
const panel = document.querySelector('.network-panel');
const fullscreen = $('viewer-fullscreen');
if (!document.fullscreenEnabled) fullscreen.hidden = true;
fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await panel.requestFullscreen();
  } catch {
    $('three-status').hidden = false;
    $('three-status').textContent = 'Fullscreen is unavailable in this browser. The viewer remains available on this page.';
  }
});
document.addEventListener('fullscreenchange', () => {
  fullscreen.textContent = document.fullscreenElement ? '⤢ Exit fullscreen' : '⤢ Fullscreen';
  fullscreen.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen viewer' : 'Enter fullscreen viewer');
});
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

// Mirror existing text readouts; no new numerical calculations or datasets.
function syncReadouts() {
  $('viewer-error').textContent = $('current-error').textContent;
  const counts = $('diff-note').textContent.match(/([\d,]+) added, ([\d,]+) removed, ([\d,]+) changed/);
  $('wiring-difference').hidden = !$('show-diff').checked || !counts;
  if (counts) ['added-count','removed-count','changed-count'].forEach((id,index)=>$(id).textContent=counts[index+1]);
}
for (const id of ['current-error','diff-note']) new MutationObserver(syncReadouts).observe($(id), {childList:true,characterData:true,subtree:true});
$('show-diff').addEventListener('change', syncReadouts);
syncReadouts();
