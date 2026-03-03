/**
 * L5-T01: Watchlist Monitor Worker — runs every 2 hours
 *
 * For each company in a user's watchlist, runs 4 trigger event detectors:
 *   1. Crunchbase funding round detection  (L5-T02)
 *   2. Product Hunt launch detection        (L5-T03)
 *   3. GitHub star milestone detection      (L5-T04)
 *   4. Blog / hiring signal detection       (FR06-T06)
 *
 * When an event is detected, a proactive lead is created with
 * trigger_event populated, and the event stored in trigger_events.
 */

import { Queue, Worker } from 'bullmq';
import { and, eq, gte } from 'drizzle-orm';
import { db } from '../db.js';
import { connection } from '../redis.js';
import { leads, triggerEvents, watchlist } from '../schema.js';

// ─── Queue (repeatable scheduler) ────────────────────────────────────────────

const QUEUE_NAME = 'watchlist.monitor';

export const watchlistMonitorQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: { removeOnComplete: 10, removeOnFail: 50 },
});

// Schedule the monitor to run every 2 hours
watchlistMonitorQueue.add(
    'run',
    {},
    { repeat: { pattern: '0 */2 * * *' }, jobId: 'watchlist-monitor-recurring' }
).catch((err: Error) => console.error('[watchlistMonitor] Failed to schedule repeatable job:', err.message));

// ─── Detector helpers ─────────────────────────────────────────────────────────

const CRUNCHBASE_API_KEY = process.env.CRUNCHBASE_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PRODUCTHUNT_TOKEN = process.env.PRODUCTHUNT_TOKEN;

/** Extract root domain from a URL like "https://acme.com/about" → "acme.com" */
function rootDomain(url: string | null): string | null {
    if (!url) return null;
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

// ── Detector 1: Crunchbase Funding Round ─────────────────────────────────────

async function detectFundingRound(company: typeof watchlist.$inferSelect): Promise<{
    detected: boolean;
    eventData?: Record<string, unknown>;
    eventDate?: Date;
}> {
    if (!CRUNCHBASE_API_KEY) return { detected: false };
    if (!company.company_crunchbase_id && !company.company_url) return { detected: false };

    const permalink = company.company_crunchbase_id ?? rootDomain(company.company_url ?? null);
    if (!permalink) return { detected: false };

    try {
        const res = await fetch(
            `https://api.crunchbase.com/api/v4/entities/organizations/${encodeURIComponent(permalink)}?field_ids=funding_rounds&user_key=${CRUNCHBASE_API_KEY}`,
            { signal: AbortSignal.timeout(8_000) }
        );
        if (!res.ok) return { detected: false };

        const json = await res.json() as any;
        const rounds: any[] = json?.properties?.funding_rounds ?? [];
        const latestRound = rounds[0];
        if (!latestRound) return { detected: false };

        const announcedOn = new Date(latestRound.announced_on ?? 0);
        const daysSince = (Date.now() - announcedOn.getTime()) / 86_400_000;

        // Only trigger if round was announced within 14 days and is newer than our last check
        if (daysSince > 14) return { detected: false };
        if (company.latest_funding_round_at && announcedOn <= company.latest_funding_round_at) {
            return { detected: false };
        }

        return {
            detected: true,
            eventDate: announcedOn,
            eventData: {
                round_type: latestRound.funding_type ?? 'unknown',
                amount: latestRound.money_raised?.value_usd ?? null,
                currency: 'USD',
                lead_investor: latestRound.lead_investors?.[0]?.entity_def_id ?? null,
            },
        };
    } catch {
        return { detected: false };
    }
}

// ── Detector 2: Product Hunt Launch ──────────────────────────────────────────

async function detectProductHuntLaunch(company: typeof watchlist.$inferSelect): Promise<{
    detected: boolean;
    eventData?: Record<string, unknown>;
    eventDate?: Date;
}> {
    if (!PRODUCTHUNT_TOKEN) return { detected: false };
    const domain = rootDomain(company.company_url ?? null);
    if (!domain) return { detected: false };

    const query = `{
        posts(first: 5, order: NEWEST, topic: "tech") {
            edges { node { name tagline url votesCount createdAt maker { name website } } }
        }
    }`;

    try {
        const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${PRODUCTHUNT_TOKEN}`,
            },
            body: JSON.stringify({ query }),
            signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return { detected: false };

        const json = await res.json() as any;
        const posts: any[] = json?.data?.posts?.edges ?? [];

        for (const { node } of posts) {
            const makerDomain = rootDomain(node?.maker?.website ?? '');
            if (!makerDomain || !domain.includes(makerDomain) && !makerDomain.includes(domain)) continue;

            const createdAt = new Date(node.createdAt);
            const daysSince = (Date.now() - createdAt.getTime()) / 86_400_000;
            if (daysSince > 7 || node.votesCount < 50) continue;

            return {
                detected: true,
                eventDate: createdAt,
                eventData: {
                    product_name: node.name,
                    tagline: node.tagline,
                    url: node.url,
                    upvotes: node.votesCount,
                },
            };
        }
    } catch {
        // ignore
    }
    return { detected: false };
}

// ── Detector 3: GitHub Star Milestone ────────────────────────────────────────

const MILESTONES = [100, 500, 1_000, 5_000, 10_000, 50_000];

async function detectGitHubMilestone(company: typeof watchlist.$inferSelect): Promise<{
    detected: boolean;
    eventData?: Record<string, unknown>;
    eventDate?: Date;
    updatedBaseline?: Record<string, number>;
}> {
    if (!GITHUB_TOKEN) return { detected: false };
    const domain = rootDomain(company.company_url ?? null);
    if (!domain) return { detected: false };

    // Derive potential GitHub org name from domain
    const orgGuess = domain.split('.')[0];

    try {
        const res = await fetch(
            `https://api.github.com/orgs/${encodeURIComponent(orgGuess)}/repos?sort=stars&direction=desc&per_page=5`,
            {
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github.v3+json',
                },
                signal: AbortSignal.timeout(8_000),
            }
        );
        if (!res.ok) return { detected: false };

        const repos = (await res.json()) as any[];
        const baseline = (company.github_stars_baseline as Record<string, number> | null) ?? {};
        const updatedBaseline: Record<string, number> = { ...baseline };
        let detection: ReturnType<typeof detectGitHubMilestone> extends Promise<infer U> ? U : never = { detected: false };

        for (const repo of repos) {
            const stars: number = repo.stargazers_count ?? 0;
            const prev: number = baseline[repo.name] ?? 0;
            updatedBaseline[repo.name] = stars;

            // Check if we crossed a milestone since last check
            for (const milestone of MILESTONES) {
                if (prev < milestone && stars >= milestone) {
                    detection = {
                        detected: true,
                        eventDate: new Date(),
                        eventData: {
                            repo_name: repo.full_name,
                            star_count: stars,
                            milestone,
                            url: repo.html_url,
                        },
                        updatedBaseline,
                    };
                    break;
                }
            }
            if (detection.detected) break;
        }

        if (!detection.detected && Object.keys(updatedBaseline).length > 0) {
            detection = { detected: false, updatedBaseline };
        }
        return detection;
    } catch {
        return { detected: false };
    }
}

