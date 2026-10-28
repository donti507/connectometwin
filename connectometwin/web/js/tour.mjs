// Study results: new_study/results/stage4d_transplants.csv, noise level 0.5,
// neuron gains, seed 0. Kept separate from the rounded 16-heading demo exports.
export const study = {
  source: 'https://github.com/donti507/chessfly/blob/6441621435deb66780fee950914108bbeda3051e/new_study/results/stage4d_transplants.csv',
  own: 8.540022, detector: 84.110940, detectorRefit: 15.585216,
  filtering: 20.234734, filteringRefit: 5.668445,
};
const degrees = value => `${value.toFixed(2)}°`;
const defaults = {a:'fafb', b:'fafb_buhmann', mode:'own', network:'noise', scalePercent:0,
  refit:false, darkness:true, angle:45, allEdges:false, diff:false, playing:false};

export function buildTour(reference, refits, diffs, filtering = false) {
  const own = reference.own['fafb|noise'].error;
  const transfer = reference.transplant['fafb__fafb_buhmann|noise'];
  const detector = refits.fafb__fafb_buhmann;
  const filter = refits.mcns__mcns_neuprint;
  const diff = diffs.fafb__fafb_buhmann;
  return [
    {title:'Same fly. Two synapse detectors.', caption:'Princeton and Buhmann detect synapses in the same FlyWire brain. The neurons are the same; the reconstructed connections differ.', settings:{...defaults}},
    {title:'See the connections that change.', caption:`Princeton → Buhmann: ${diff.added.length.toLocaleString('en-US')} added, ${diff.removed.length.toLocaleString('en-US')} removed and ${diff.changed.length.toLocaleString('en-US')} changed connections. Changed means a weight ratio above 1.5× in either direction.`, settings:{...defaults,diff:true}},
    {title:'On its own wiring, the network remembers.', caption:`Train and test on Princeton wiring. After the cue disappears, this noise-trained network holds a heading: ${degrees(own)} mean error in the demo.`, settings:{...defaults,playing:true}},
    {title:'Change the detector. Lose the heading.', caption:`Keep the same trained network, but use Buhmann connections. Error jumps from ${degrees(own)} to ${degrees(transfer)}—about 85°. These are two reconstructions of the same fly.`, settings:{...defaults,mode:'transplant',playing:true}},
    filtering ? {
      title:'Filtering-only differences can be repaired.',
      caption:`Male CNS: change only the filtering pipeline, then refit ${filter.types.length} cell-type gains. Demo error falls from ${degrees(filter.error_zero_shot)} to ${degrees(filter.error_after_refit)}; its own-wiring error is ${degrees(reference.own['mcns|noise'].error)}.`,
      settings:{...defaults,a:'mcns',b:'mcns_neuprint',mode:'transplant',refit:true,playing:true},
    } : {
      title:'A small refit helps only partly.',
      caption:`The study refits about 30 cell-type gains. This FlyWire example has ${detector.types.length}: error falls from ${degrees(transfer)} to ${degrees(detector.error_after_refit)}, still above ${degrees(own)} on its own wiring. Try the filtering-only example below.`,
      settings:{...defaults,mode:'transplant',refit:true,playing:true},
    },
  ];
}
