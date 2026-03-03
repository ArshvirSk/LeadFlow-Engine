import type { OutreachDraftJob } from '@leadflow/types';
import { QUEUE_NAMES } from '@leadflow/types';
import { Worker } from 'bullmq';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { OutreachContextBuilder } from '../outreach/OutreachContextBuilder.js';
import { ClipboardPitchGenerator } from '../outreach/generators/ClipboardPitch.generator.js';
import { ColdEmailGenerator } from '../outreach/generators/ColdEmail.generator.js';
import { LinkedInGenerator } from '../outreach/generators/LinkedIn.generator.js';
import { TwitterDMGenerator } from '../outreach/generators/TwitterDM.generator.js';
import { connection } from '../redis.js';
import { approvalQueue, leads, leadScores, portfolioPieces, userProfiles } from '../schema.js';

const contextBuilder = new OutreachContextBuilder();
const emailGenerator = new ColdEmailGenerator();
const linkedInGenerator = new LinkedInGenerator();
const twitterGenerator = new TwitterDMGenerator();
const clipboardGenerator = new ClipboardPitchGenerator();

export const outreachDraftsWorker = new Worker<OutreachDraftJob>(
    QUEUE_NAMES.OUTREACH_DRAFTS,
    async (job) => {
        const { lead_id, user_id } = job.data;
        job.log(`Generating outreach drafts for lead ${lead_id} / user ${user_id}`);

        // ── Fetch lead ────────────────────────────────────────────────────────────
        const leadRows = await db.select().from(leads)
            .where(eq(leads.id, lead_id))
            .limit(1);

        if (leadRows.length === 0) {
            throw new Error(`Lead ${lead_id} not found`);
        }

        // ── Fetch user profile ────────────────────────────────────────────────────
        const profileRows = await db.select().from(userProfiles)
            .where(eq(userProfiles.clerk_user_id, user_id))
            .limit(1);

        if (profileRows.length === 0) {
            throw new Error(`User profile not found for ${user_id}`);
        }

        // ── Fetch score for this user ─────────────────────────────────────────────
        const scoreRows = await db.select().from(leadScores)
            .where(and(eq(leadScores.lead_id, lead_id), eq(leadScores.user_id, user_id)))
            .limit(1);

        const dbLead = leadRows[0];
        const dbProfile = profileRows[0];
        const dbScore = scoreRows[0] ?? null;

        // ── Build context ─────────────────────────────────────────────────────────
        // Cast DB rows to types (same pattern as scoring worker)
        const leadForContext = {
            ...dbLead,
            budget: dbLead.budget ? Number(dbLead.budget) : null,
            budget_min: dbLead.budget_min ? Number(dbLead.budget_min) : null,
            budget_max: dbLead.budget_max ? Number(dbLead.budget_max) : null,
            budget_type: dbLead.budget_type as import('@leadflow/types').BudgetType | null,
            status: dbLead.status as import('@leadflow/types').LeadStatus,
            skills_required: dbLead.skills_required ?? [],
            company_health: dbLead.company_health as import('@leadflow/types').CompanyHealth | null,
            poster_id: null,
            poster_name: null,
            poster_history_score: null,
            contact_email: dbLead.contact_email ?? null,
            contact_linkedin: dbLead.contact_linkedin ?? null,
            experience_level: (dbLead.experience_level as import('@leadflow/types').ExperienceLevel) ?? null,
            category: dbLead.category ?? null,
            boomerang_ref: dbLead.boomerang_ref ?? null,
            boomerang_context: dbLead.boomerang_context as import('@leadflow/types').BoomerangContext | null,
            portfolio_matches: dbLead.portfolio_matches as import('@leadflow/types').PortfolioMatch[] | null,
            recipient_timezone: dbLead.recipient_timezone ?? null,
            trigger_event: dbLead.trigger_event as import('@leadflow/types').TriggerEvent | null,
            community_source: dbLead.community_source as import('@leadflow/types').CommunitySource | null,
            competition_level: (dbLead.competition_level as import('@leadflow/types').CompetitionLevel) ?? null,
            ingested_at: dbLead.ingested_at.toISOString(),
            created_at: dbLead.created_at.toISOString(),
            updated_at: dbLead.updated_at.toISOString(),
        } satisfies import('@leadflow/types').Lead;

        const profileForContext = {
            id: dbProfile.id,
            clerk_user_id: dbProfile.clerk_user_id,
            email: dbProfile.email,
            first_name: dbProfile.first_name,
            last_name: dbProfile.last_name,
            core_skills: dbProfile.core_skills,
            preferred_skills: dbProfile.preferred_skills ?? [],
            experience_years: dbProfile.experience_years,
            hourly_rate: dbProfile.hourly_rate ? Number(dbProfile.hourly_rate) : null,
            min_budget: dbProfile.min_budget ? Number(dbProfile.min_budget) : null,
            max_budget: dbProfile.max_budget ? Number(dbProfile.max_budget) : null,
            timezone: dbProfile.timezone,
            autopilot_enabled: dbProfile.autopilot_enabled,
            onboarding_completed: dbProfile.onboarding_completed,
            created_at: dbProfile.created_at.toISOString(),
            updated_at: dbProfile.updated_at.toISOString(),
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
            autopilot_rules: null,
            notification_settings: {
                golden_hour_push: true,
                golden_hour_email: true,
                golden_hour_sms: false,
                min_score_threshold: 60,
                quiet_hours_start: null,
                quiet_hours_end: null,
            },
        } satisfies import('@leadflow/types').UserProfile;

        const scoreForContext = dbScore ? {
            id: dbScore.id,
            lead_id: dbScore.lead_id,
            user_id: dbScore.user_id,
            ai_score: Number(dbScore.ai_score),
            ai_summary: dbScore.ai_summary,
            score_breakdown: dbScore.score_breakdown as unknown as import('@leadflow/types').ScoreBreakdown,
            skill_gaps: dbScore.skill_gaps,
            alliance_eligible: dbScore.alliance_eligible,
            debrief: null,
            debrief_generated_at: null,
            golden_hour_notified_at: dbScore.golden_hour_notified_at?.toISOString() ?? null,
            golden_hour_responded_at: null,
            scheduled_job_id: null,
            is_autopilot: dbScore.is_autopilot,
            actioned_from_briefing: dbScore.actioned_from_briefing,
            created_at: dbScore.created_at.toISOString(),
            updated_at: dbScore.updated_at.toISOString(),
        } satisfies import('@leadflow/types').LeadScore : null;

        const ctx = contextBuilder.build(leadForContext, profileForContext, [], scoreForContext);

        // ── FR-03: Portfolio override — if a specific piece was requested ──────────────────
        if (job.data.portfolio_piece_id) {
            const [overridePiece] = await db
                .select()
                .from(portfolioPieces)
                .where(eq(portfolioPieces.id, job.data.portfolio_piece_id))
                .limit(1);
            if (overridePiece) {
                ctx.portfolio = [{
                    title: overridePiece.title,
                    url: overridePiece.url ?? null,
                    similarity: 1.0,
                    key_outcome: overridePiece.outcomes ?? null,
                }];
                job.log(`[outreach] portfolio override: using piece '${overridePiece.title}'`);
            }
        } ───────────────────────────────────────
        const [emailDraft, linkedInDraft, twitterDraft, clipboardDraft] = await Promise.all([
            emailGenerator.generate(ctx),
            linkedInGenerator.generate(ctx).catch((err: Error) => {
                job.log(`[outreach:linkedin] failed: ${err.message}`);
                return null;
            }),
            twitterGenerator.generate(ctx).catch((err: Error) => {
                job.log(`[outreach:twitter] failed: ${err.message}`);
                return null;
            }),
            clipboardGenerator.generate(ctx).catch((err: Error) => {
                job.log(`[outreach:clipboard] failed: ${err.message}`);
                return null;
            }),
        ]);

        job.log(
            `Drafts ready — email: ${emailDraft.word_count}w (${emailDraft.passed_validation ? 'OK' : 'WARN'}), ` +
            `linkedin: ${linkedInDraft ? 'OK' : 'FAILED'}, ` +
            `twitter: ${twitterDraft ? 'OK' : 'FAILED'}, ` +
            `clipboard: ${clipboardDraft ? 'OK' : 'FAILED'}`
        );

        // Persist draft into approval_queue
        const draftPayload: Record<string, unknown> = {
            email: {
                subject: emailDraft.subject,
                body: emailDraft.body,
                word_count: emailDraft.word_count,
                passed_validation: emailDraft.passed_validation,
            },
            ...(linkedInDraft && {
                linkedin: {
                    connection_note: linkedInDraft.connection_note,
                    inmail_subject: linkedInDraft.inmail_subject,
                    inmail_body: linkedInDraft.inmail_body,
                    passed_validation: linkedInDraft.passed_validation,
                },
            }),
            ...(twitterDraft && {
                twitter: {
                    dm: twitterDraft.dm,
                    passed_validation: twitterDraft.passed_validation,
                },
            }),
            ...(clipboardDraft && {
                clipboard: {
                    pitch: clipboardDraft.pitch,
                    line_count: clipboardDraft.line_count,
                    passed_validation: clipboardDraft.passed_validation,
                },
            }),
            generated_at: new Date().toISOString(),
        };

        // Update the specific approval_queue row by ID (passed from the API on enqueue)
        const itemId = job.data.approval_queue_item_id;
        await db
            .update(approvalQueue)
            .set({ drafts: draftPayload, status: 'completed' })
            .where(
                itemId
                    ? eq(approvalQueue.id, itemId)
                    : and(
                        eq(approvalQueue.lead_id, lead_id),
                        eq(approvalQueue.user_id, user_id),
                        isNull(approvalQueue.drafts),
                    )
            );

        await job.updateProgress(100);
        return draftPayload;
    },
    { connection, concurrency: 2 }
);

outreachDraftsWorker.on('failed', async (job, err) => {
    console.error(`[outreach] job ${job?.id} failed:`, err.message);

    // Mark the approval_queue row as failed so the frontend stops polling
    const itemId = job?.data?.approval_queue_item_id;
    if (!itemId) return;
    try {
        await db
            .update(approvalQueue)
            .set({ drafts: { error: err.message }, status: 'failed' })
            .where(eq(approvalQueue.id, itemId));
    } catch (dbErr) {
        console.error('[outreach] failed to mark approval_queue row as failed:', dbErr);
    }
});
