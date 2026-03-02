import type { LeadEmbeddingJob, PortfolioEmbeddingJob } from '@leadflow/types';
import { QUEUE_NAMES } from '@leadflow/types';
import { Worker } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { getLLMProvider } from '../llm/LLMProviderFactory.js';
import { connection } from '../redis.js';
import { leads, portfolioPieces } from '../schema.js';

// Cosine similarity threshold for deduplication (L3-T06).
// pgvector <=> returns cosine *distance* (0 = identical, 2 = opposite),
// so similarity = 1 - distance.  We suppress anything ≥ 0.92 similarity.
const DEDUP_SIMILARITY_THRESHOLD = 0.92;
const DEDUP_WINDOW_DAYS = 30;

// ─── Portfolio embeddings ─────────────────────────────────────────────────────
export const portfolioEmbeddingsWorker = new Worker<PortfolioEmbeddingJob>(
    QUEUE_NAMES.PORTFOLIO_EMBEDDINGS,
    async (job) => {
        const { portfolio_piece_id, user_id } = job.data;
        job.log(`Generating embedding for portfolio piece ${portfolio_piece_id}`);

        const [piece] = await db
            .select({ title: portfolioPieces.title, description: portfolioPieces.description, outcomes: portfolioPieces.outcomes })
            .from(portfolioPieces)
            .where(eq(portfolioPieces.id, portfolio_piece_id))
            .limit(1);

        if (!piece) throw new Error(`Portfolio piece ${portfolio_piece_id} not found`);

        const text = [piece.title, piece.description, piece.outcomes].filter(Boolean).join(' ');
        const embeddings = await getLLMProvider().embed([text]);
        const embedding = embeddings[0] ?? [];

        await db
            .update(portfolioPieces)
            .set({ embedding, embedding_status: 'ready' })
            .where(eq(portfolioPieces.id, portfolio_piece_id));

        job.log(`Portfolio embedding stored (${embedding.length} dims) for user ${user_id}`);
        await job.updateProgress(100);
    },
    { connection, concurrency: 5 }
);

portfolioEmbeddingsWorker.on('failed', (job, err) => {
    console.error(`[portfolioEmbeddings] job ${job?.id} failed:`, err.message);
});

// ─── Lead embeddings (L2-T08) ─────────────────────────────────────────────────
// Generates a 1536-dim embedding for each normalized lead (title + description).
// Stored in leads.embedding for later pgvector similarity search (Phase 2 dedup,
// portfolio matching, boomerang detection).
export const leadEmbeddingsWorker = new Worker<LeadEmbeddingJob>(
    QUEUE_NAMES.LEAD_EMBEDDINGS,
    async (job) => {
        const { lead_id } = job.data;
        job.log(`Generating embedding for lead ${lead_id}`);

        const [lead] = await db
            .select({ title: leads.title, description: leads.description })
            .from(leads)
            .where(eq(leads.id, lead_id))
            .limit(1);

        if (!lead) throw new Error(`Lead ${lead_id} not found`);

        // Truncate description to ~800 chars — enough context, avoids token waste
        const text = `${lead.title}\n\n${lead.description.slice(0, 800)}`;
        const embeddings = await getLLMProvider().embed([text]);
        const embedding = embeddings[0] ?? [];

        if (embedding.length === 0) {
            job.log('Embedding provider returned empty vector — skipping store');
            return;
        }

        await db
            .update(leads)
            .set({ embedding })
            .where(eq(leads.id, lead_id));

        job.log(`Lead embedding stored (${embedding.length} dims)`);

        // ── L3-T06: 30-day cosine deduplication ────────────────────────────────
        // Compare against all non-duplicate leads ingested in the last 30 days.
        // If cosine similarity ≥ 0.92 we suppress the current lead so it never
        // reaches scoring — saves LLM calls and keeps the user feed clean.
        const vectorLiteral = `[${embedding.join(',')}]`;
        const dupeResult = await db.execute(sql`
            SELECT id, title,
                   1 - (embedding <=> ${sql.raw(vectorLiteral)}::vector) AS similarity
            FROM   leads
            WHERE  id         != ${lead_id}::uuid
              AND  status     != 'duplicate'
              AND  ingested_at > NOW() - INTERVAL '${sql.raw(String(DEDUP_WINDOW_DAYS))} days'
              AND  embedding  IS NOT NULL
            ORDER BY embedding <=> ${sql.raw(vectorLiteral)}::vector ASC
            LIMIT  1
        `);

        const dupe = dupeResult.rows[0] as { id: string; title: string; similarity: string } | undefined;
        if (dupe && Number(dupe.similarity) >= DEDUP_SIMILARITY_THRESHOLD) {
            await db
                .update(leads)
                .set({ status: 'duplicate' })
                .where(eq(leads.id, lead_id));
            job.log(
                `[dedup] Suppressed as near-duplicate of "${dupe.title}" (${dupe.id}) ` +
                `— similarity ${Number(dupe.similarity).toFixed(4)}`
            );
        }

        await job.updateProgress(100);
    },
    { connection, concurrency: 5 }
);

leadEmbeddingsWorker.on('failed', (job, err) => {
    console.error(`[leadEmbeddings] job ${job?.id} failed:`, err.message);
});
