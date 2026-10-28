// Optional release checks; serve web/ first. Requires Playwright and Chromium.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.CONNECTOMETWIN_URL || 'http://127.0.0.1:8000';
const ready=page=>page.waitForFunction(()=>document.body.dataset.ready==='ready' && document.body.dataset.benchmark==='ready');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const context=await browser.newContext({viewport:{width:1366,height:1000},colorScheme:'light'});
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto(base);await ready(page);
  const wiringNames=['mcns','mcns_neuprint','hemibrain','fafb','fafb_unfiltered','fafb_buhmann','banc'];
  const wiringRequests=()=>requests.filter(url=>wiringNames.some(name=>new URL(url).pathname.endsWith(`/data/${name}.json`)));
  assert.deepEqual(wiringRequests().map(url=>new URL(url).pathname.split('/').at(-1)).sort(),['fafb.json','fafb_buhmann.json']);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  // The system preference can change live, and an explicit selection takes priority.
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.locator('#theme').selectOption('light');
  await page.reload();await ready(page);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.locator('#theme').selectOption('system');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  for(const theme of ['light','dark']) {
   await page.locator('#theme').selectOption(theme);
   const contrast=await page.evaluate(()=>{
    const s=getComputedStyle(document.documentElement);
    const luminance=hex=>{
     const v=hex.trim().slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);
     return v[0]*.2126+v[1]*.7152+v[2]*.0722;
    };
    const ratio=(a,b)=>{const x=luminance(s.getPropertyValue(a)),y=luminance(s.getPropertyValue(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    return [ratio('--text','--surface'),ratio('--muted-text','--surface'),ratio('--accent','--surface'),ratio('--cue','--surface')];
   });
   assert.ok(contrast.every(x=>x>=4.5),`${theme} text contrast: ${contrast}`);
   const pixel=await page.locator('#network').evaluate(canvas=>Array.from(canvas.getContext('2d').getImageData(0,0,1,1).data));
   await page.waitForTimeout(60);
   const expected=theme==='light'?[255,255,255]:[22,32,28];
   const actual=await page.locator('#network').evaluate(canvas=>Array.from(canvas.getContext('2d').getImageData(0,0,1,1).data));
   assert.deepEqual(actual.slice(0,3),expected);
  }
  // Native keyboard access and map details; shortcuts never steal range input keys.
  await page.locator('#network').focus();await page.keyboard.press('Home');
  assert.match(await page.locator('#neuron-details').textContent(),/Neuron 1 of/);
  await page.keyboard.press('ArrowRight');assert.match(await page.locator('#neuron-details').textContent(),/Neuron 2 of/);
  await page.keyboard.press('End');assert.match(await page.locator('#neuron-details').textContent(),/Neuron 433 of/);
  await page.keyboard.press('r');await ready(page);
  await page.keyboard.press('Space');assert.equal(await page.locator('#play').textContent(),'Play');
  await page.locator('#angle').focus();const angle=Number(await page.locator('#angle').inputValue());
  await page.keyboard.press('ArrowRight');await ready(page);assert.equal(Number(await page.locator('#angle').inputValue()),angle+1);
  const unnamed=await page.locator('input,select,button').evaluateAll(elements=>elements.filter(el=>!el.getAttribute('aria-label')&&!el.labels?.length&&!el.textContent.trim()).map(el=>el.id));
  assert.deepEqual(unnamed,[]);
  // Deliberately delay one wiring and select another: the latest selection must win.
  await page.route('**/data/hemibrain.json',async route=>{await new Promise(resolve=>setTimeout(resolve,250));await route.continue();});
  await page.evaluate(()=>{const select=document.getElementById('wiring');select.value='hemibrain';select.dispatchEvent(new Event('change'));select.value='banc';select.dispatchEvent(new Event('change'));});
  await ready(page);await page.waitForTimeout(350);
  assert.match(await page.locator('#run-description').textContent(),/BANC/);
  assert.equal(await page.locator('#neuron-count').textContent(),'419 neurons');
  await page.locator('#wiring').selectOption('fafb');await ready(page);
  const before=wiringRequests().filter(url=>url.endsWith('/fafb.json')).length;
  await page.locator('#wiring').selectOption('banc');await ready(page);
  await page.locator('#wiring').selectOption('fafb');await ready(page);
  assert.equal(wiringRequests().filter(url=>url.endsWith('/fafb.json')).length,before);
  for(const width of [320,390,768,1366]) {
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(120);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
  }
  // 4x CPU slowdown approximates a less powerful laptop; this is not a hardware measurement.
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.locator('#wiring').selectOption('mcns_neuprint');await ready(page);
  const sample=async()=>page.evaluate(async()=>{
   const context=document.getElementById('network').getContext('2d'),original=context.drawImage;
   const times=[];context.drawImage=function(...args){times.push(performance.now());return original.apply(this,args);};
   const start=performance.now();await new Promise(resolve=>setTimeout(resolve,1800));
   context.drawImage=original;
   const gaps=times.slice(1).map((t,i)=>t-times[i]).sort((a,b)=>a-b);
   return {fps:times.length/((performance.now()-start)/1000),p95:gaps[Math.floor(gaps.length*.95)]};
  });
  await page.locator('#reset').click();await ready(page);const normal=await sample();
  await page.locator('#all-edges').check();await page.locator('#reset').click();await ready(page);const all=await sample();
  console.log(`4x CPU, 1366px, 33,783-edge wiring: default ${normal.fps.toFixed(1)} fps / p95 ${normal.p95.toFixed(1)} ms; all edges ${all.fps.toFixed(1)} fps / p95 ${all.p95.toFixed(1)} ms`);
  assert.ok(normal.fps>=28 && normal.p95<70,JSON.stringify(normal));
  assert.ok(all.fps>=28 && all.p95<70,JSON.stringify(all));
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  // README image captures the real app, not a mock-up.
  await page.locator('#wiring').selectOption('fafb');await ready(page);await page.locator('#all-edges').uncheck();
  await page.locator('#theme').selectOption('dark');
  await page.locator('#reset').click();await ready(page);
  await page.waitForFunction(()=>parseInt(document.getElementById('step-number').textContent.slice(5))>=9);
  await page.locator('#play').click();
  await page.screenshot({path:process.env.SCREENSHOT_PATH || '/tmp/connectometwin-release.png',fullPage:true});
  await page.locator('#theme').selectOption('light');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  await page.screenshot({path:'/tmp/connectometwin-release-mobile.png',fullPage:true});
  const reduced=await browser.newPage({reducedMotion:'reduce',colorScheme:'light'});
  await reduced.goto(base);await ready(reduced);assert.equal(await reduced.locator('#play').textContent(),'Play');await reduced.close();
  assert.deepEqual(errors,[]);assert.ok(requests.every(url=>new URL(url).origin===new URL(base).origin));
  console.log('PASS: lazy requests/cache/latest-selection race; system/light/dark persistence and Canvas palettes; text contrast; keyboard details/shortcuts; named controls; 320–1366px layouts; reduced motion; offline assets; screenshot.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
