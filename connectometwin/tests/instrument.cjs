// Run against the static web/ server: NODE_PATH=<playwright location> node tests/instrument.cjs
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.CONNECTOMETWIN_URL || 'http://127.0.0.1:8000';
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'dark'});
  const errors=[], requests=[];
  page.on('pageerror', error=>errors.push(error.message));
  page.on('request', request=>requests.push(request.url()));
  await page.goto(base);
  await page.waitForFunction(()=>document.body.dataset.three==='ready' && document.body.dataset.benchmark==='ready');
  await page.locator('#play').click();
  await page.locator('.viewer-settings summary').click();
  assert.equal(await page.locator('.family-chip').count(),6);
  assert.equal(await page.locator('#viewer-error').textContent(),await page.locator('#current-error').textContent());
  await page.locator('#show-diff').check();
  await page.waitForFunction(()=>!document.getElementById('wiring-difference').hidden);
  const originalCounts=(await page.locator('#diff-note').textContent()).match(/([\d,]+) added, ([\d,]+) removed, ([\d,]+) changed/);
  for(const [index,id] of ['added-count','removed-count','changed-count'].entries()) assert.equal(await page.locator('#'+id).textContent(),originalCounts[index+1]);
  await page.locator('#show-diff').uncheck();
  assert.equal(await page.locator('#wiring-difference').isVisible(),false);
  const focus=page.getByRole('button',{name:'Focus EPG neurons in 3D',exact:true});
  await focus.click();
  assert.equal(await page.locator('#three-family').inputValue(),'EPG');
  assert.equal(await focus.getAttribute('aria-pressed'),'true');
  await focus.click();assert.equal(await page.locator('#three-family').inputValue(),'all');
  await page.locator('#three-family').selectOption('PEG');
  assert.equal(await page.getByRole('button',{name:'Focus PEG neurons in 3D',exact:true}).getAttribute('aria-pressed'),'true');
  await page.locator('#three-family').selectOption('all');
  await page.locator('#three-wrap canvas').focus();await page.keyboard.press(']');
  assert.match(await page.locator('#neuron-details').textContent(),/Neuron 1 of 433/);
  const layout=await page.evaluate(()=>{
   const r=selector=>document.querySelector(selector).getBoundingClientRect();
   return {viewer:r('.network-panel').x,controls:r('.experiment-panel').x,telemetry:r('.right-column').y,telemetryX:r('.right-column').x,viewerBottom:r('.network-panel').bottom};
  });
  assert.ok(layout.telemetryX>layout.viewer && Math.abs(layout.viewer-layout.controls)<1);
  if(await page.locator('#viewer-fullscreen').isVisible()) {
   await page.locator('#viewer-fullscreen').click();
   await page.waitForFunction(()=>!!document.fullscreenElement && document.getElementById('viewer-fullscreen').getAttribute('aria-label')==='Exit fullscreen viewer');
   assert.equal(await page.locator('#viewer-fullscreen').getAttribute('aria-label'),'Exit fullscreen viewer');
   await page.locator('#viewer-fullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);
  }
  await page.locator('#story-link').click();
  await page.waitForFunction(()=>!document.getElementById('tour-exit').hidden && document.body.dataset.benchmark==='ready');
  assert.match(await page.locator('#tour-progress').textContent(),/1/);
  await page.locator('#tour-exit').click();
  for(const theme of ['light','dark']) {
   await page.locator('#theme').selectOption(theme);
   for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme} overflow at ${width}`);
    assert.ok(await page.locator('.network-wrap').evaluate(el=>el.getBoundingClientRect().height>=250));
   }
  }
  await page.locator('#view-ring').click();
  assert.equal(await focus.isDisabled(),true);
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(url=>new URL(url).origin===new URL(base).origin),'All runtime assets stay local');
  console.log('PASS: instrument layout, real family filters and inspector, fullscreen, guided navigation, 320–1440px light/dark layouts, ring fallback, local-only runtime.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
