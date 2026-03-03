import 'dotenv/config';
import { createServer } from 'http';

// ── Core workers (normalization + scoring + outreach) ─────────────────────────
import './workers/autopilot.js';
import './workers/briefing.js';
import './workers/debrief.js';
import './workers/embeddings.js';
import './workers/outreach.js';
import './workers/rawLeads.js';
import './workers/scoring.js';
import './workers/watchlistMonitor.js';

// ── L1 Ingestion — schedule all source adapters ───────────────────────────────
import { CrunchbaseNewsAdapter } from './adapters/crunchbase-news.adapter.js';
import { GitHubHelpWantedAdapter } from './adapters/github-helpwanted.adapter.js';
import { HNHiringAdapter } from './adapters/hn-hiring.adapter.js';
import { ProductHuntAdapter } from './adapters/producthunt.adapter.js';
import { RedditForHireAdapter } from './adapters/reddit-forhire.adapter.js';
import { RedditFounderAdapter } from './adapters/reddit-founder.adapter.js';
import { RemoteOKAdapter } from './adapters/remoteok.adapter.js';
import { TechCrunchFundingAdapter } from './adapters/techcrunch-funding.adapter.js';
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
        new RedditFounderAdapter(),
        new UpworkAdapter(),
        new TechCrunchFundingAdapter(),
        new CrunchbaseNewsAdapter(),
        new ProductHuntAdapter(),
        new GitHubHelpWantedAdapter(),
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
        console.log('[ingestion] 10 adapters registered:');
        console.log('  ─── Job boards ───────────────────────────────────────────────');
        console.log('  • Remotive.io      — /api/remote-jobs (contract + freelance + part-time)');
        console.log('  • RemoteOK         — /api (JSON, all remote listings)');
        console.log('  • WeWorkRemotely   — /categories/remote-programming-jobs.rss + design.rss');
        console.log('  ─── Community / Direct intent ────────────────────────────────');
        console.log('  • Reddit [Hiring]  — r/forhire + r/freelance_forhire + r/hiring');
        console.log('  • Reddit Founders  — r/SaaS + r/startups + r/microsaas + r/nocode + r/Entrepreneur');
        console.log('  • HN Freelancer    — "Freelancer? Seeking freelancer?" [SEEKING FREELANCER]');
        console.log('  • GitHub           — help-wanted + bounty issues (set GITHUB_TOKEN for 5k req/hr)');
        console.log('  ─── Trigger signals (outreach before a job post exists) ──────');
        console.log('  • TechCrunch       — /tag/funding/feed/ (seed → Series B raises)');
        console.log('  • Crunchbase News  — /feed/ (funding rounds, more startup detail)');
        console.log('  • Product Hunt     — /feed (daily launches = founder outreach signal)');

        // ── Minimal health-check HTTP server (workers health probe) ────────────
        const port = Number(process.env.HEALTH_PORT ?? 3002);
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

