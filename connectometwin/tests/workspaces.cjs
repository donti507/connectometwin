const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
const base=process.env.CONNECTOMETWIN_URL||'http://127.0.0.1:8000';
const ready=p=>p.waitForFunction(()=>document.body.dataset.ready==='ready'&&document.body.dataset.benchmark==='ready');
const renderer=p=>p.waitForFunction(()=>document.body.dataset.three==='ready');
const names={explore:'index',story:'story',matrix:'matrix',neuron:'neuron',projection:'projection',circuit:'circuit'};
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'dark',acceptDownloads:true}),errors=[],requests=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
 const nav=async name=>{await p.evaluate(()=>window.__previousDocument=true);await p.locator(`.main-nav [data-screen-link=${name}]`).click();await p.waitForURL(url=>url.pathname.endsWith('/'+names[name]+'.html'));await ready(p);assert.equal(await p.evaluate(()=>!!window.__previousDocument),false,'Navigation must load a separate document');};
 await p.goto(base);await ready(p);await renderer(p);
 assert.equal(await p.locator('#screen-story,#screen-matrix,#screen-neuron').count(),0,'Explore must not bundle hidden pages');
 await p.locator('#quick-detail').click();await renderer(p);assert.ok(Number(await p.locator('#three-wrap').getAttribute('data-segments'))>500000);await p.locator('#quick-detail').click();await renderer(p);
 await p.locator('#mode').selectOption('transplant');await ready(p);assert.equal(await p.locator('#benchmark-error').textContent(),'85.47°');
 await p.locator('#refit').check();await ready(p);assert.equal(await p.locator('#benchmark-error').textContent(),'15.92°');
 await nav('matrix');await renderer(p);assert.equal(await p.locator('#tour-title,#detail-title,#screen-explore').count(),0);
 assert.equal(await p.locator('#refit').isChecked(),true,'Experiment settings survive real page navigation');
 const expected=await p.evaluate(async()=>{const {explorerSnapshot}=await import('./js/app.mjs');const {compareWirings}=await import('./js/metrics.mjs');const s=explorerSnapshot();return compareWirings(s.a,s.b,true);});
 assert.equal(Number((await p.locator('#net-delta').textContent()).replace(/,/g,'')),expected.net);assert.equal(await p.locator('#edge-overlap').textContent(),`${(expected.overlap*100).toFixed(1)}%`);
 await p.locator('#matrix-compare').selectOption('hemibrain');await ready(p);assert.equal(await p.locator('#edge-overlap').textContent(),'N/A');await p.locator('#matrix-compare').selectOption('fafb_buhmann');await ready(p);
 await p.locator('#simulate-comparison').click();await p.waitForURL('**/index.html?*');await ready(p);assert.equal(await p.locator('#benchmark-error').textContent(),'85.47°');
 await nav('story');await p.waitForFunction(()=>document.getElementById('tour-progress').textContent.includes('STEP 1'));
 await p.locator('#chapter-3').click();await ready(p);assert.equal(await p.locator('#story-demo-error').textContent(),'85.47°');await p.locator('#chapter-4').click();await ready(p);assert.equal(await p.locator('#story-demo-error').textContent(),'15.92°');
 await p.locator('#take-over').click();await p.waitForURL('**/index.html?*');await ready(p);assert.equal(await p.locator('#refit').isChecked(),true);
 await nav('neuron');await renderer(p);assert.match(await p.locator('#detail-id').textContent(),/720575/);
 const chosen=await p.locator('#detail-neuron').inputValue(),metric=await p.evaluate(async index=>{const {explorerSnapshot}=await import('./js/app.mjs');const {neuronMetrics}=await import('./js/metrics.mjs');return neuronMetrics(explorerSnapshot().data,+index);},chosen);
 assert.equal(Number((await p.locator('#detail-inputs').textContent()).replace(/,/g,'')),metric.incoming);assert.match(await p.locator('#detail-length').textContent(),/µm/);
 await p.locator('#isolate-neuron').click();assert.equal(await p.evaluate(async()=>{const {explorerSnapshot}=await import('./js/app.mjs');return explorerSnapshot().view.isolated;}),Number(chosen));await p.locator('#clear-isolation').click();
 const downloading=p.waitForEvent('download');await p.locator('#export-neuron').click();const download=await downloading,json=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.equal(json.id,metric.neuron.id);assert.equal(json.units,'micrometers');assert.equal(json.license,'CC-BY-4.0');assert.ok(json.vertices.length>0&&json.edges.length>0);
 await p.goBack();await ready(p);assert.equal(await p.locator('body').getAttribute('data-page'),'explore');
 await nav('projection');await p.locator('[data-playback=play]').click();
 assert.equal(await p.locator('.network-panel,#tour-title,#weight-matrix').count(),0);
 const profile=await p.evaluate(async()=>{const {explorerSnapshot}=await import('./js/app.mjs');const {activityProfile}=await import('./js/projection-metrics.mjs');const s=explorerSnapshot();return activityProfile(s.data.neurons,s.frame?.activity);});
 assert.equal(await p.locator('#bump-width').textContent(),profile.width===null?'Not available':`${profile.width.toFixed(1)}° FWHM`);assert.equal(await p.locator('#orthogonal-atlas path').count()>16,true);
 await p.locator('[data-plane=xy]').click();await p.waitForFunction(()=>document.getElementById('orthogonal-anatomy').dataset.mode==='anatomy');assert.equal(await p.locator('#orthogonal-anatomy').getAttribute('data-neurons'),'433');
 await p.locator('[data-plane=xz]').click();await p.waitForFunction(()=>document.getElementById('projection-note').textContent.startsWith('XZ orthographic'));
 await p.locator('#orthogonal-anatomy canvas').focus();await p.keyboard.press('ArrowRight');await p.keyboard.press('Home');
 const axes=await p.evaluate(async()=>{const {projectionSnapshot}=await import('./js/projection-page.mjs');return projectionSnapshot();});assert.equal(axes.pitch,Math.PI/2);assert.equal(axes.yaw,0);assert.deepEqual(axes.pan,[0,0]);
 await p.locator('[data-plane-zoom=in]').click();await p.locator('[data-plane-zoom=reset]').click();
 await nav('circuit');assert.equal(await p.locator('#circuit-layers .circuit-node').count(),6);
 const fit=await p.evaluate(async()=>{const {explorerSnapshot}=await import('./js/app.mjs');const {weightProfile}=await import('./js/circuit-metrics.mjs');return weightProfile(explorerSnapshot().data);});
 assert.equal(Number((await p.locator('#profile-edges').textContent()).replace(/,/g,'')),fit.count);assert.equal(await p.locator('#profile-r2').textContent(),fit.r2===null?'Not available':fit.r2.toFixed(3));
 await p.locator('#profile-pre').selectOption('ER');assert.equal(await p.locator('#profile-r2').textContent(),'Not available');assert.match(await p.locator('#weight-profile-note').textContent(),/missing-angle/);
 // Every address works directly on a static host, including narrow phones and light mode.
 for(const file of Object.values(names)){
  await p.goto(`${base}/${file}.html`);await ready(p);await p.locator('#theme').selectOption('light');
  for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:900});await p.waitForTimeout(80);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${file}/${width}`);}
  assert.ok(await p.locator('.screen').count()<=1);assert.equal(await p.locator('nav.main-nav a[aria-current=page]').count(),1);
 }
 assert.deepEqual(errors,[]);assert.ok(requests.every(url=>new URL(url).origin===new URL(base).origin));
 const fallback=await browser.newPage({viewport:{width:390,height:844},colorScheme:'dark'});const fallbackErrors=[];fallback.on('pageerror',e=>fallbackErrors.push(e.message));
 await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});
 await fallback.goto(base);await ready(fallback);await renderer(fallback);assert.equal(await fallback.locator('body').getAttribute('data-renderer'),'canvas-projection');assert.equal(await fallback.locator('#three-wrap').getAttribute('data-neurons'),'433');await fallback.locator('#three-wrap canvas').focus();await fallback.keyboard.press(']');assert.match(await fallback.locator('#neuron-details').textContent(),/Neuron 1 of 433/);assert.deepEqual(fallbackErrors,[]);await fallback.close();
 console.log('PASS: six independent static pages, real document navigation and query-state transfer; model references, matrix and neuron metrics, skeleton export, live projection/FWHM, exact-ID anatomical planes, measured weight profile/fit, direct URLs, browser history, 320–1440px layouts and no-WebGL anatomy.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
