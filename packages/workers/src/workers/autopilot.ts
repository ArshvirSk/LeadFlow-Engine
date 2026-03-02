/**
 * Autopilot Worker  (L4-T01)
 *
 * Consumes `scored.leads` jobs.  For each scored lead, if the owning user has
 * `autopilot_enabled = true` AND the lead's `ai_score` meets or exceeds their
 * configured threshold (default 70), the worker:
 *   1. Inserts a row in `approval_queue` (status = 'pending', 7-day TTL)
 *   2. Enqueues an `outreach.drafts` job so the LLM draft is generated immediately
 *
 * Idempotent: duplicate SCORED_LEADS events for the same lead+user pair are
 * handled via the `jobId` dedup key on the outreach queue and an existence check
 * on `approval_queue`.
 */
import type { OutreachDraftJob, ScoringJob } from '@leadflow/types';
import { QUEUE_NAMES } from '@leadflow/types';
import { Worker } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { connection, makeQueue } from '../redis.js';
import { approvalQueue, leadScores, userProfiles } from '../schema.js';

const outreachQueue = makeQueue<OutreachDraftJob>(QUEUE_NAMES.OUTREACH_DRAFTS);

export const autopilotWorker = new Worker<ScoringJob>(
    QUEUE_NAMES.SCORED_LEADS,
    async (job) => {
        const { lead_id, user_id } = job.data;

        // ── 1. Check profile ───────────────────────────────────────────────────
        const [profile] = await db
            .select({
                autopilot_enabled: userProfiles.autopilot_enabled,
                autopilot_rules: userProfiles.autopilot_rules,
            })
            .from(userProfiles)
            .where(eq(userProfiles.clerk_user_id, user_id))
            .limit(1);

        if (!profile?.autopilot_enabled) return;

        // ── 2. Fetch score ─────────────────────────────────────────────────────
        const [score] = await db
            .select({ ai_score: leadScores.ai_score })
            .from(leadScores)
            .where(and(eq(leadScores.lead_id, lead_id), eq(leadScores.user_id, user_id)))
            .limit(1);

        if (!score) return;

        // ── 3. Threshold check (default 70) ────────────────────────────────────
        const rules = profile.autopilot_rules as Record<string, unknown> | null;
        const threshold: number = typeof rules?.min_score_threshold === 'number'
            ? rules.min_score_threshold
            : 70;

        if (Number(score.ai_score) < threshold) return;

        // ── 4. Idempotency — skip if approval row already exists ───────────────
        const [existing] = await db
            .select({ id: approvalQueue.id })
            .from(approvalQueue)
            .where(and(eq(approvalQueue.lead_id, lead_id), eq(approvalQueue.user_id, user_id)))
            .limit(1);

        if (existing) return;

        // ── 5. Create approval_queue row (7-day expiry) ────────────────────────
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const [inserted] = await db
            .insert(approvalQueue)
            .values({ user_id, lead_id, drafts: null, status: 'pending', expires_at: expiresAt })
            .returning({ id: approvalQueue.id });

        // ── 6. Enqueue outreach draft generation ──────────────────────────────
        await outreachQueue.add(
            'draft',
            { lead_id, user_id, approval_queue_item_id: inserted.id },
            { jobId: `draft_${lead_id}_${user_id}` },  // dedup
        );

        job.log(`[autopilot] Enqueued outreach draft — lead ${lead_id}, score ${score.ai_score}, threshold ${threshold}`);
    },
    { connection, concurrency: 5 }
);

autopilotWorker.on('failed', (job, err) => {
    console.error(`[autopilot] job ${job?.id} failed:`, err.message);
});
