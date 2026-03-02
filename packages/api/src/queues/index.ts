import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@leadflow/types';
import type {
  RawLeadJob,
  NormalizationJob,
  ScoringJob,
  OutreachDraftJob,
  ScheduledSendJob,
  DebriefGenerationJob,
  BriefingGenerationJob,
  PortfolioEmbeddingJob,
  TriggerEventJob,
} from '@leadflow/types';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const isTLS = REDIS_URL.startsWith('rediss://');

export const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
  ...(isTLS ? { tls: {} } : {}),
});

connection.on('error', (err: Error) => {
  console.error('[redis] connection error', err.message);
});

const makeQueue = <T>(name: string) =>
  new Queue<T>(name, { connection, defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 } });

export const rawLeadsQueue = makeQueue<RawLeadJob>(QUEUE_NAMES.RAW_LEADS);
export const normalizedLeadsQueue = makeQueue<NormalizationJob>(QUEUE_NAMES.NORMALIZED_LEADS);
export const scoredLeadsQueue = makeQueue<ScoringJob>(QUEUE_NAMES.SCORED_LEADS);
export const outreachDraftsQueue = makeQueue<OutreachDraftJob>(QUEUE_NAMES.OUTREACH_DRAFTS);
export const scheduledSendsQueue = makeQueue<ScheduledSendJob>(QUEUE_NAMES.SCHEDULED_SENDS);
export const debriefQueue = makeQueue<DebriefGenerationJob>(QUEUE_NAMES.DEBRIEF_GENERATION);
export const briefingQueue = makeQueue<BriefingGenerationJob>(QUEUE_NAMES.BRIEFING_GENERATION);
export const portfolioEmbeddingsQueue = makeQueue<PortfolioEmbeddingJob>(QUEUE_NAMES.PORTFOLIO_EMBEDDINGS);
export const triggerEventsQueue = makeQueue<TriggerEventJob>(QUEUE_NAMES.TRIGGER_EVENTS);
