/// <reference lib="webworker" />

import { isChallenge } from './challenge.ts';
import { solveChallenge } from './pow.ts';

declare const self: DedicatedWorkerGlobalScope;

function send(value: unknown) {
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Dedicated worker messaging has no target origin.
  self.postMessage(value);
}

export function bindProofWorker() {
  self.addEventListener('message', (event) => {
    const challenge: unknown = event.data;
    if (!isChallenge(challenge)) {
      send({ error: true });
      return;
    }
    void solveChallenge(challenge).then(
      (solution) => send({ solution }),
      () => send({ error: true }),
    );
  });
}
