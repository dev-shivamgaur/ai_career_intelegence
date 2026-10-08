type Listener = (count: number) => void;

let pending = 0;
const listeners = new Set<Listener>();

function notify() {
  for (const fn of listeners) fn(pending);
}

export function beginQuery() {
  pending += 1;
  notify();
}

export function endQuery() {
  pending = Math.max(0, pending - 1);
  notify();
}

export function subscribeQueries(fn: Listener) {
  listeners.add(fn);
  fn(pending);
  return () => {
    listeners.delete(fn);
  };
}
