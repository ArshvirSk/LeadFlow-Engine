import type { Lead, RawLeadItem, SourceAdapter } from '@leadflow/types';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RssParser = require('rss-parser') as typeof import('rss-parser');

/**
 * TechCrunch Funding adapter
 *
 * Why: Companies that just received seed / Series A funding are in active hiring
 * mode 30–60 days later. This adapter captures that trigger signal *before* the
 * job post exists — the outreach angle is "congrats on the raise, here's how I
 * can help you move fast with the new budget".
 *
 * Feed: https://techcrunch.com/tag/funding/feed/
 * Auth: None — public RSS, updates daily.
 * Note: These are NOT job postings. They are trigger-event signals that feed the
 * proactive outreach pipeline (FR06 Trigger-Event Outreach). The normalized
 * Lead has status: 'new' so it flows through scoring where funding_event context
 * from the description boosts the score.
 */
const FEED_URL = 'https://techcrunch.com/tag/funding/feed/';

// Funding keywords that confirm this article is about a raise (not an acquisition,
// layoff, IPO, etc. which are sometimes tagged "funding" on TC)
const FUNDING_SIGNALS = [
    /\braised?\b/i,
    /\bseed\b/i,
    /\bseries [a-e]\b/i,
    /\bfunding round\b/i,
    /\binvestment\b/i,
    /\$\d+[MmBb]/,
    /\bpre-seed\b/i,
    /\bventure\b/i,
];

// Keywords that indicate this is NOT an actionable hire signal
const SKIP_SIGNALS = [
    /\blayoff/i,
    /\bcuts? \d+/i,
    /\bacquisition\b/i,
    /\bacquires?\b/i,
    /\bIPO\b/,
    /\bbankrupt/i,
    /\bshuts? down/i,
];

function isFundingArticle(title: string, snippet: string): boolean {
    const text = `${title} ${snippet}`;
    if (SKIP_SIGNALS.some(re => re.test(text))) return false;
    return FUNDING_SIGNALS.some(re => re.test(text));
}

/** Extract a rough dollar amount from the title/snippet for display */
function extractFundingAmount(text: string): string | null {
    const match = text.match(/\$\s*([\d.]+)\s*([MmBb](?:illion)?)/);
    if (!match) return null;
    const num = match[1];
    const suffix = /[Bb]/.test(match[2]) ? 'B' : 'M';
    return `$${num}${suffix}`;
}

interface TCFeedItem {
    guid?: string;
    link?: string;
    title?: string;
    contentSnippet?: string;
    content?: string;
    pubDate?: string;
    dc?: { creator?: string };
    categories?: string[];
}

export class TechCrunchFundingAdapter implements SourceAdapter {
    id = 'techcrunch_funding';
    schedule = '0 */2 * * *'; // every 2 hours — TC funding articles land a few per day

    private parser = new RssParser({
        customFields: {
            item: [['dc:creator', 'dc']],
        },
        headers: { 'User-Agent': 'LeadFlowBot/1.0 (lead aggregator)' },
    });

    async poll(): Promise<RawLeadItem[]> {
        try {
            const feed = await this.parser.parseURL(FEED_URL);
            const items = (feed.items ?? []) as TCFeedItem[];

            return items
                .filter(item => isFundingArticle(item.title ?? '', item.contentSnippet ?? ''))
                .map(item => ({
                    rawId: item.guid ?? item.link ?? String(Date.now()),
                    raw: item as unknown as Record<string, unknown>,
                    fetchedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
                }));
        } catch (err) {
            console.warn('[techcrunch_funding] poll failed:', (err as Error).message);
            return [];
        }
    }

    normalize(item: RawLeadItem): Partial<Lead> {
        const raw = item.raw as TCFeedItem;
        const title = raw.title ?? '';
        const snippet = raw.contentSnippet ?? raw.content ?? '';
        const amount = extractFundingAmount(`${title} ${snippet}`);

        return {
            source: this.id,
            source_id: item.rawId,
            // Title: "<Company> raises $XM Series A" — keep as-is, it's the trigger signal
            title: amount ? `[Funding: ${amount}] ${title}` : `[Funding] ${title}`,
            description: snippet,
            url: raw.link ?? '',
            status: 'new',
            remote: true, // Funded startups almost universally hire remote
        };
    }

    async healthCheck() {
        try {
            const resp = await fetch(FEED_URL, {
                headers: { 'User-Agent': 'LeadFlowBot/1.0' },
            });
            return resp.ok ? 'healthy' : 'degraded';
        } catch {
            return 'down';
        }
    }
}
