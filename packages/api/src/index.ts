import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { FastifyAdapter } from '@bull-board/fastify';
import { verifyToken } from '@clerk/backend';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { db } from './db/index.js';
import { allQueues, redis } from './queues.js';
import { analyticsRoutes } from './routes/analytics.js';
import { briefingRoutes } from './routes/briefings.js';
import { leadsRoutes } from './routes/leads.js';
import { metaRoutes } from './routes/meta.js';
import { outreachRoutes } from './routes/outreach.js';
import { profileRoutes } from './routes/profile.js';
import { watchlistRoutes } from './routes/watchlist.js';
import { webhookRoutes } from './routes/webhooks.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const VERSION = process.env.npm_package_version ?? '1.0.0';

const app = Fastify({
    logger: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
    trustProxy: true,
});

// ── Plugins ───────────────────────────────────────────────────────────────────
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, {
    origin: (origin, cb) => {
        const allowed = [
            'http://localhost:3000',
            'http://localhost:3001',
            process.env.NEXT_PUBLIC_APP_URL,
            process.env.APP_URL,
        ].filter(Boolean) as string[];
        // Allow requests with no origin (server-to-server, curl, Render health checks)
        if (!origin || allowed.some(o => origin.startsWith(o)) || origin.endsWith('.vercel.app')) {
            cb(null, true);
        } else {
            cb(new Error('CORS: origin not allowed'), false);
        }
    },
    credentials: true,
});
// Global rate limit: 100 req/min (spec: AUTH-T04)
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

await app.register(swagger, {
    openapi: {
        info: { title: 'LeadFlow Engine API', version: VERSION },
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            },
        },
        security: [{ bearerAuth: [] }],
    },
});
await app.register(swaggerUi, { routePrefix: '/docs' });

// ── Bull Board (queue dashboard at /admin/queues) ─────────────────────────────
const bullBoardAdapter = new FastifyAdapter();
createBullBoard({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queues: allQueues.map(q => new BullMQAdapter(q) as any),
    serverAdapter: bullBoardAdapter,
});
await app.register(bullBoardAdapter.registerPlugin(), {
    prefix: '/admin/queues',
    basePath: '/admin/queues',
});

// ── Auth middleware ────────────────────────────────────────────────────────────
const PUBLIC_PATHS = new Set([
    '/health',
    '/webhooks/clerk',
    '/api/v1/meta/skills',
]);

// Validate required Clerk env vars at startup
if (!process.env.CLERK_SECRET_KEY) {
    app.log.error('CLERK_SECRET_KEY is not set — all authenticated requests will fail');
}

app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') return;

    const urlPath = req.url.split('?')[0];
    if (
        urlPath.startsWith('/admin/queues') ||
        urlPath.startsWith('/docs') ||
        PUBLIC_PATHS.has(urlPath)
    ) return;

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
        const token = authHeader.slice(7);
        const decoded = await verifyToken(token, {
            secretKey: process.env.CLERK_SECRET_KEY!,
            // Allow up to 60 s of clock skew between this server and Clerk's JWKS
            clockSkewInMs: 60_000,
        });
        (req as any).clerkUserId = decoded.sub;
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        req.log.warn({
            errMsg,
            tokenLen: authHeader.length,
            tokenPrefix: authHeader.slice(7, 27),
            secretKeySet: !!process.env.CLERK_SECRET_KEY,
            url: req.url,
        }, '[auth] token verification failed');
        return reply.status(401).send({ error: 'Invalid token' });
    }
});

// ── Health check (spec: L7-T01) ───────────────────────────────────────────────
app.get('/health', async () => {
    // DB probe
    let dbStatus: 'connected' | 'error' = 'connected';
    try {
        await db.execute(sql`SELECT 1`);
    } catch (err) {
        app.log.error({ err }, 'DB health probe failed');
        dbStatus = 'error';
    }

    // Redis probe
    let redisStatus: 'connected' | 'error' = 'connected';
    try {
        await redis.ping();
    } catch {
        redisStatus = 'error';
    }

    const status = dbStatus === 'connected' && redisStatus === 'connected' ? 'ok' : 'degraded';
    return { status, db: dbStatus, redis: redisStatus, version: VERSION };
});

// ── Application routes ────────────────────────────────────────────────────────
await app.register(webhookRoutes); // no /api prefix for webhooks
await app.register(metaRoutes, { prefix: '/api/v1' });
await app.register(leadsRoutes, { prefix: '/api/v1' });
await app.register(profileRoutes, { prefix: '/api/v1' });
await app.register(outreachRoutes, { prefix: '/api/v1' });
await app.register(analyticsRoutes, { prefix: '/api/v1' });
await app.register(briefingRoutes, { prefix: '/api/v1' });
await app.register(watchlistRoutes, { prefix: '/api/v1' });

// ── Start ─────────────────────────────────────────────────────────────────────
try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`LeadFlow API running on port ${PORT}`);
} catch (err) {
    app.log.error(err);
    process.exit(1);
}

export { app };

