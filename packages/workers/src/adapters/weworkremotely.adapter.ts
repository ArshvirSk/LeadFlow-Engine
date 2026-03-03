import type { Lead, RawLeadItem, SourceAdapter } from '@leadflow/types';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RssParser = require('rss-parser') as typeof import('rss-parser');

/**
 * WeWorkRemotely adapter
 *
 * The old /categories/remote-contract-jobs.rss URL no longer exists (301 redirect
 * loop with empty body). The working category RSS feeds are used instead.
 * Both programming and design are included — clients in both categories hire freelancers.
 */
const RSS_FEEDS = [
    'https://weworkremotely.com/categories/remote-programming-jobs.rss',
    'https://weworkremotely.com/categories/remote-design-jobs.rss',
];

export class WeWorkRemotelyAdapter implements SourceAdapter {
    id = 'weworkremotely';
    schedule = '*/30 * * * *';
    private parser = new RssParser({
        headers: { 'User-Agent': 'LeadFlowBot/1.0 (lead aggregator)' },
    });

    async poll(): Promise<RawLeadItem[]> {
        const all: RawLeadItem[] = [];

        for (let i = 0; i < RSS_FEEDS.length; i++) {
            // 1-second gap between RSS fetches — avoids concurrent hammering of the same host
            if (i > 0) await new Promise(r => setTimeout(r, 1000));
            const url = RSS_FEEDS[i]!;
            try {
                const feed = await this.parser.parseURL(url);
                for (const item of feed.items ?? []) {
                    all.push({
                        rawId: item.guid ?? item.link ?? String(Date.now()),
                        raw: item as unknown as Record<string, unknown>,
                        fetchedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
                    });
                }
            } catch (err) {
                console.warn(`[weworkremotely] failed to fetch ${url}:`, (err as Error).message);
            }
        }

        // Deduplicate by rawId
        const seen = new Set<string>();
        return all.filter(r => !seen.has(r.rawId) && seen.add(r.rawId) as unknown as boolean);
    }

    normalize(item: RawLeadItem): Partial<Lead> {
        const raw = item.raw as Record<string, string | undefined>;
        return {
            source: this.id,
            source_id: item.rawId,
            title: raw['title'] ?? '',
            description: raw['content'] ?? raw['contentSnippet'] ?? '',
            url: raw['link'] ?? '',
            status: 'new',
            remote: true,
        };
    }

    async healthCheck() {
        try {
            const resp = await fetch(RSS_FEEDS[0]!, {
                headers: { 'User-Agent': 'LeadFlowBot/1.0' },
            });
            return resp.ok ? 'healthy' : 'degraded';
        } catch {
            return 'down';
        }
    }
}
