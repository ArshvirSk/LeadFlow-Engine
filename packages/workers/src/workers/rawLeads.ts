// Re-export the normalization worker (previously a stub, now fully implemented)
// The worker is instantiated in NormalizationWorker.ts and exported here for
// backwards-compatible import from workers/index.ts
export { normalizationWorker as rawLeadsWorker } from '../normalization/NormalizationWorker.js';
