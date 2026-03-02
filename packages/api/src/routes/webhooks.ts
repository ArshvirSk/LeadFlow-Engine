import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { Webhook } from 'svix';
import { db } from '../db/index.js';
import { userProfiles } from '../db/schema/index.js';

// Clerk webhook handler for user.created / user.updated / user.deleted events
export async function webhookRoutes(app: FastifyInstance) {
    // Override JSON parser for this scope so we get the raw string body
    // (required for HMAC signature verification — parsed objects won't match)
    app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
        done(null, body);
    });

    app.post('/webhooks/clerk', {
        schema: { hide: true },
    }, async (req, reply) => {
        const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
        if (!WEBHOOK_SECRET) return reply.status(500).send({ error: 'Webhook secret not configured' });

        const rawBody = (req.body as Buffer).toString('utf8');
        const svixHeaders = {
            'svix-id': req.headers['svix-id'] as string,
            'svix-timestamp': req.headers['svix-timestamp'] as string,
            'svix-signature': req.headers['svix-signature'] as string,
        };

        let payload: { type: string; data: any };
        try {
            // svix Webhook.verify() checks signature + timestamp freshness (±5 min)
            payload = new Webhook(WEBHOOK_SECRET).verify(rawBody, svixHeaders) as { type: string; data: any };
        } catch (err) {
            req.log.warn({ err }, '[webhook] signature verification failed');
            return reply.status(400).send({ error: 'Invalid signature' });
        }

        const { type, data } = payload;

        if (type === 'user.created') {
            const email = data.email_addresses?.[0]?.email_address ?? '';
            const firstName: string = data.first_name ?? '';
            const lastName: string = data.last_name ?? '';
            await db.insert(userProfiles).values({
                clerk_user_id: data.id,
                email,
                first_name: firstName,
                last_name: lastName,
                avatar_url: data.image_url ?? null,
                onboarding_completed: false,
            }).onConflictDoNothing();
            req.log.info({ userId: data.id }, '[webhook] user.created → profile inserted');
        }

        if (type === 'user.updated') {
            await db.update(userProfiles).set({
                email: data.email_addresses?.[0]?.email_address,
                first_name: data.first_name ?? '',
                last_name: data.last_name ?? '',
                avatar_url: data.image_url ?? undefined,
                updated_at: new Date(),
            }).where(eq(userProfiles.clerk_user_id, data.id));
            req.log.info({ userId: data.id }, '[webhook] user.updated → profile synced');
        }

        if (type === 'user.deleted') {
            await db.delete(userProfiles).where(eq(userProfiles.clerk_user_id, data.id));
            req.log.info({ userId: data.id }, '[webhook] user.deleted → profile removed');
        }

        return reply.send({ ok: true });
    });
}