// ── Detector 4: Blog / Hiring Signal ─────────────────────────────────────────

async function detectBlogHiringSignal(company: typeof watchlist.$inferSelect): Promise<{
    detected: boolean;
    eventData?: Record<string, unknown>;
    eventDate?: Date;
}> {
    const domain = rootDomain(company.company_url ?? null);
    if (!domain) return { detected: false };

    // Try to fetch the company's blog RSS feed
    const rssUrls = [
        `https://${domain}/blog/feed`,
        `https://${domain}/feed.xml`,
        `https://${domain}/rss.xml`,
    ];

    const HIRING_SIGNALS = [
        /we'?re hiring/i, /join our team/i, /looking for.*engineer/i,
        /open position/i, /now hiring/i, /we'?re looking for/i,
    ];

    for (const url of rssUrls) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
            if (!res.ok) continue;
            const text = await res.text();

            // Check recent items (<7 days) for hiring signals
            const pubDateMatches = text.match(/<pubDate>([^<]+)<\/pubDate>/g) ?? [];
            const titleMatches = text.match(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>|<title>([^<]+)<\/title>/g) ?? [];

            for (let i = 0; i < Math.min(pubDateMatches.length, 5); i++) {
                const pubDateStr = pubDateMatches[i].replace(/<\/?pubDate>/g, '').trim();
                const title = titleMatches[i + 1]?.replace(/<title><!\[CDATA\[|\]\]><\/title>|<\/?title>/g, '').trim() ?? '';

                const pubDate = new Date(pubDateStr);
                if (isNaN(pubDate.getTime())) continue;
                if ((Date.now() - pubDate.getTime()) / 86_400_000 > 7) continue;
                if (HIRING_SIGNALS.some(re => re.test(title))) {
                    return {
                        detected: true,
                        eventDate: pubDate,
                        eventData: { post_title: title, post_url: url, blog_rss: url },
                    };
                }
            }
        } catch {
            // RSS feed not available — skip
        }
    }
    return { detected: false };
}

// ── Dedup guard ───────────────────────────────────────────────────────────────

async function alreadyDetectedThisWeek(watchlistId: string, eventType: string): Promise<boolean> {
    const [row] = await db
        .select({ id: triggerEvents.id })
        .from(triggerEvents)
        .where(and(
            eq(triggerEvents.watchlist_id, watchlistId),
            eq(triggerEvents.event_type, eventType),
            gte(triggerEvents.created_at, new Date(Date.now() - 7 * 86_400_000)),
        ))
        .limit(1);
    return !!row;
}

// ── Proactive lead creation ───────────────────────────────────────────────────

