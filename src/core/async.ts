/**
 * Waits for `promise`, but at most `ms` milliseconds. On timeout or failure it gives `fallback`.
 * Used for VS Code values that may never arrive, such as the process ID of a stuck terminal.
 */
export function withTimeout<T, F>(promise: PromiseLike<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
