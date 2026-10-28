// Optional UI integration check: requires Playwright and Chromium, no app build.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', request => requests.push(request.url()));
    const base = process.env.CONNECTOMETWIN_URL || 'http://127.0.0.1:8000';
    await page.goto(base);
    await page.waitForFunction(() => document.getElementById('load-state').textContent.includes('7 wirings'));
    assert.equal(await page.locator('#wiring option').count(),7);
    assert.equal(await page.locator('#compare option').count(),7);
    const frames = await page.evaluate(async () => {
      const context = document.getElementById('network').getContext('2d');
      const original = context.drawImage; let count = 0;
      context.drawImage = function (...args) { count++; return original.apply(this,args); };
      const start = performance.now();
      await new Promise(resolve=>setTimeout(resolve,1000));
      context.drawImage = original;
      return count / ((performance.now()-start)/1000);
    });
    assert.ok(frames >= 25, `Canvas refresh rate too low: ${frames.toFixed(1)} fps`);
    console.log(`Live Canvas refresh: ${frames.toFixed(1)} fps`);
    await page.screenshot({path:'/tmp/connectometwin-default.png',fullPage:true});
    await page.getByRole('button',{name:'Pause',exact:true}).click();
    const paused = await page.locator('#step-number').textContent();
    await page.waitForTimeout(250); assert.equal(await page.locator('#step-number').textContent(),paused);
    await page.locator('#show-diff').check();
    assert.match(await page.locator('#diff-note').textContent(), /3,470 added, 1,759 removed/);
    await page.locator('#all-edges').check();
    assert.match(await page.locator('#connection-note').textContent(),/16,741 \/ 16,741/);
    assert.match(await page.locator('#diff-note').textContent(),/10,789 \/ 10,789/);
    await page.screenshot({path:'/tmp/connectometwin-desktop.png',fullPage:true});
    await page.locator('#wiring').selectOption('fafb_buhmann');
    await page.locator('#compare').selectOption('fafb');
    await page.locator('#show-diff').check();
    assert.match(await page.locator('#diff-note').textContent(),/1,759 added, 3,470 removed/);
    for (const wiring of ['mcns','mcns_neuprint','hemibrain','banc','fafb_unfiltered','fafb']) {
      await page.locator('#wiring').selectOption(wiring);
      assert.ok(await page.locator('#neuron-count').textContent());
      if (['hemibrain','banc'].includes(wiring)) {
        assert.equal(await page.locator('#show-diff').isDisabled(),true);
        assert.equal(await page.locator('#compare').isDisabled(),false);
      }
    }
    await page.locator('#all-edges').uncheck();
    await page.locator('#angle').fill('-90');
    await page.locator('#model').selectOption('clean');
    await page.getByRole('button',{name:'Restart ↺'}).click();
    await page.waitForFunction(() => document.getElementById('cue-state').textContent === 'COMPLETE');
    assert.equal(await page.locator('#step-number').textContent(),'Step 39 / 39');
    const expected = await page.evaluate(async () => {
      const {compileWiring,simulate} = await import('./js/engine.mjs');
      const data = await (await fetch('data/fafb.json')).json();
      return simulate(compileWiring(data),data.nets.clean,[-Math.PI / 2]).error;
    });
    assert.ok(Math.abs(parseFloat(await page.locator('#mean-error').textContent())-expected)<0.01);
    assert.ok(await page.locator('#network').evaluate(canvas => {
      const ctx = canvas.getContext('2d'); const image = ctx.getImageData(0,0,canvas.width,canvas.height).data;
      return new Set(Array.from(image).filter((_,i) => i%4===0)).size>20;
    }));
    // Directed transplant, exported refit, clean knife-edge and cue controls.
    await page.locator('#compare').selectOption('fafb_buhmann');
    await page.locator('#model').selectOption('noise');
    await page.locator('#mode').selectOption('transplant');
    assert.equal(await page.locator('#refit').isDisabled(),false);
    assert.match(await page.locator('#run-description').textContent(),/Map and activity show wiring B/);
    const transplantReference = await page.evaluate(async()=> (await (await fetch('data/reference.json')).json()).transplant['fafb__fafb_buhmann|noise']);
    assert.ok(Math.abs(parseFloat(await page.locator('#benchmark-error').textContent())-transplantReference)<0.05);
    assert.ok(Math.abs(parseFloat(await page.locator('#reference-error').textContent())-transplantReference)<0.01);
    await page.locator('#refit').check();
    const refitReference = await page.evaluate(async()=> (await (await fetch('data/refits.json')).json()).fafb__fafb_buhmann.error_after_refit);
    assert.ok(Math.abs(parseFloat(await page.locator('#benchmark-error').textContent())-refitReference)<0.05);
    await page.waitForFunction(()=>document.getElementById('cue-state').textContent==='COMPLETE');
    const fitted = await page.evaluate(async()=>{
      const {compileWiring,simulate,transplant,wrapped} = await import('./js/engine.mjs');
      const load=async name=>(await fetch(`data/${name}.json`)).json();
      const [a,b,maps,refits]=await Promise.all(['fafb','fafb_buhmann','maps','refits'].map(load));
      const result=simulate(compileWiring(b),transplant(a.nets.noise,maps.fafb__fafb_buhmann,b.neurons,refits.fafb__fafb_buhmann),[-Math.PI/2]);
      return {mean:result.error,current:Math.abs(wrapped(result.decoded[0][39]+Math.PI/2))*180/Math.PI};
    });
    assert.ok(Math.abs(parseFloat(await page.locator('#mean-error').textContent())-fitted.mean)<0.01);
    assert.ok(Math.abs(parseFloat(await page.locator('#current-error').textContent())-fitted.current)<0.01);
    await page.locator('#compare').selectOption('banc');
    assert.equal(await page.locator('#refit').isDisabled(),true);
    assert.equal(await page.locator('#refit').isChecked(),false);
    assert.equal(await page.locator('#reference-error').textContent(),'Not available');
    await page.locator('#mode').selectOption('own');
    await page.locator('#model').selectOption('clean');
    assert.equal(await page.locator('#scale').isDisabled(),false);
    await page.locator('#scale').fill('1');
    assert.equal(await page.locator('#scale-value').textContent(),'+1.0%');
    const scaled = await page.evaluate(async()=> (await (await fetch('data/reference.json')).json()).scale['fafb|clean|1.01']);
    assert.ok(Math.abs(parseFloat(await page.locator('#benchmark-error').textContent())-scaled)<0.05);
    await page.locator('#darkness').uncheck();
    assert.equal(await page.locator('#reference-error').textContent(),'Not available');
    assert.match(await page.locator('#cue-note').textContent(),/all 40 steps/);
    await page.locator('#model').selectOption('noise');
    assert.equal(await page.locator('#scale').isDisabled(),true);
    assert.equal(await page.locator('#scale').inputValue(),'0');
    await page.locator('#darkness').check();
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
    await page.screenshot({path:'/tmp/connectometwin-mobile.png',fullPage:true});
    await page.goto(base+'/self-check.html');
    await page.getByRole('button',{name:'Run reference checks'}).click();
    await page.waitForFunction(() => document.body.dataset.result, null, {timeout:30000});
    assert.equal(await page.locator('body').getAttribute('data-result'),'pass');
    assert.match(await page.locator('#status').textContent(),/46\/46/);
    assert.deepEqual(errors,[]);
    assert.ok(requests.every(url=>new URL(url).origin === new URL(base).origin));
    console.log('PASS: Phase 4 transplant/refit/scaling/darkness modes, seven wirings, diff reversal, all edges, playback/reset, numerical run, Canvas rendering, mobile layout, 46 browser references; no external requests or browser errors.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
