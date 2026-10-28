import {transplant} from './engine.mjs';

/** Resolve UI choices once so playback, benchmarks and reference labels agree. */
export function configureRun(data, maps, refits, selection) {
  const {a, b, mode, network, darkness = true} = selection;
  const target = mode === 'transplant' ? b : a;
  const pair = `${a}__${target}`;
  const refitAvailable = mode === 'transplant' && network === 'noise' && Boolean(refits[pair]);
  const refit = Boolean(selection.refit && refitAvailable);
  const scalePercent = network === 'clean' ? Number(selection.scalePercent || 0) : 0;
  const scale = Number((1 + scalePercent / 100).toFixed(3));
  const src = data[a].nets[network];
  let net = src;
  if (mode === 'transplant') {
    const map = a === target ? Array.from({length: data[target].neurons.length}, (_, i) => i) : maps[pair];
    if (!map) throw new Error(`No transplant map for ${pair}`);
    net = transplant(src, map, data[target].neurons, refit ? refits[pair] : null);
  }
  return {source:a, target, pair, mode, network, net, refit, refitAvailable, scalePercent,
    options:{scale, cueSteps:darkness ? 5 : 40}};
}

export function referenceFor(run, reference, refits) {
  if (run.options.cueSteps !== 5) return null;
  if (run.refit) return {value:refits[run.pair].error_after_refit, source:'refits.json · full refit'};
  if (run.options.scale !== 1) {
    if (run.mode === 'transplant' && run.source !== run.target) return null;
    const value = reference.scale[`${run.target}|${run.network}|${run.options.scale}`];
    return value === undefined ? null : {value,source:'reference.json · scaled weights'};
  }
  if (run.mode === 'own' || run.source === run.target) {
    const value = reference.own[`${run.target}|${run.network}`]?.error;
    return value === undefined ? null : {value,source:'reference.json · own wiring'};
  }
  const value = reference.transplant[`${run.pair}|${run.network}`];
  if (value !== undefined) return {value,source:'reference.json · transplant'};
  const zeroShot = run.network === 'noise' ? refits[run.pair]?.error_zero_shot : undefined;
  return zeroShot === undefined ? null : {value:zeroShot,source:'refits.json · zero-shot'};
}
