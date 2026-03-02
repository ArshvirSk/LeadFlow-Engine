import type { BriefingGenerationJob } from '@leadflow/types';
import { QUEUE_NAMES } from '@leadflow/types';
import { Worker } from 'bullmq';
import { Resend } from 'resend';
import { getLLMProvider } from '../llm/LLMProviderFactory.js';
import { connection } from '../redis.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const briefingWorker = new Worker<BriefingGenerationJob>(
    QUEUE_NAMES.BRIEFING_GENERATION,
    async (job) => {
        const { user_id } = job.data;
        job.log(`Generating briefing for user ${user_id}`);

        const llm = getLLMProvider();

        // TODO: fetch today's leads, scores, actions for this user
        const result = await llm.complete({
            system: 'You are a concise briefing assistant for a freelance lead platform.',
            user: `Generate a daily briefing for a freelancer based on their LeadFlow activity today.
Return JSON with: { headline, topLeads: [{id,title,score,reason}], insights: string[], actionItems: string[] }
Keep it concise and actionable.`,
            maxTokens: 2000,
            temperature: 0.7,
        });

        const briefing = JSON.parse(result.content);
        job.log(`Briefing generated: ${briefing.headline}`);

        // TODO: send via Resend email or push notification
        job.updateProgress(100);
    },
    { connection, concurrency: 1 }
);

briefingWorker.on('failed', (job, err) => {
    console.error(`[briefing] job ${job?.id} failed:`, err.message);
});
