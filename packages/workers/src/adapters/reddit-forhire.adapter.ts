import type { Lead, RawLeadItem, SourceAdapter } from '@leadflow/types';

/**
 * Reddit freelance project adapter
 *
 * Sources:
 *   r/forhire           — [Hiring] posts from clients with projects or gigs
 *   r/freelance_forhire — dedicated freelance sub; [Hiring] only
 *
 * We accept posts where the client is explicitly looking for someone to do
 * work (title starts [Hiring] or [HIRING]) AND the post isn't a full-time
 * employment ad.  [For Hire] posts (freelancers advertising themselves) are
 * dismissed so they never pollute the lead feed.
 */

// Keywords that confirm a post is a freelance/contract opportunity
const FREELANCE_SIGNALS = [
    /\bfreelance\b/i,
    /\bcontract(or|ing)?\b/i,
    /\bproject\b/i,
    /\bgig\b/i,
    /\bhourly\b/i,
    /\bpart[- ]time\b/i,
    /\bone[- ](off|time)\b/i,
    /\bfixed[- ]price\b/i,
    /\bmilestone\b/i,
    /\bremote work\b/i,
];

// Keywords that reveal a post is an employment offer, not a freelance project
const EMPLOYMENT_SIGNALS = [
    /\bfull[- ]time\b/i,
    /\bpermanent (role|position|job)\b/i,
    /\b401[kK]\b/,
    /\bhealth insurance\b/i,
    /\bstock options\b/i,
    /\bequity (package|comp)\b/i,
    /\bw-?2 employee\b/i,
    /\bsalary\s*:\s*\$[\d,]+/i,
];

function isFreelanceHiring(title: string, body: string): boolean {
    const text = `${title} ${body}`;
    // Must be labelled [Hiring] by the poster
    if (!/^\[hiring\]/i.test(title.trim())) return false;
    // If 2+ employment signals appear, treat as a job ad and skip
    const employmentMatches = EMPLOYMENT_SIGNALS.filter(re => re.test(text)).length;
    if (employmentMatches >= 2) return false;
    return true;
}

const SUBREDDITS = [
    'forhire',
    'freelance_forhire',
    'hiring',      // broader hiring sub — still yields [Hiring] freelance/contract posts
];

interface RedditPost {
    id: string;
    title: string;
    selftext: string;
    permalink: string;
    created_utc: number;
    subreddit: string;
    score: number;
    [key: string]: unknown;
}

export class RedditForHireAdapter implements SourceAdapter {
    id = 'reddit_forhire';
    schedule = '*/30 * * * *';

    /**
     * Reddit unauthenticated JSON API rate limit:
     * ~1 request per 2 seconds per IP is safe. We add a 2-second delay between
     * subreddit fetches. Reddit also returns 429 with a Retry-After header when
     * the limit is exceeded — we honour that.
     *
     * User-Agent: Reddit requires a descriptive UA. Set REDDIT_USER_AGENT in .env:
     *   e.g. "LeadFlowBot/1.0 by /u/your_reddit_username"
     */
    async poll(): Promise<RawLeadItem[]> {
        const results: RawLeadItem[] = [];

        for (let i = 0; i < SUBREDDITS.length; i++) {
            const sub = SUBREDDITS[i]!;
            // 2-second gap between requests — stays well within Reddit's ~1 req/2s guideline
            if (i > 0) await new Promise(r => setTimeout(r, 2000));
            try {
                const posts = await this.fetchSubreddit(sub);
                results.push(...posts);
            } catch (err) {
                console.warn(`[reddit] failed to fetch r/${sub}:`, (err as Error).message);
            }
        }

        // Deduplicate by post id
        const seen = new Set<string>();
        return results.filter(r => {
            if (seen.has(r.rawId)) return false;
            seen.add(r.rawId);
            return true;
        });
    }

    private async fetchSubreddit(sub: string): Promise<RawLeadItem[]> {
        const url = `https://www.reddit.com/r/${sub}/new.json?limit=100&sort=new&t=day`;
        const resp = await fetch(url, {
            headers: { 'User-Agent': process.env.REDDIT_USER_AGENT ?? 'LeadFlowBot/1.0 (by /u/leadflow_bot)' },
        });

        // Honour Retry-After on 429 — Reddit is explicit about this
        if (resp.status === 429) {
            const retryAfter = Number(resp.headers.get('retry-after') ?? 60);
            console.warn(`[reddit] r/${sub} rate limited. Retry-After=${retryAfter}s. Skipping this sub.`);
            return [];
        }
        if (!resp.ok) return [];

        const data = (await resp.json()) as {
            data?: { children?: Array<{ data: RedditPost }> };
        };

        return (data?.data?.children ?? []).map(({ data: post }) => ({
            rawId: post.id,
            raw: post as unknown as Record<string, unknown>,
            fetchedAt: new Date(post.created_utc * 1000),
        }));
    }

    normalize(item: RawLeadItem): Partial<Lead> {
        const raw = item.raw as RedditPost;
        const title = raw.title ?? '';
        const body = raw.selftext ?? '';

        // Freelancers advertising themselves → dismiss (not a project lead)
        if (/^\[for hire\]/i.test(title.trim())) {
            return {
                source: this.id,
                source_id: item.rawId,
                title,
                description: body,
                url: `https://reddit.com${raw.permalink ?? ''}`,
                status: 'dismissed',
            };
        }

        // Client looking for someone → check it's a freelance post, not employment
        if (!isFreelanceHiring(title, body)) {
            return {
                source: this.id,
                source_id: item.rawId,
                title,
                description: body,
                url: `https://reddit.com${raw.permalink ?? ''}`,
                status: 'dismissed',
            };
        }

        return {
            source: this.id,
            source_id: item.rawId,
            title: title.replace(/^\[hiring\]\s*/i, '').trim(),
            description: body,
            url: `https://reddit.com${raw.permalink ?? ''}`,
            status: 'new',
            remote: FREELANCE_SIGNALS.some(re => re.test(`${title} ${body}`)) ||
                /remote/i.test(`${title} ${body}`),
        };
    }

    async healthCheck() {
        try {
            const resp = await fetch(
                'https://www.reddit.com/r/forhire/new.json?limit=1',
                { headers: { 'User-Agent': process.env.REDDIT_USER_AGENT ?? 'LeadFlowBot/1.0' } }
            );
            return resp.ok ? 'healthy' : 'degraded';
        } catch {
            return 'down';
        }
    }
}