async function createProactiveLead(
    userId: string,
    company: typeof watchlist.$inferSelect,
    eventType: string,
    eventData: Record<string, unknown>,
    eventDate: Date,
): Promise<string> {
    const angleByType: Record<string, string> = {
        FUNDING_ROUND: `${company.company_name} just raised funding — teams at this growth stage typically accelerate hiring and project work.`,
        PRODUCTHUNT_LAUNCH: `${company.company_name} just launched on Product Hunt — post-launch teams need execution support fast.`,
        GITHUB_MILESTONE: `${company.company_name} hit a GitHub star milestone — momentum like this often means scaling challenges ahead.`,
        BLOG_HIRING_SIGNAL: `${company.company_name} is signaling team growth on their blog — a good time to reach out.`,
    };

    const titleByType: Record<string, string> = {
        FUNDING_ROUND: `[Watchlist] ${company.company_name} raised ${eventData.round_type ?? 'new'} funding`,
        PRODUCTHUNT_LAUNCH: `[Watchlist] ${company.company_name} launched on Product Hunt`,
        GITHUB_MILESTONE: `[Watchlist] ${company.company_name} hit ${eventData.milestone?.toLocaleString()} GitHub stars`,
        BLOG_HIRING_SIGNAL: `[Watchlist] ${company.company_name} is hiring (blog signal)`,
    };

    const [inserted] = await db.insert(leads).values({
        source: 'watchlist',
        source_id: `watchlist_${company.id}_${eventType}_${eventDate.toISOString().slice(0, 10)}`,
        title: titleByType[eventType] ?? `[Watchlist] ${company.company_name} trigger event`,
        description: angleByType[eventType] ?? '',
        url: company.company_url ?? '',
        client_name: company.company_name,
        client_url: company.company_url,
        status: 'new',
        golden_hour: true, // proactive leads get golden hour treatment
        trigger_event: {
            type: eventType,
            event_date: eventDate.toISOString(),
            event_data: eventData,
            watchlist_id: company.id,
        },
    }).onConflictDoNothing().returning({ id: leads.id });

    return inserted?.id ?? '';
}

// ─── Main worker ──────────────────────────────────────────────────────────────

export const watchlistMonitorWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
        job.log('Starting watchlist monitor run');

        const allWatchlist = await db.select().from(watchlist);
        job.log(`Checking ${allWatchlist.length} watchlist entries`);

        for (const entry of allWatchlist) {
            job.log(`Processing ${entry.company_name} for user ${entry.user_id}`);

            const detectors: Array<{
                type: string;
                fn: () => Promise<{ detected: boolean; eventData?: Record<string, unknown>; eventDate?: Date; updatedBaseline?: Record<string, number> }>;
            }> = [
                    { type: 'FUNDING_ROUND', fn: () => detectFundingRound(entry) },
                    { type: 'PRODUCTHUNT_LAUNCH', fn: () => detectProductHuntLaunch(entry) },
                    { type: 'GITHUB_MILESTONE', fn: () => detectGitHubMilestone(entry) },
                    { type: 'BLOG_HIRING_SIGNAL', fn: () => detectBlogHiringSignal(entry) },
                ];

            const results = await Promise.all(detectors.map(d => d.fn().catch(() => ({ detected: false as const }))));

            for (let i = 0; i < detectors.length; i++) {
                const { type } = detectors[i];
                const result = results[i] as any;

                if (!result.detected || !result.eventDate) continue;
                if (await alreadyDetectedThisWeek(entry.id, type)) {
                    job.log(`[${type}] already detected this week for ${entry.company_name} — skipping`);
                    continue;
                }

                job.log(`[${type}] Detected for ${entry.company_name}!`);

                const leadId = await createProactiveLead(
                    entry.user_id,
                    entry,
                    type,
                    result.eventData ?? {},
                    result.eventDate,
                );

                await db.insert(triggerEvents).values({
                    watchlist_id: entry.id,
                    user_id: entry.user_id,
                    company_name: entry.company_name,
                    event_type: type,
                    event_date: result.eventDate,
                    event_data: result.eventData ?? {},
                    lead_id: leadId || null,
                });

                // Update watchlist metadata for smarter future checks
                if (type === 'FUNDING_ROUND' && result.eventDate) {
                    await db.update(watchlist)
                        .set({ latest_funding_round_at: result.eventDate })
                        .where(eq(watchlist.id, entry.id));
                }
                if (type === 'GITHUB_MILESTONE' && result.updatedBaseline) {
                    await db.update(watchlist)
                        .set({ github_stars_baseline: result.updatedBaseline })
                        .where(eq(watchlist.id, entry.id));
                }
            }

            // Update GitHub baseline even when no milestone crossed
            const ghResult = results[2] as any;
            if (!ghResult.detected && ghResult.updatedBaseline) {
                await db.update(watchlist)
                    .set({ github_stars_baseline: ghResult.updatedBaseline, last_checked_at: new Date() })
                    .where(eq(watchlist.id, entry.id));
            } else {
                await db.update(watchlist)
                    .set({ last_checked_at: new Date() })
                    .where(eq(watchlist.id, entry.id));
            }
        }

        job.log('Watchlist monitor run complete');
    },
    { connection, concurrency: 1 }
);

watchlistMonitorWorker.on('failed', (job, err) => {
    console.error(`[watchlistMonitor] job ${job?.id} failed:`, err.message);
});
