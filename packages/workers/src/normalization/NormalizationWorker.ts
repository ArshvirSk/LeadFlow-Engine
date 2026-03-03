import type { LeadEmbeddingJob, NormalizationJob, RawLeadJob } from '@leadflow/types';
import { QUEUE_NAMES } from '@leadflow/types';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { enrichCompanyHealth } from '../enrichment/companyHealth.js';
import { connection, makeQueue } from '../redis.js';
import { leads } from '../schema.js';
import { inferTimezone } from '../services/sendWindow.js';
import { extractBudget } from './extractors/budget.extractor.js';
import { extractLocation } from './extractors/location.extractor.js';
import { extractSkills } from './extractors/skills.extractor.js';

const normalizedQueue = makeQueue<NormalizationJob>(QUEUE_NAMES.NORMALIZED_LEADS);
const embedQueue = makeQueue<LeadEmbeddingJob>(QUEUE_NAMES.LEAD_EMBEDDINGS);

// Golden hour: leads ingested within 2 hours of their post time are flagged
const GOLDEN_HOUR_WINDOW_MS = 2 * 60 * 60 * 1000;

// ─── Employment-post filter ───────────────────────────────────────────────────
// Signals that indicate a full-time employment ad, not a freelance project.
// One strong signal OR 3+ mild signals → auto-dismiss.
const EMPLOYMENT_STRONG: RegExp[] = [
    /\bfull[- ]time\s+(employee|position|role|job|developer|engineer|designer)\b/i,
    /\b(annual\s+)?(salary|compensation)\s*:?\s*\$[\d,k]+/i,
    /\b401[kK]\b/,
    /\b(dental|vision|health)\s+insurance\b/i,
    /\bstock\s+(options|grants|vesting)\b/i,
    /\bequity\s+(package|comp|compensation)\b/i,
    /\bw-?2\s+employee\b/i,
    /\bpermanent\s+(position|role|job|employment)\b/i,
];
const EMPLOYMENT_MILD: RegExp[] = [
    /\bfull[- ]time\b/i,
    /\bjoin\s+(our|the)\s+team\b/i,
    /\bwe('re|\s+are)\s+hiring\b/i,
    /\bbenefits\s+(package|include)\b/i,
    /\bsalary\b/i,
    /\bpto\b/i,
    /\bpaid\s+time\s+off\b/i,
    /\bvacation\s+days\b/i,
];

function isEmploymentPosting(title: string, description: string): boolean {
    const text = `${title} ${description}`;
    if (EMPLOYMENT_STRONG.some(re => re.test(text))) return true;
    return EMPLOYMENT_MILD.filter(re => re.test(text)).length >= 3;
}

export const normalizationWorker = new Worker<RawLeadJob>(
    QUEUE_NAMES.RAW_LEADS,
    async (job) => {
        const data = job.data;
        job.log(`Normalizing lead from ${data.source}: ${data.title}`);

        const fullText = `${data.title} ${data.description}`;

        // ── Employment-post guard ───────────────────────────────────────────────
        // Auto-dismiss full-time job ads before they reach the scoring pipeline
        if (isEmploymentPosting(data.title, data.description)) {
            job.log(`Dismissed employment posting: "${data.title}"`);
            return;
        }

        // ── Entity extraction ───────────────────────────────────────────────────
        const skills = extractSkills(fullText);
        const budget = extractBudget(fullText);
        const loc = extractLocation(fullText);
        // ── FR-04: Infer recipient timezone from location ───────────────────────
        const recipient_timezone = inferTimezone(loc.location);
        // ── Determine golden hour ───────────────────────────────────────────────
        const ingestedAt = new Date(data.ingested_at);
        const golden_hour = Date.now() - ingestedAt.getTime() < GOLDEN_HOUR_WINDOW_MS;

        // ── Upsert lead (idempotent on source+source_id) ────────────────────────
        const existingRows = data.source_id
            ? await db.select({ id: leads.id })
                .from(leads)
                .where(eq(leads.source_id, data.source_id))
                .limit(1)
            : [];

        let lead_id: string;

        if (existingRows.length > 0) {
            // Already normalized — reuse the ID (idempotent)
            lead_id = existingRows[0].id;
            job.log(`Lead already exists: ${lead_id}`);
        } else {
            const inserted = await db.insert(leads).values({
                source: data.source,
                source_id: data.source_id ?? null,
                title: data.title,
                description: data.description,
                url: data.url,
                client_name: data.client_name ?? null,
                client_url: data.client_url ?? null,
                skills_required: skills,
                budget: budget.amount !== null ? String(budget.amount) : null,
                budget_type: budget.type === 'unspecified' ? null : budget.type,
                budget_min: budget.min !== null ? String(budget.min) : null,
                budget_max: budget.max !== null ? String(budget.max) : null,
                location: loc.location,
                remote: loc.remote,
                recipient_timezone,
                status: 'new',
                golden_hour,
                ingested_at: ingestedAt,
            }).returning({ id: leads.id });

            lead_id = inserted[0].id;
            job.log(`Inserted lead ${lead_id} | skills:${skills.length} budget:${budget.amount} remote:${loc.remote}`);

            // ── FR02: Enrich company health (Crunchbase, 24 h Redis cache) ────────
            if (data.client_name) {
                const health = await enrichCompanyHealth(data.client_name);
                if (health) {
                    await db.update(leads)
                        .set({ company_health: health })
                        .where(eq(leads.id, lead_id));
                    job.log(`Company health for "${data.client_name}": ${health.status}`);
                }
            }
        }

        // ── Publish to scoring queue ─────────────────────────────────────────────
        await normalizedQueue.add('score', { lead_id }, {
            jobId: `score_${lead_id}`,   // dedup
        });

        // ── Enqueue lead embedding (L2-T08) ──────────────────────────────────────
        await embedQueue.add('embed', { lead_id }, {
            jobId: `embed_${lead_id}`,   // dedup — one embedding per lead
        });
    },
    { connection, concurrency: 5 }
);

normalizationWorker.on('failed', (job, err) => {
    console.error(`[normalization] job ${job?.id} failed:`, err.message);
});
