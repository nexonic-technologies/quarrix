// Per-key, in-memory safety limits. Keys are always scoped (an account, a
// guest, a client address); nothing here is a single site-wide counter, so one
// abusive client cannot use up everyone else's allowance.
export function keyedLimit(max, window, { maxKeys = 20000 } = {}) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now - entry.start >= window) {
      if (!entry && hits.size >= maxKeys) {
        // Drop expired windows first, then the oldest entry.
        for (const [k, v] of hits) if (now - v.start >= window) hits.delete(k);
        if (hits.size >= maxKeys) hits.delete(hits.keys().next().value);
      }
      entry = { start: now, count: 0 };
      hits.set(key, entry);
    }
    return ++entry.count <= max;
  };
}

// Keyed mutual exclusion: work for the same key runs one at a time, work for
// different keys runs concurrently. Replaces the old single global queue, where
// one slow database call stalled every user.
export function keyedLock() {
  const tails = new Map();
  return (key, fn) => {
    const previous = tails.get(key) || Promise.resolve();
    const run = previous.then(fn, fn);
    const tail = run.catch(() => {});
    tails.set(key, tail);
    tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return run;
  };
}

// Rejects when a promise takes longer than `ms`, so a hung dependency fails a
// single request instead of holding it open indefinitely.
export function withTimeout(promise, ms, message = "Operation timed out") {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(Error(message), { timeout: true })), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
