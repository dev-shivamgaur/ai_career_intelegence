export function delay(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function simulateProgress<T>(
  steps: T[],
  onStep: (step: T) => void,
  interval = 450,
): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    const tick = () => {
      onStep(steps[i]);
      i += 1;
      if (i >= steps.length) {
        resolve();
        return;
      }
      setTimeout(tick, interval);
    };
    tick();
  });
}
