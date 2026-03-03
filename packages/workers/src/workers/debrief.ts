import type { DebriefGenerationJob } from '@leadflow/types';
import { QUEUE_NAMES } from '@leadflow/types';
import { Worker } from 'bullmq';
import { and, count, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { getLLMProvider } from '../llm/LLMProviderFactory.js';
import { connection } from '../redis.js';
import { leads, leadScores, outreachSends, userProfiles } from '../schema.js';

// ─── Zod schema for Claude's 7-dimension debrief output ──────────────────────

const DimensionSchema = z.object({
    score: z.number().min(1).max(5),
    analysis: z.string(),
    recommendation: z.string(),
});

const DebriefSchema = z.object({
    outcome: z.enum(['won', 'lost']),
    dimensions: z.object({
        rate_alignment: DimensionSchema,
        message_relevance: DimensionSchema,
        response_speed: DimensionSchema,
        message_length: DimensionSchema,
        portfolio_match: DimensionSchema,
        tone: DimensionSchema,
        subject_line: DimensionSchema,
    }),
    top_strength: z.string(),
    top_improvement: z.string(),
    pattern_indicators: z.array(z.string()),
});

// ─── Worker ───────────────────────────────────────────────────────────────────

export const debriefWorker = new Worker<DebriefGenerationJob>(
    QUEUE_NAMES.DEBRIEF_GENERATION,
    async (job) => {
        const { user_id, lead_id, outcome } = job.data;
        job.log(`Generating ${outcome} debrief for lead ${lead_id} / user ${user_id}`);

        // ── Idempotency guard ─────────────────────────────────────────────────
        const [score] = await db
            .select()
            .from(leadScores)
            .where(and(eq(leadScores.lead_id, lead_id), eq(leadScores.user_id, user_id)))
            .limit(1);

        if (!score) {
            job.log('No lead_score found — skipping debrief');
            return;
        }
        if (score.debrief_generated_at) {
            job.log('Debrief already generated — skipping');
            return;
        }

        // ── Fetch contextual data ─────────────────────────────────────────────
        const [lead] = await db.select().from(leads).where(eq(leads.id, lead_id)).limit(1);
        if (!lead) { job.log('Lead not found'); return; }

        const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.clerk_user_id, user_id)).limit(1);
        if (!profile) { job.log('Profile not found'); return; }

        const [mostRecentSend] = await db
            .select()
            .from(outreachSends)
            .where(and(eq(outreachSends.lead_id, lead_id), eq(outreachSends.user_id, user_id)))
            .limit(1);

        const hoursToContact = mostRecentSend?.sent_at
            ? ((mostRecentSend.sent_at.getTime() - lead.ingested_at.getTime()) / 3_600_000).toFixed(1)
            : null;

        const budgetStr = lead.budget
            ? `$${lead.budget} (${lead.budget_type ?? 'fixed'})`
            : lead.budget_min && lead.budget_max
                ? `$${lead.budget_min}–$${lead.budget_max}`
                : 'unspecified';

        const rateStr = profile.hourly_rate ? `$${profile.hourly_rate}/hr` : 'not set';
        const outreachSentText = mostRecentSend?.draft_content ?? 'no outreach recorded';
        const wordCount = outreachSentText.split(/\s+/).length;

        // ── Build Claude prompt ───────────────────────────────────────────────
        const systemPrompt = `You are an expert freelance coach analyzing outreach performance.
You must respond with ONLY valid JSON — no markdown, no preamble.
Evaluate the outreach attempt and return an assessment across 7 dimensions.
Each dimension has score (1–5), analysis (max 2 sentences), recommendation (max 1 sentence).
JSON schema:
{
  "outcome": "won|lost",
  "dimensions": {
    "rate_alignment": {"score":N,"analysis":"...","recommendation":"..."},
    "message_relevance": {"score":N,"analysis":"...","recommendation":"..."},
    "response_speed": {"score":N,"analysis":"...","recommendation":"..."},
    "message_length": {"score":N,"analysis":"...","recommendation":"..."},
    "portfolio_match": {"score":N,"analysis":"...","recommendation":"..."},
    "tone": {"score":N,"analysis":"...","recommendation":"..."},
    "subject_line": {"score":N,"analysis":"...","recommendation":"..."}
  },
  "top_strength": "one sentence",
  "top_improvement": "one sentence",
  "pattern_indicators": ["observation 1","observation 2"]
}`;

        const userPrompt = `Freelancer: ${profile.first_name} ${profile.last_name}
Rate: ${rateStr}
Skills: ${profile.core_skills.join(', ')}

Lead: "${lead.title}"
Client: ${lead.client_name ?? 'unknown'}
Source: ${lead.source}
Budget offered: ${budgetStr}
Skills required: ${lead.skills_required.join(', ') || 'none listed'}
Golden hour lead: ${lead.golden_hour ? 'yes' : 'no'}
AI score: ${score.ai_score}/100

Outreach sent (${wordCount} words):
"${outreachSentText.slice(0, 800)}"

Hours to contact after posting: ${hoursToContact ?? 'unknown'}
Portfolio matches found: ${lead.portfolio_matches ? (lead.portfolio_matches as any[]).length : 0}

OUTCOME: ${outcome.toUpperCase()}

Analyze why this outreach ${outcome === 'won' ? 'succeeded' : 'failed'} and score each dimension.`;

        // ── Call Claude with retry on malformed JSON ──────────────────────────
        let debriefData: z.infer<typeof DebriefSchema> | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const llm = getLLMProvider();
                const response = await llm.complete({
                    system: systemPrompt,
                    user: userPrompt,
                    maxTokens: 800,
                    temperature: attempt === 0 ? 0.3 : 0.1, // lower temp on retry
                });

                const raw = response.content.trim();
                // Strip any accidental markdown fences
                const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
                const parsed = JSON.parse(jsonStr);
                debriefData = DebriefSchema.parse({ ...parsed, outcome });
                break;
            } catch (err) {
                job.log(`Debrief parse attempt ${attempt + 1} failed: ${(err as Error).message}`);
                if (attempt === 2) throw new Error('Debrief generation failed after 3 attempts');
            }
        }

        if (!debriefData) throw new Error('No debrief data generated');

        // ── Store debrief ─────────────────────────────────────────────────────
        await db.update(leadScores)
            .set({
                debrief: debriefData as any,
                debrief_generated_at: new Date(),
                updated_at: new Date(),
            })
            .where(and(eq(leadScores.lead_id, lead_id), eq(leadScores.user_id, user_id)));

        job.log(`Debrief stored for lead ${lead_id}`);

        // ── FR-08: Pattern report trigger (after every 5 losses from 10 onward) ─
        if (outcome === 'lost') {
            await checkAndSchedulePatternReport(user_id, job);
        }
    },
    { connection, concurrency: 2 }
);

