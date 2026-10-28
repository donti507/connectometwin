import {simulate} from './engine.mjs';
self.onmessage = ({data}) => {
  try {
    self.postMessage({error:simulate(data.wiring,data.net,data.theta,data.options).error});
  } catch (error) { self.postMessage({failure:error.message}); }
};
