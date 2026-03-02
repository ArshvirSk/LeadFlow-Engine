import type { Lead, RawLeadItem, SourceAdapter } from '@leadflow/types';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RssParser = require('rss-parser') as typeof import('rss-parser');

// Contract / freelance jobs feed — not the full 'remote-jobs' (mostly full-time) feed
const RSS_URL = 'https://weworkremotely.com/categories/remote-contract-jobs.rss';

export class WeWorkRemotelyAdapter implements SourceAdapter {
    id = 'weworkremotely';
    schedule = '*/30 * * * *';
    private parser = new RssParser();

    async poll(): Promise<RawLeadItem[]> {
        try {
            const feed = await this.parser.parseURL(RSS_URL);
            return (feed.items ?? []).map(item => ({
                rawId: item.guid ?? item.link ?? String(Date.now()),
                raw: item as unknown as Record<string, unknown>,
                fetchedAt: new Date(),
            }));
        } catch {
            return [];
        }
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
            const resp = await fetch(RSS_URL, { method: 'HEAD' });
            return resp.ok ? 'healthy' : 'degraded';
        } catch {
            return 'down';
        }
    }
}
