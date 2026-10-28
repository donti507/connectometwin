/** Sparse presynaptic-row CSR model. Float64 buffers preserve exported precision. */
export function compileWiring(data) {
  const n = data.neurons.length;
  const row = new Uint32Array(n + 1);
  const {pre, post, w} = data.edges;
  for (const i of pre) row[i + 1]++;
  for (let i = 1; i <= n; i++) row[i] += row[i - 1];
  const cursor = row.slice();
  const column = new Uint32Array(w.length), weight = new Float64Array(w.length);
  for (let k = 0; k < w.length; k++) {
    const j = cursor[pre[k]]++;
    column[j] = post[k]; weight[j] = w[k];
  }
  const masks = Object.fromEntries(['ER', 'PEN', 'EPG'].map(prefix =>
    [prefix, Float64Array.from(data.neurons, neuron => +neuron.family.startsWith(prefix))]));
  return {n, row, column, weight, masks, neurons: data.neurons};
}

/** Copy parameters through a target-to-source map, optionally adding target-type gains. */
export function transplant(net, map, neurons, refit = null) {
  const offsets = new Map(refit?.types.map((type, i) => [type, refit.offset_per_type[i]]));
  if (refit && neurons.some(neuron => !offsets.has(neuron.type))) {
    throw new Error('Refit is missing a target neuron type');
  }
  return {
    g: Float64Array.from(map, (i, j) => net.g[i] + (offsets.get(neurons[j].type) ?? 0)),
    Wc: net.Wc.map(row => Float64Array.from(map, i => row[i])),
    bc: Float64Array.from(map, i => net.bc[i]),
    bv: Float64Array.from(map, i => net.bv[i]),
    R: Array.from(map, i => Float64Array.from(net.R[i])),
    r: Float64Array.from(net.r),
  };
}

export const wrapped = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Stateful single-heading engine; step() returns activity and decoded heading. */
export class Simulation {
  constructor(wiring, net, {theta = 0, scale = 1, cueSteps = 5} = {}) {
    this.wiring = wiring; this.net = net;
    this.theta = theta; this.cueSteps = cueSteps;
    this.h = new Float64Array(wiring.n);
    this.next = new Float64Array(wiring.n);
    this.weight = new Float64Array(wiring.weight.length);
    for (let i = 0; i < wiring.n; i++) {
      for (let k = wiring.row[i]; k < wiring.row[i + 1]; k++) {
        this.weight[k] = wiring.weight[k] * scale * Math.exp(net.g[i]);
      }
    }
    this.t = 0;
  }
  reset(theta = this.theta) { this.theta = theta; this.h.fill(0); this.t = 0; }
  step() {
    const {n, row, column, masks} = this.wiring;
    const {Wc, bc, bv, R, r} = this.net;
    const cue = this.t < this.cueSteps;
    const c = Math.cos(this.theta), s = Math.sin(this.theta);
    for (let micro = 0; micro < 2; micro++) {
      for (let i = 0; i < n; i++) {
        const u = (bc[i] + (cue ? c * Wc[0][i] + s * Wc[1][i] + Wc[2][i] : 0)) * masks.ER[i] + bv[i] * masks.PEN[i];
        this.next[i] = 0.5 * this.h[i] + 0.5 * u;
      }
      for (let i = 0; i < n; i++) {
        const activity = 0.5 * Math.max(0, this.h[i]);
        for (let k = row[i]; k < row[i + 1]; k++) this.next[column[k]] += activity * this.weight[k];
      }
      [this.h, this.next] = [this.next, this.h];
    }
    let x = r[0], y = r[1];
    for (let i = 0; i < n; i++) {
      const activity = Math.max(0, this.h[i]) * masks.EPG[i];
      x += activity * R[i][0]; y += activity * R[i][1];
    }
    return {t: this.t++, heading: Math.atan2(y, x), activity: this.h};
  }
}

export function simulate(wiring, net, theta, options = {}) {
  const decoded = [], errors = [];
  for (const angle of theta) {
    const simulation = new Simulation(wiring, net, {...options, theta: angle});
    const trace = new Float64Array(40);
    for (let t = 0; t < 40; t++) {
      trace[t] = simulation.step().heading;
      if (t >= 5) errors.push(Math.abs(wrapped(trace[t] - angle)) * 180 / Math.PI);
    }
    decoded.push(trace);
  }
  return {decoded, error: errors.reduce((sum, e) => sum + e, 0) / errors.length};
}
