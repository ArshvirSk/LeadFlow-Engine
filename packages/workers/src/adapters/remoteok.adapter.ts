import type { Lead, RawLeadItem, SourceAdapter } from '@leadflow/types';

/**
 * RemoteOK adapter — uses the public JSON API (the old /remote-freelance-jobs.xml
 * feed was removed; HEAD /remote-jobs.xml returns HTML, not XML).
 *
 * API docs: https://remoteok.com/api
 * First element in the response array is a legal/metadata object (no `id`) — skip it.
 */
const API_URL = 'https://remoteok.com/api';

interface RemoteOKJob {
    id: string;
    position: string;
    description: string;
    url: string;
    tags?: string[];
    company?: string;
    epoch?: number;
    location?: string;
}

export class RemoteOKAdapter implements SourceAdapter {
    id = 'remoteok';
    schedule = '*/30 * * * *';

    async poll(): Promise<RawLeadItem[]> {
        try {
            const resp = await fetch(API_URL, {
                headers: { 'User-Agent': 'LeadFlowBot/1.0 (lead aggregator)' },
            });
            if (!resp.ok) return [];

            // Response is an array; first element is a legal notice object (no `id`)
            const data = await resp.json() as Array<Record<string, unknown>>;
            const jobs = data.filter(
                (item): item is RemoteOKJob =>
                    typeof item === 'object' &&
                    item !== null &&
                    typeof item['id'] === 'string' &&
                    Boolean(item['id'])
            ) as RemoteOKJob[];

            return jobs.map(job => ({
                rawId: String(job.id),
                raw: job as unknown as Record<string, unknown>,
                fetchedAt: job.epoch ? new Date(job.epoch * 1000) : new Date(),
            }));
        } catch {
            return [];
        }
    }

    normalize(item: RawLeadItem): Partial<Lead> {
        const raw = item.raw as unknown as RemoteOKJob;
        return {
            source: this.id,
            source_id: item.rawId,
            title: raw.position ?? '',
            description: raw.description ?? '',
            url: raw.url ?? `https://remoteok.com/l/${item.rawId}`,
            client_name: raw.company ?? null,
            status: 'new',
            remote: true,
        };
    }

    async healthCheck() {
        try {
            const resp = await fetch(API_URL, {
                headers: { 'User-Agent': 'LeadFlowBot/1.0' },
            });
            return resp.ok ? 'healthy' : 'degraded';
        } catch {
            return 'down';
        }
    }
}
