const media = matchMedia('(prefers-color-scheme: dark)');
let preference = 'system';
try { preference = localStorage.getItem('connectometwin-theme') || 'system'; } catch { /* Private browsing may restrict storage. */ }
if (!['system','light','dark'].includes(preference)) preference = 'system';
const selector = document.getElementById('theme');
function apply() {
  document.documentElement.dataset.theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
  if (selector) selector.value = preference;
  window.dispatchEvent(new Event('themechange'));
}
selector?.addEventListener('change', () => {
  preference = selector.value;
  try { localStorage.setItem('connectometwin-theme',preference); } catch { /* Theme still applies for this page. */ }
  apply();
});
media.addEventListener('change',apply); apply();
