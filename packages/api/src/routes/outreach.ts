import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { approvalQueue, leads, outreachSends } from '../db/schema/index.js';
import { outreachDraftsQueue, scheduledSendsQueue } from '../queues/index.js';

const RequestDraftSchema = z.object({
    lead_id: z.string().uuid(),
    channels: z.array(z.enum(['email', 'linkedin', 'twitter', 'clipboard'])).min(1),
    portfolio_piece_id: z.string().uuid().optional(), // FR-03: portfolio override
});

const ApproveSchema = z.object({
    item_id: z.string().uuid(),
    channel: z.enum(['email', 'linkedin', 'twitter', 'clipboard']),
    edited_draft: z.string().optional(),
    schedule_at: z.string().datetime().optional(),
});

export async function outreachRoutes(app: FastifyInstance) {
    // POST /outreach/drafts — request AI draft generation (LLM route: 10 req/min)
    app.post('/outreach/drafts', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const { lead_id, channels, portfolio_piece_id } = RequestDraftSchema.parse(req.body);

        const [lead] = await db.select().from(leads).where(eq(leads.id, lead_id)).limit(1);
        if (!lead) return reply.status(404).send({ error: 'Lead not found' });

        // Create a pending approval_queue row so the frontend can poll for the draft
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const [inserted] = await db.insert(approvalQueue).values({
            user_id: userId,
            lead_id,
            drafts: null,
            status: 'pending',
            expires_at: expiresAt,
        }).returning({ id: approvalQueue.id });

        const job = await outreachDraftsQueue.add('draft', {
            lead_id,
            user_id: userId,
            approval_queue_item_id: inserted.id,
            ...(portfolio_piece_id ? { portfolio_piece_id } : {}),
        });
        return reply.status(202).send({ jobId: job.id });
    });

    // GET /leads/:leadId/outreach — poll for draft status
    app.get('/leads/:leadId/outreach', async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const { leadId } = req.params as { leadId: string };

        const [item] = await db
            .select()
            .from(approvalQueue)
            .where(
                and(
                    eq(approvalQueue.lead_id, leadId),
                    eq(approvalQueue.user_id, userId),
                )
            )
            .orderBy(desc(approvalQueue.created_at))
            .limit(1);

        if (!item) return reply.send({ status: 'none' });
        if (item.status === 'failed') {
            const errPayload = item.drafts as { error?: string } | null;
            return reply.send({ status: 'failed', error: errPayload?.error ?? 'Draft generation failed' });
        }
        if (!item.drafts) return reply.send({ status: 'generating' });
        return reply.send({ status: 'ready', drafts: item.drafts, item_id: item.id });
    });

    // GET /outreach/queue — approval queue for current user (pending generation + completed/ready to approve)
    app.get('/outreach/queue', async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const items = await db
            .select({
                id: approvalQueue.id,
                user_id: approvalQueue.user_id,
                lead_id: approvalQueue.lead_id,
                drafts: approvalQueue.drafts,
                status: approvalQueue.status,
                expires_at: approvalQueue.expires_at,
                created_at: approvalQueue.created_at,
                lead_title: leads.title,
                lead_source: leads.source,
            })
            .from(approvalQueue)
            .leftJoin(leads, eq(approvalQueue.lead_id, leads.id))
            .where(and(
                eq(approvalQueue.user_id, userId),
                inArray(approvalQueue.status, ['pending', 'completed']),
            ))
            .orderBy(desc(approvalQueue.created_at));
        return reply.send(items);
    });

    // POST /outreach/approve — approve and optionally schedule
    app.post('/outreach/approve', async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const { item_id, channel, edited_draft, schedule_at } = ApproveSchema.parse(req.body);

        const [item] = await db.select().from(approvalQueue).where(eq(approvalQueue.id, item_id)).limit(1);
        if (!item || item.user_id !== userId) return reply.status(404).send({ error: 'Not found' });
        if (item.status !== 'pending') return reply.status(409).send({ error: 'Already actioned' });

        await db.update(approvalQueue).set({ status: 'approved' }).where(eq(approvalQueue.id, item_id));

        const drafts = item.drafts as any;
        const draftContent = edited_draft ?? drafts[channel]?.body ?? '';

        if (schedule_at) {
            const delay = new Date(schedule_at).getTime() - Date.now();
            await scheduledSendsQueue.add(
                'send',
                { user_id: userId, lead_id: item.lead_id!, channel, draft_content: draftContent, scheduled_at: schedule_at },
                { delay: Math.max(0, delay) }
            );
        }

        const [send] = await db
            .insert(outreachSends)
            .values({
                user_id: userId,
                lead_id: item.lead_id!,
                channel: channel as any,
                draft_content: draftContent,
                scheduled_at: schedule_at ? new Date(schedule_at) : null,
                sent_at: schedule_at ? null : new Date(),
                status: schedule_at ? 'scheduled' : 'sent',
            })
            .returning();

        return reply.send(send);
    });

    // POST /outreach/skip
    app.post('/outreach/skip', {
        schema: { body: { type: 'object', properties: { item_id: { type: 'string' } }, required: ['item_id'] } },
    }, async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const { item_id } = req.body as { item_id: string };
        const [item] = await db.select().from(approvalQueue).where(eq(approvalQueue.id, item_id)).limit(1);
        if (!item || item.user_id !== userId) return reply.status(404).send({ error: 'Not found' });
        await db.update(approvalQueue).set({ status: 'skipped' }).where(eq(approvalQueue.id, item_id));
        return reply.send({ ok: true });
    });

    // GET /outreach/history
    app.get('/outreach/history', async (req, reply) => {
        const userId = (req as any).clerkUserId as string;
        const rows = await db
            .select()
            .from(outreachSends)
            .where(eq(outreachSends.user_id, userId))
            .orderBy(desc(outreachSends.created_at))
            .limit(50);
        return reply.send(rows);
    });
}
