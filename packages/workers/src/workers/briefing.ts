import type { BriefingGenerationJob } from '@leadflow/types';
import { QUEUE_NAMES } from '@leadflow/types';
import { Worker } from 'bullmq';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { Resend } from 'resend';
import { db } from '../db.js';
import { getLLMProvider } from '../llm/LLMProviderFactory.js';
import { connection } from '../redis.js';
import { briefingLog, leadScores, leads, userProfiles } from '../schema.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const briefingWorker = new Worker<BriefingGenerationJob>(
    QUEUE_NAMES.BRIEFING_GENERATION,
    async (job) => {
        const { user_id } = job.data;
        job.log(`Generating briefing for user ${user_id}`);

        // ── Fetch user profile ─────────────────────────────────────────────────
        const [profile] = await db
            .select()
            .from(userProfiles)
            .where(eq(userProfiles.clerk_user_id, user_id))
            .limit(1);

        if (!profile) throw new Error(`Profile not found for ${user_id}`);

        // ── Fetch today's top new leads for this user (scored, not yet actioned) ─
        const since = new Date(Date.now() - 48 * 60 * 60 * 1000); // last 48h
        const topLeadRows = await db
            .select({
                id: leads.id,
                title: leads.title,
                source: leads.source,
                client_name: leads.client_name,
                budget_min: leads.budget_min,
                budget_max: leads.budget_max,
                status: leads.status,
                golden_hour: leads.golden_hour,
                ingested_at: leads.ingested_at,
                ai_score: leadScores.ai_score,
                ai_summary: leadScores.ai_summary,
            })
            .from(leadScores)
            .innerJoin(leads, eq(leadScores.lead_id, leads.id))
            .where(and(
                eq(leadScores.user_id, user_id),
                gte(leads.ingested_at, since),
                sql`${leads.status} IN ('new', 'reviewing')`,
            ))
            .orderBy(desc(leadScores.ai_score))
            .limit(10);

        // ── Count actions taken this week ─────────────────────────────────────
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const [actionRow] = await db
            .select({ cnt: sql<number>`count(*)::int` })
            .from(leads)
            .where(and(
                sql`${leads.status} IN ('actioned', 'contacted', 'won')`,
                gte(leads.updated_at, weekAgo),
            ));
        const actionsTaken = actionRow?.cnt ?? 0;

        // ── Build LLM prompt ──────────────────────────────────────────────────
        const firstName = profile.first_name || 'there';
        const leadsContext = topLeadRows
            .map((l, i) =>
                `${i + 1}. "${l.title}" (${l.source.replace(/_/g, ' ')}) — score: ${Math.round(Number(l.ai_score))}${l.golden_hour ? ' ⚡ Golden Hour' : ''} — ${l.ai_summary?.slice(0, 120) ?? ''}`,
            )
            .join('\n');

        const prompt = `You are a concise AI briefing assistant for ${firstName}, a freelancer using LeadFlow.

Here are their top ${topLeadRows.length} unactioned leads from the last 48 hours:
${leadsContext || 'No new leads yet.'}

Skills: ${profile.core_skills.join(', ')}
Actions taken this week: ${actionsTaken}

Generate a daily briefing. Respond with JSON:
{
  "headline": "One punchy sentence summarising the day's opportunity (max 12 words)",
  "topLeads": [{ "id": "uuid", "title": "...", "reason": "one-line why now (max 15 words)", "score": 0 }],
  "insights": ["insight 1", "insight 2", "insight 3"],
  "actionItems": ["action 1", "action 2", "action 3"]
}
Keep everything brief and actionable. topLeads = top 3 only.`;

        const llm = getLLMProvider();
        const result = await llm.complete({
            system: 'You are a concise freelance lead briefing assistant. Return only valid JSON.',
            user: prompt,
            maxTokens: 800,
            temperature: 0.5,
        });

        const raw = result.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        const briefing = JSON.parse(raw) as {
            headline: string;
            topLeads: { id: string; title: string; reason: string; score: number }[];
            insights: string[];
            actionItems: string[];
        };

        job.log(`Briefing generated: ${briefing.headline}`);

        // ── Save to briefing_log ───────────────────────────────────────────────
        const [saved] = await db.insert(briefingLog).values({
            user_id,
            lead_count: topLeadRows.length,
            actions_taken: actionsTaken,
            channel: 'email',
            content: briefing,
        }).returning({ id: briefingLog.id });

        job.log(`Saved briefing ${saved?.id} for user ${user_id}`);

        // ── Optional email delivery via Resend ────────────────────────────────
        if (resend && profile.email) {
            const topThree = briefing.topLeads.slice(0, 3);
            const html = `
<h2>${briefing.headline}</h2>
<h3>🎯 Top Leads</h3>
<ul>${topThree.map(l => `<li><strong>${l.title}</strong> — ${l.reason} (score: ${l.score})</li>`).join('')}</ul>
<h3>💡 Insights</h3>
<ul>${briefing.insights.map(i => `<li>${i}</li>`).join('')}</ul>
<h3>✅ Action Items</h3>
<ol>${briefing.actionItems.map(a => `<li>${a}</li>`).join('')}</ol>
`;
            try {
                await resend.emails.send({
                    from: 'LeadFlow <briefings@leadflow.app>',
                    to: profile.email,
                    subject: `[LeadFlow] ${briefing.headline}`,
                    html,
                });
                await db.update(briefingLog)
                    .set({ delivered_at: new Date() })
                    .where(eq(briefingLog.id, saved!.id));
            } catch (emailErr) {
                job.log(`Email delivery failed: ${(emailErr as Error).message}`);
            }
        }

        await job.updateProgress(100);
        return { briefingId: saved?.id };
    },
    { connection, concurrency: 1 }
);

briefingWorker.on('failed', (job, err) => {
    console.error(`[briefing] job ${job?.id} failed:`, err.message);
});