debriefWorker.on('failed', (job, err) => {
    console.error(`[debrief] job ${job?.id} failed:`, err.message);
});

// ─── Pattern report generation ────────────────────────────────────────────────

async function checkAndSchedulePatternReport(userId: string, job: any) {
    const [row] = await db
        .select({ cnt: count() })
        .from(leadScores)
        .where(and(
            eq(leadScores.user_id, userId),
            sql`${leadScores.debrief} IS NOT NULL`,
        ));

    const totalDebriefs = Number(row?.cnt ?? 0);
    // Trigger at 10, then every 5 losses
    if (totalDebriefs < 10 || (totalDebriefs - 10) % 5 !== 0) return;

    job.log(`[pattern] Triggering pattern report for user ${userId} at ${totalDebriefs} debriefs`);

    const llm = getLLMProvider();

    // Fetch all debriefs for this user
    const rows = await db
        .select({ debrief: leadScores.debrief })
        .from(leadScores)
        .where(and(
            eq(leadScores.user_id, userId),
            sql`${leadScores.debrief} IS NOT NULL`,
        ));

    const debriefs = rows.map(r => r.debrief as any).filter(Boolean);
    const dimensionKeys = ['rate_alignment', 'message_relevance', 'response_speed', 'message_length', 'portfolio_match', 'tone', 'subject_line'];

    // Compute average per dimension
    const avgScores: Record<string, number> = {};
    for (const dim of dimensionKeys) {
        const scores = debriefs.map(d => d?.dimensions?.[dim]?.score).filter((s: any) => typeof s === 'number');
        avgScores[dim] = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
    }
    const weakestDims = Object.entries(avgScores).sort((a, b) => a[1] - b[1]).slice(0, 3);

    const reportPrompt = `You are a freelance performance analyst.
Based on ${debriefs.length} outreach debriefs, the freelancer's weakest average dimension scores are:
${weakestDims.map(([dim, avg]) => `- ${dim}: ${avg.toFixed(1)}/5`).join('\n')}

Provide 3 specific, actionable recommendations to improve these areas.
Respond with JSON: {"recommendations": ["rec1", "rec2", "rec3"], "summary": "2-sentence overview"}`;

    try {
        const response = await llm.complete({ user: reportPrompt, maxTokens: 400, temperature: 0.3 });
        const raw = response.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        const reportData = JSON.parse(raw);

        await db.execute(sql`
            INSERT INTO pattern_reports (user_id, report, loss_count_at_generation)
            VALUES (${userId}, ${JSON.stringify({ ...reportData, avg_dimension_scores: avgScores })}::jsonb, ${totalDebriefs})
        `);
        job.log(`[pattern] Pattern report generated for user ${userId}`);
    } catch (err) {
        job.log(`[pattern] Pattern report generation failed: ${(err as Error).message}`);
    }
}
