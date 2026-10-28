/** Cache in-flight requests as well as results; failed loads remain retryable. */
export function createWiringLoader(load, compile) {
  const pending = new Map();
  return version => {
    if (!pending.has(version)) {
      pending.set(version, Promise.resolve().then(() => load(version))
        .then(data => ({data, compiled: compile(data)}))
        .catch(error => { pending.delete(version); throw error; }));
    }
    return pending.get(version);
  };
}
