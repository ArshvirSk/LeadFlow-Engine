import type { Lead, RawLeadItem, SourceAdapter } from '@leadflow/types';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RssParser = require('rss-parser') as typeof import('rss-parser');

/**
 * Product Hunt adapter
 *
 * Why: Every product that launches on PH was built by a founder. That founder
 * just shipped, is overwhelmed with launch-day feedback, and is already thinking
 * about v2, a mobile app, integrations, or scaling. Outreach within 6 hours of
 * launch with a specific reference to what they built converts significantly
 * better than any cold email to a job post.
 *
 * Feed: https://www.producthunt.com/feed (Atom format, 50 entries)
 * Auth: None — public feed, updates daily around midnight PT.
 * Note: These are NOT job posts. They are launch-trigger signals. The lead
 * status is 'new' and flows through scoring where the product description is
 * used to match against the freelancer's skill portfolio.
 *
 * rss-parser handles Atom feeds natively:
 *   <title>   → item.title
 *   <link href> → item.link
 *   <id>      → item.guid (format: "tag:www.producthunt.com,2005:Post/XXXXXX")
 *   <content> → item.content (HTML)
 *   <published>/<updated> → item.pubDate / item.isoDate
 */
const FEED_URL = 'https://www.producthunt.com/feed';

/** Strip HTML tags from Product Hunt content field */
function stripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/** Extract numeric PH post ID from atom <id> tag  */
function extractPostId(guid: string): string {
    const match = guid.match(/Post\/(\d+)/);
    return match ? match[1] : guid;
}

interface PHAtomItem {
    guid?: string;
    title?: string;
    link?: string;
    content?: string;
    isoDate?: string;
    pubDate?: string;
}

export class ProductHuntAdapter implements SourceAdapter {
    id = 'producthunt';
    // PH feed updates once per day — poll every 6 hours for same-day coverage
    schedule = '0 */6 * * *';

    private parser = new RssParser({
        headers: { 'User-Agent': 'LeadFlowBot/1.0 (lead aggregator)' },
        // rss-parser handles Atom <content> via the 'content' field automatically
    });

    async poll(): Promise<RawLeadItem[]> {
        try {
            const feed = await this.parser.parseURL(FEED_URL);
            const items = (feed.items ?? []) as PHAtomItem[];

            return items.map(item => {
                const postId = item.guid ? extractPostId(item.guid) : String(Date.now());
                const dateStr = item.isoDate ?? item.pubDate;
                return {
                    rawId: postId,
                    raw: item as unknown as Record<string, unknown>,
                    fetchedAt: dateStr ? new Date(dateStr) : new Date(),
                };
            });
        } catch (err) {
            console.warn('[producthunt] poll failed:', (err as Error).message);
            return [];
        }
    }

    normalize(item: RawLeadItem): Partial<Lead> {
        const raw = item.raw as PHAtomItem;
        const productName = raw.title ?? '';
        const description = raw.content ? stripHtml(raw.content) : '';

        return {
            source: this.id,
            source_id: item.rawId,
            title: `[PH Launch] ${productName}`,
            description,
            url: raw.link ?? `https://www.producthunt.com/posts/${item.rawId}`,
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
