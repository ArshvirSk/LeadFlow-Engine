import 'dotenv/config';
import { createServer } from 'http';

// ── Core workers (normalization + scoring + outreach) ─────────────────────────
import './workers/autopilot.js';
import './workers/briefing.js';
import './workers/embeddings.js';
import './workers/outreach.js';
import './workers/rawLeads.js';
import './workers/scoring.js';

// ── L1 Ingestion — schedule all source adapters ───────────────────────────────
import { HNHiringAdapter } from './adapters/hn-hiring.adapter.js';
import { RedditForHireAdapter } from './adapters/reddit-forhire.adapter.js';
import { RemoteOKAdapter } from './adapters/remoteok.adapter.js';
import { UpworkAdapter } from './adapters/upwork.adapter.js';
import { WeWorkRemotelyAdapter } from './adapters/weworkremotely.adapter.js';
import { IngestionWorker } from './ingestion/IngestionWorker.js';

async function startIngestion() {
    const ingestion = new IngestionWorker();

    const adapters = [
        new HNHiringAdapter(),
        new RemoteOKAdapter(),
        new WeWorkRemotelyAdapter(),
        new RedditForHireAdapter(),
        new UpworkAdapter(),
    ];

    for (const adapter of adapters) {
        await ingestion.register(adapter);
        // Trigger an immediate poll on startup so we have data right away
        await ingestion.triggerNow(adapter.id);
    }

    return ingestion;
}

startIngestion()
    .then(() => {
        console.log('[workers] All workers started');
        console.log('[ingestion] 5 adapters registered:');
        console.log('  • Upwork           — freelance project feed (GraphQL)');
        console.log('  • RemoteOK         — /remote-freelance-jobs.xml');
        console.log('  • WeWorkRemotely   — /categories/remote-contract-jobs.rss');
        console.log('  • Reddit           — r/forhire + r/freelance_forhire [Hiring] only');
        console.log('  • HN Freelancer    — "Freelancer? Seeking freelancer?" [SEEKING FREELANCER]');

        // ── Minimal health-check HTTP server (Fly.io probe on port 3001) ─────────
        const port = Number(process.env.HEALTH_PORT ?? 3001);
        createServer((_, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', ts: new Date().toISOString() }));
        }).listen(port, () => {
            console.log(`[workers] Health server listening on :${port}`);
        });
    })
    .catch((err: Error) => {
        console.error('[workers] Failed to start ingestion:', err.message);
        process.exit(1);
    });

process.on('SIGTERM', async () => {
    console.log('[workers] SIGTERM received, shutting down...');
    process.exit(0);
});

