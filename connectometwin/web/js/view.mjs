export const families = ['EPG', 'PEN_a', 'PEN_b', 'PEG', 'Delta7', 'ER'];
export const colors = ['#68e0bd', '#7faff0', '#b39aef', '#e7be79', '#e895a5', '#98a99e'];
export const familyOf = neuron => neuron.family.startsWith('EPG') ? 'EPG' : families.includes(neuron.family) ? neuron.family : 'ER';

export function layout(neurons, width, height) {
  const maxRadius = Math.max(1, Math.min(width, height) / 2 - 36);
  const missing = new Map(families.map(f => [f, neurons.filter(n => familyOf(n) === f && !Number.isFinite(n.angle))]));
  return neurons.map(neuron => {
    const family = familyOf(neuron), ring = families.indexOf(family);
    const fallback = !Number.isFinite(neuron.angle);
    const group = missing.get(family);
    const angle = fallback ? 2 * Math.PI * group.indexOf(neuron) / group.length : neuron.angle;
    const radius = maxRadius * (0.30 + ring * 0.135);
    return {x: width / 2 + radius * Math.cos(angle), y: height / 2 - radius * Math.sin(angle), family, fallback, ring};
  });
}

export function strongestEdges(edges, all = false, limit = 1200) {
  const ids = Array.from(edges.w, (_, i) => i);
  if (!all) ids.sort((a, b) => Math.abs(edges.w[b]) - Math.abs(edges.w[a]));
  return all ? ids : ids.slice(0, limit);
}

/** diffs are stored in one orientation; reverse added/removed and invert ratios. */
export function orientedDiff(diffs, from, to) {
  const forward = diffs[`${from}__${to}`];
  if (forward) return forward;
  const reverse = diffs[`${to}__${from}`];
  return reverse ? {...reverse, added: reverse.removed, removed: reverse.added,
    changed_ratio: reverse.changed_ratio.map(ratio => 1 / ratio)} : null;
}
export const ratioWidth = ratio => Math.min(5, 0.65 + Math.abs(Math.log(ratio)) * 1.7);
