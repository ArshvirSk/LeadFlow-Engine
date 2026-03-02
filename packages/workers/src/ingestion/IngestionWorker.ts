import type { RawLeadJob, SourceAdapter } from '@leadflow/types';
import { QUEUE_NAMES } from '@leadflow/types';
import { Queue, Worker } from 'bullmq';
import { connection, makeQueue } from '../redis.js';

const INGESTION_QUEUE = 'ingestion.polls';
const CURSOR_KEY = (adapterId: string) => `ingestion:cursor:${adapterId}`;

interface PollJobData { adapterId: string }

export class IngestionWorker {
    private pollQueue: Queue<PollJobData>;
    private pollWorker: Worker<PollJobData>;
    private rawLeadsQueue: Queue<RawLeadJob>;
    private adapters = new Map<string, SourceAdapter>();

    constructor() {
        this.pollQueue = new Queue<PollJobData>(INGESTION_QUEUE, { connection });
        this.rawLeadsQueue = makeQueue<RawLeadJob>(QUEUE_NAMES.RAW_LEADS);

        this.pollWorker = new Worker<PollJobData>(
            INGESTION_QUEUE,
            async (job) => {
                const adapter = this.adapters.get(job.data.adapterId);
                if (!adapter) throw new Error(`Unknown adapter: ${job.data.adapterId}`);
                await this.runPoll(adapter);
            },
            { connection, concurrency: 3 }
        );

        this.pollWorker.on('failed', (job, err) => {
            console.error(`[ingestion] adapter ${job?.data.adapterId} failed:`, err.message);
        });
    }

    /** Register an adapter and schedule its repeatable BullMQ job */
    async register(adapter: SourceAdapter): Promise<void> {
        this.adapters.set(adapter.id, adapter);

        await this.pollQueue.add(
            adapter.id,
            { adapterId: adapter.id },
            {
                repeat: { pattern: adapter.schedule },
                // BullMQ uses the jobId to deduplicate repeatable jobs
                jobId: `ingestion_${adapter.id}`,
            }
        );

        console.log(`[ingestion] registered adapter: ${adapter.id} (${adapter.schedule})`);
    }

    /** Trigger a one-shot immediate poll (useful for initial seed on startup) */
    async triggerNow(adapterId: string): Promise<void> {
        await this.pollQueue.add(adapterId, { adapterId }, { priority: 1 });
    }

    async close(): Promise<void> {
        await this.pollWorker.close();
        await this.pollQueue.close();
        await this.rawLeadsQueue.close();
    }

    // ─── Private ───────────────────────────────────────────────────────────────

    private async runPoll(adapter: SourceAdapter): Promise<void> {
        // Read last cursor stored in Redis
        const cursor = await connection.get(CURSOR_KEY(adapter.id));

        let items = await adapter.poll();
        if (items.length === 0) return;

        // Filter out already-seen items (cursor-based dedup by rawId lexicographic order)
        if (cursor) {
            items = items.filter(item => item.rawId > cursor);
        }

        if (items.length === 0) {
            console.log(`[ingestion:${adapter.id}] no new items since cursor ${cursor}`);
            return;
        }

        let newestId = cursor ?? '';

        for (const item of items) {
            const partial = adapter.normalize(item);

            const job: RawLeadJob = {
                source: adapter.id,
                source_id: item.rawId,
                title: partial.title ?? (item.raw.title as string) ?? '',
                description: partial.description ?? (item.raw.description as string) ?? '',
                url: partial.url ?? (item.raw.url as string) ?? '',
                client_name: partial.client_name ?? undefined,
                client_url: partial.client_url ?? undefined,
                raw_data: item.raw,
                ingested_at: item.fetchedAt.toISOString(),
            };

            // Dedup: BullMQ will skip if a job with this ID already exists
            await this.rawLeadsQueue.add(item.rawId, job, {
                jobId: `${adapter.id}_${item.rawId}`,
            });

            if (item.rawId > newestId) newestId = item.rawId;
        }

        // Persist cursor
        if (newestId && newestId !== cursor) {
            await connection.set(CURSOR_KEY(adapter.id), newestId);
        }

        console.log(
            `[ingestion:${adapter.id}] polled ${items.length} items ` +
            `(cursor: ${cursor ?? 'none'} → ${newestId})`
        );
    }
}
