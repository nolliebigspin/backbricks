import type { Challenge, Solution } from './pow.ts';

function solveInWorker(challenge: Challenge, signal?: AbortSignal): Promise<Solution> {
  signal?.throwIfAborted();
  const worker = new Worker(new URL('./pow-worker.js', import.meta.url), { type: 'module' });
  return new Promise<Solution>((resolve, reject) => {
    function dispose() {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    }
    function abort() {
      dispose();
      reject(signal?.reason);
    }
    signal?.addEventListener('abort', abort, { once: true });
    worker.addEventListener(
      'error',
      () => {
        dispose();
        reject(new Error('The proof-of-work worker could not start.'));
      },
      { once: true },
    );
    worker.addEventListener(
      'message',
      (event: MessageEvent<{ solution?: Solution }>) => {
        dispose();
        if (event.data.solution) resolve(event.data.solution);
        else reject(new Error('The proof-of-work worker could not solve the challenge.'));
      },
      { once: true },
    );
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- A dedicated Worker has no window origin parameter.
    worker.postMessage(challenge);
  });
}

/** The site gets a separate worker asset. Server runtimes load the solver only on demand. */
export async function solveProof(challenge: Challenge, signal?: AbortSignal) {
  if ('window' in globalThis && typeof Worker !== 'undefined') {
    try {
      return await solveInWorker(challenge, signal);
    } catch {
      signal?.throwIfAborted();
    }
  }
  const { solveChallenge } = await import('./pow.ts');
  return solveChallenge(challenge, { signal });
}
