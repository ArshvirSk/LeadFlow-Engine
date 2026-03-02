import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { watchlist, triggerEvents } from '../db/schema/index.js';
import { triggerEventsQueue } from '../queues/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';

const WatchlistSchema = z.object({
  company_name: z.string().max(255),
  company_url: z.string().url().optional(),
  company_crunchbase_id: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export async function watchlistRoutes(app: FastifyInstance) {
  // GET /watchlist
  app.get('/watchlist', async (req, reply) => {
    const userId = (req as any).clerkUserId as string;
    const items = await db.select().from(watchlist).where(eq(watchlist.user_id, userId)).orderBy(desc(watchlist.created_at));
    return reply.send(items);
  });

  // POST /watchlist
  app.post('/watchlist', async (req, reply) => {
    const userId = (req as any).clerkUserId as string;
    const data = WatchlistSchema.parse(req.body);
    const [item] = await db.insert(watchlist).values({ user_id: userId, ...data }).returning();
    return reply.status(201).send(item);
  });

  // DELETE /watchlist/:id
  app.delete('/watchlist/:id', async (req, reply) => {
    const userId = (req as any).clerkUserId as string;
    const { id } = req.params as { id: string };
    const [existing] = await db.select().from(watchlist).where(eq(watchlist.id, id)).limit(1);
    if (!existing || existing.user_id !== userId) return reply.status(404).send({ error: 'Not found' });
    await db.delete(watchlist).where(eq(watchlist.id, id));
    return reply.status(204).send();
  });

  // GET /watchlist/:id/events
  app.get('/watchlist/:id/events', async (req, reply) => {
    const userId = (req as any).clerkUserId as string;
    const { id } = req.params as { id: string };
    const events = await db.select().from(triggerEvents).where(
      and(eq(triggerEvents.watchlist_id, id), eq(triggerEvents.user_id, userId))
    ).orderBy(desc(triggerEvents.event_date));
    return reply.send(events);
  });

  // POST /watchlist/check — manually trigger a check
  app.post('/watchlist/check', async (req, reply) => {
    const userId = (req as any).clerkUserId as string;
    const job = await triggerEventsQueue.add('check', { user_id: userId, watchlist_id: '', company_name: '', company_url: null });
    return reply.status(202).send({ jobId: job.id });
  });
}
