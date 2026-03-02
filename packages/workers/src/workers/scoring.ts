import type { NormalizationJob, ScoringJob } from '@leadflow/types';
import { QUEUE_NAMES } from '@leadflow/types';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { connection, makeQueue } from '../redis.js';
import { leads, leadScores, userProfiles } from '../schema.js';
import { ScoringEngine } from '../scoring/ScoringEngine.js';

const scoredQueue = makeQueue<ScoringJob>(QUEUE_NAMES.SCORED_LEADS);
const engine = new ScoringEngine();

export const normalizedLeadsWorker = new Worker<NormalizationJob>(
    QUEUE_NAMES.NORMALIZED_LEADS,
    async (job) => {
        const { lead_id } = job.data;
        job.log(`Scoring lead ${lead_id}`);

        // ── Fetch lead ───────────────────────────────────────────────────────────
        const leadRows = await db.select().from(leads)
            .where(eq(leads.id, lead_id))
            .limit(1);

        if (leadRows.length === 0) {
            job.log(`Lead ${lead_id} not found — skipping`);
            return;
        }

        const lead = leadRows[0];

        // Skip dismissed leads (e.g. Reddit [For Hire] posts) and near-duplicates
        // suppressed by the pgvector cosine dedup step in the embeddings worker.
        if (lead.status === 'dismissed' || lead.status === 'duplicate') {
            job.log(`Lead ${lead_id} has status '${lead.status}' — skipping`);
            return;
        }

        // ── Fetch all onboarded user profiles ────────────────────────────────────
        const profiles = await db.select().from(userProfiles)
            .where(eq(userProfiles.onboarding_completed, true));

        if (profiles.length === 0) {
            job.log('No onboarded users found — skipping');
            return;
        }

        // ── Score for each user ──────────────────────────────────────────────────
        for (const profile of profiles) {
            job.log(`Scoring for user ${profile.clerk_user_id}`);

            // Cast DB row to the Lead type expected by ScoringEngine
            const leadForScoring = {
                ...lead,
                budget: lead.budget ? Number(lead.budget) : null,
                budget_min: lead.budget_min ? Number(lead.budget_min) : null,
                budget_max: lead.budget_max ? Number(lead.budget_max) : null,
                budget_type: lead.budget_type as import('@leadflow/types').BudgetType | null,
                status: lead.status as import('@leadflow/types').LeadStatus,
                skills_required: lead.skills_required ?? [],
                company_health: lead.company_health as import('@leadflow/types').CompanyHealth | null,
                ingested_at: lead.ingested_at.toISOString(),
                created_at: lead.created_at.toISOString(),
                updated_at: lead.updated_at.toISOString(),
                // Satisfy remaining Lead interface fields that aren't in workers schema
                poster_id: null,
                poster_name: null,
                poster_history_score: null,
                contact_linkedin: lead.contact_linkedin ?? null,
                experience_level: (lead.experience_level as import('@leadflow/types').ExperienceLevel) ?? null,
                category: lead.category ?? null,
                boomerang_ref: lead.boomerang_ref ?? null,
                boomerang_context: lead.boomerang_context as import('@leadflow/types').BoomerangContext | null,
                portfolio_matches: lead.portfolio_matches as import('@leadflow/types').PortfolioMatch[] | null,
                recipient_timezone: lead.recipient_timezone ?? null,
                trigger_event: lead.trigger_event as import('@leadflow/types').TriggerEvent | null,
                community_source: lead.community_source as import('@leadflow/types').CommunitySource | null,
                competition_level: (lead.competition_level as import('@leadflow/types').CompetitionLevel) ?? null,
                contact_email: lead.contact_email ?? null,
            } satisfies import('@leadflow/types').Lead;

            const profileForScoring = {
                ...profile,
                hourly_rate: profile.hourly_rate ? Number(profile.hourly_rate) : null,
                min_budget: profile.min_budget ? Number(profile.min_budget) : null,
                max_budget: profile.max_budget ? Number(profile.max_budget) : null,
                // Satisfy remaining UserProfile fields with defaults
                avatar_url: null,
                availability: 'full_time' as const,
                portfolio_url: null,
                linkedin_url: null,
                github_url: null,
                phone_number: null,
                phone_verified: false,
                golden_hour_sms: false,
                profile_completeness: 50,
                auto_send_enabled: false,
                briefing_delivery_time: '08:00',
                briefing_snooze_until: null,
                briefing_channel: 'email' as const,
                briefing_email_bounced: false,
                community_tokens: null,
                slack_monitored_channels: [],
                alliance_opt_in: false,
                filter_hide_red_companies: false,
                autopilot_pause_config: null,
                preferred_project_types: [],
                preferred_sources: [],
                preferred_skills: profile.preferred_skills ?? [],
                notification_settings: {
                    golden_hour_push: true,
                    golden_hour_email: true,
                    golden_hour_sms: false,
                    min_score_threshold: 60,
                    quiet_hours_start: null,
                    quiet_hours_end: null,
                },
                autopilot_rules: null,
                email: profile.email,
                id: profile.id,
                clerk_user_id: profile.clerk_user_id,
                first_name: profile.first_name,
                last_name: profile.last_name,
                core_skills: profile.core_skills,
                experience_years: profile.experience_years,
                timezone: profile.timezone,
                autopilot_enabled: profile.autopilot_enabled,
                onboarding_completed: profile.onboarding_completed,
                created_at: profile.created_at.toISOString(),
                updated_at: profile.updated_at.toISOString(),
            } satisfies import('@leadflow/types').UserProfile;

            const result = await engine.score(leadForScoring, profileForScoring);

            // ── Upsert score (idempotent) ──────────────────────────────────────────
            await db.insert(leadScores).values({
                lead_id,
                user_id: profile.clerk_user_id,
                ai_score: String(result.ai_score),
                ai_summary: result.ai_summary,
                score_breakdown: result.score_breakdown as unknown as Record<string, number>,
                skill_gaps: result.skill_gaps,
                alliance_eligible: result.alliance_eligible,
                golden_hour_notified_at: null,
                is_autopilot: profile.autopilot_enabled,
                actioned_from_briefing: false,
            }).onConflictDoNothing();

            // Publish scored event for briefing / notification workers
            await scoredQueue.add('scored', {
                lead_id,
                user_id: profile.clerk_user_id,
            }, { jobId: `scored_${lead_id}_${profile.clerk_user_id}` });
        }

        job.log(`Scored lead ${lead_id} for ${profiles.length} users`);
    },
    { connection, concurrency: 3 }
);

normalizedLeadsWorker.on('failed', (job, err) => {
    console.error(`[scoring] job ${job?.id} failed:`, err.message);
});
