import type { Lead, RawLeadItem, SourceAdapter } from '@leadflow/types';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RssParser = require('rss-parser') as typeof import('rss-parser');

/**
 * Crunchbase News adapter
 *
 * Why: Crunchbase News covers funding rounds with more startup-specific detail
 * than TechCrunch — company stage, sector, and investor names are usually in
 * the snippet. Together with TechCrunch, these two feeds give near-complete
 * coverage of seed-to-Series-B raises which are the sweet spot for freelance
 * outreach ("you just got funded, you're about to hire").
 *
 * Feed: https://news.crunchbase.com/feed/
 * Auth: None — public RSS, ~10 articles per fetch.
 * Schedule: Every 4 hours (CB publishes less frequently than TC).
 */
const FEED_URL = 'https://news.crunchbase.com/feed/';

const FUNDING_SIGNALS = [
    /\braised?\b/i,
    /\bseed\b/i,
    /\bseries [a-e]\b/i,
    /\bfunding round\b/i,
    /\binvestment\b/i,
    /\$\s*[\d.]+\s*[MmBb]/,
    /\bpre-seed\b/i,
    /\bventure\b/i,
    /\bround\b/i,
    /\bclosed\b.*\bfunding\b/i,
];

const SKIP_SIGNALS = [
    /\blayoff/i,
    /\bcuts?\s+\d+/i,
    /\bacquisition\b/i,
    /\bacquires?\b/i,
    /\bIPO\b/,
    /\bbankrupt/i,
    /\bshuts?\s+down/i,
    /\breadthrough\b/i,    // research news, not a raise
];

function isFundingArticle(title: string, snippet: string): boolean {
    const text = `${title} ${snippet}`;
    if (SKIP_SIGNALS.some(re => re.test(text))) return false;
    return FUNDING_SIGNALS.some(re => re.test(text));
}

function extractFundingAmount(text: string): string | null {
    const match = text.match(/\$\s*([\d.]+)\s*([MmBb](?:illion)?)/);
    if (!match) return null;
    const suffix = /[Bb]/.test(match[2]) ? 'B' : 'M';
    return `$${match[1]}${suffix}`;
}

interface CBFeedItem {
    guid?: string;
    link?: string;
    title?: string;
    contentSnippet?: string;
    content?: string;
    pubDate?: string;
}

export class CrunchbaseNewsAdapter implements SourceAdapter {
    id = 'crunchbase_news';
    schedule = '0 */4 * * *'; // every 4 hours

    private parser = new RssParser({
        headers: { 'User-Agent': 'LeadFlowBot/1.0 (lead aggregator)' },
    });

    async poll(): Promise<RawLeadItem[]> {
        try {
            const feed = await this.parser.parseURL(FEED_URL);
            const items = (feed.items ?? []) as CBFeedItem[];

            return items
                .filter(item => isFundingArticle(item.title ?? '', item.contentSnippet ?? ''))
                .map(item => ({
                    rawId: item.guid ?? item.link ?? String(Date.now()),
                    raw: item as unknown as Record<string, unknown>,
                    fetchedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
                }));
        } catch (err) {
            console.warn('[crunchbase_news] poll failed:', (err as Error).message);
            return [];
        }
    }

    normalize(item: RawLeadItem): Partial<Lead> {
        const raw = item.raw as CBFeedItem;
        const title = raw.title ?? '';
        const snippet = raw.contentSnippet ?? raw.content ?? '';
        const amount = extractFundingAmount(`${title} ${snippet}`);

        return {
            source: this.id,
            source_id: item.rawId,
            title: amount ? `[Funding: ${amount}] ${title}` : `[Funding] ${title}`,
            description: snippet,
            url: raw.link ?? '',
            status: 'new',
            remote: true,
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
