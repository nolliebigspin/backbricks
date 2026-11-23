// JavaScript entry so webpack, Turbopack and Vite resolve the same worker URL.
import { bindProofWorker } from './worker-runtime.ts';

bindProofWorker();
