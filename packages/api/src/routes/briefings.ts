import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { briefingLog } from '../db/schema/index.js';
import { briefingQueue } from '../queues/index.js';
import { eq, desc } from 'drizzle-orm';

export async function briefingRoutes(app: FastifyInstance) {
  // GET /briefings — last 10 briefings
  app.get('/briefings', async (req, reply) => {
    const userId = (req as any).clerkUserId as string;
    const rows = await db.select().from(briefingLog).where(eq(briefingLog.user_id, userId)).orderBy(desc(briefingLog.generated_at)).limit(10);
    return reply.send(rows);
  });

  // POST /briefings/generate — manual trigger
  app.post('/briefings/generate', async (req, reply) => {
    const userId = (req as any).clerkUserId as string;
    const job = await briefingQueue.add('generate', { user_id: userId, scheduled_for: new Date().toISOString() });
    return reply.status(202).send({ jobId: job.id });
  });

  // POST /briefings/:id/opened
  app.post('/briefings/:id/opened', async (req, reply) => {
    const userId = (req as any).clerkUserId as string;
    const { id } = req.params as { id: string };
    await db.update(briefingLog).set({ opened_at: new Date() }).where(eq(briefingLog.id, id));
    return reply.send({ ok: true });
  });
}
