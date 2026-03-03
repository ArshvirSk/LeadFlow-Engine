import type { Lead, RawLeadItem, SourceAdapter } from '@leadflow/types';

/**
 * Reddit Founder Subreddits adapter
 *
 * Why: These subreddits are where founders talk *about* building — not where
 * freelancers advertise. The intent signals are buried in post titles and bodies
 * ("can't figure out this integration", "looking to hire someone for my MVP",
 * "anyone built X before"). These leads are warmer and less competitive than
 * any job board because the person hasn't framed it as a job post yet.
 *
 * Subreddits:
 *   r/SaaS          — founders discussing SaaS products; contract dev requests
 *   r/startups      — early-stage founders, many solo and looking for contractors
 *   r/microsaas     — bootstrapped founders who regularly pay contractors
 *   r/nocode        — founders who hit the ceiling of no-code and need real dev
 *   r/Entrepreneur  — broad but high-volume; keyword filter keeps quality up
 *
 * Filtering: Unlike r/forhire (which uses [Hiring] flair), these subs don't have
 * a standard flair. We instead look for intent signals in the title/body.
 */

// Signals that the poster has a development need and may have budget
const HIRE_INTENT = [
    /\blooking (to hire|for (a |an )?(developer|engineer|designer|coder|freelancer|contractor))\b/i,
    /\bneed (a |an )?(developer|engineer|coder|programmer|designer|freelancer|contractor)\b/i,
    /\bhire (a |an )?(developer|engineer|freelancer|contractor|coder)\b/i,
    /\bbuild(ing)? (my|our|an?|the) (app|website|web app|saas|mvp|product|tool|platform|startup)\b/i,
    /\blooking for (someone|a dev|help) to build\b/i,
    /\banyone (available|interested) (to build|to help|for hire)\b/i,
    /\b(need|want|looking for) (help|someone) (with|to) (coding|development|building|programming)\b/i,
    /\b(mvp|prototype|poc)\b.*\bhire\b/i,
    /\bhire\b.*\b(mvp|prototype|poc)\b/i,
    /\bopen to (contracting|contract work|freelance)\b/i,
    /\banyone (know|recommend).*(developer|dev|coder|engineer)\b/i,
    /\bcan anyone build\b/i,
    /\bwilling to pay\b/i,
    /\blooking to partner\b.*(technical|dev|engineer)/i,
];

// Signals the poster is a job-seeker or freelancer advertising — skip these
const SKIP_INTENT = [
    /^\[for hire\]/i,
    /^\[hiring\]/i,    // handled by the forhire adapter
    /\bi('m| am) (available|open to work|looking for work|seeking (a |)job)\b/i,
    /\bmy (portfolio|resume|cv|github|services)\b/i,
    /\bhire me\b/i,
    /\bavailable for (hire|freelance|contract)\b/i,
];

// Posts with very low engagement likely have no budget or are abandoned
const MIN_SCORE = 1; // upvotes — filter out zero/negative posts

function hasHireIntent(title: string, body: string): boolean {
    const titleLower = title.trim();
    if (SKIP_INTENT.some(re => re.test(titleLower))) return false;
    const text = `${title} ${body}`;
    return HIRE_INTENT.some(re => re.test(text));
}

const SUBREDDITS = [
    'SaaS',
    'startups',
    'microsaas',
    'nocode',
    'Entrepreneur',
];

interface RedditPost {
    id: string;
    title: string;
    selftext: string;
    permalink: string;
    created_utc: number;
    subreddit: string;
    score: number;
    url: string;
    [key: string]: unknown;
}

export class RedditFounderAdapter implements SourceAdapter {
    id = 'reddit_founder';
    schedule = '*/30 * * * *';

    /**
     * Reddit unauthenticated JSON API: ~1 req/2 sec per IP.
     * 5 subreddits × 2s delay = ~10s total poll time — well within limits.
     * 429 responses include a Retry-After header; we skip the sub and continue.
     */
    async poll(): Promise<RawLeadItem[]> {
        const results: RawLeadItem[] = [];

        for (let i = 0; i < SUBREDDITS.length; i++) {
            const sub = SUBREDDITS[i]!;
            // 2-second inter-request delay respects Reddit's ~1 req/2s guideline
            if (i > 0) await new Promise(r => setTimeout(r, 2000));
            try {
                const posts = await this.fetchSubreddit(sub);
                results.push(...posts);
            } catch (err) {
                console.warn(`[reddit_founder] failed to fetch r/${sub}:`, (err as Error).message);
            }
        }

        // Deduplicate across subs
        const seen = new Set<string>();
        return results.filter(r => !seen.has(r.rawId) && seen.add(r.rawId) as unknown as boolean);
    }

    private async fetchSubreddit(sub: string): Promise<RawLeadItem[]> {
        const url = `https://www.reddit.com/r/${sub}/new.json?limit=100&sort=new&t=day`;
        const resp = await fetch(url, {
            headers: { 'User-Agent': process.env.REDDIT_USER_AGENT ?? 'LeadFlowBot/1.0 (by /u/leadflow_bot)' },
        });

        if (resp.status === 429) {
            const retryAfter = Number(resp.headers.get('retry-after') ?? 60);
            console.warn(`[reddit_founder] r/${sub} rate limited. Retry-After=${retryAfter}s. Skipping.`);
            return [];
        }
        if (!resp.ok) return [];

        const data = (await resp.json()) as {
            data?: { children?: Array<{ data: RedditPost }> };
        };

        return (data?.data?.children ?? [])
            .map(c => c.data)
            .filter(post =>
                post.score >= MIN_SCORE &&
                hasHireIntent(post.title, post.selftext)
            )
            .map(post => ({
                rawId: `${post.subreddit}_${post.id}`,
                raw: post as unknown as Record<string, unknown>,
                fetchedAt: new Date(post.created_utc * 1000),
            }));
    }

    normalize(item: RawLeadItem): Partial<Lead> {
        const raw = item.raw as RedditPost;
        const title = raw.title ?? '';
        const body = raw.selftext ?? '';
        const sub = raw.subreddit ?? '';

        return {
            source: this.id,
            source_id: item.rawId,
            title: `[r/${sub}] ${title}`,
            description: body,
            url: `https://reddit.com${raw.permalink ?? ''}`,
            status: 'new',
            remote: /remote/i.test(`${title} ${body}`),
        };
    }

    async healthCheck() {
        try {
            const resp = await fetch(
                'https://www.reddit.com/r/SaaS/new.json?limit=1',
                { headers: { 'User-Agent': process.env.REDDIT_USER_AGENT ?? 'LeadFlowBot/1.0' } }
            );
            return resp.ok ? 'healthy' : 'degraded';
        } catch {
            return 'down';
        }
    }
}
