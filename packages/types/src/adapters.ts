import type { Lead } from './lead.js';

// ─── Raw item emitted by every source adapter ─────────────────────────────────
export interface RawLeadItem {
  rawId: string;                     // source-specific stable ID used for dedup cursor
  raw: Record<string, unknown>;      // full raw payload preserved for debugging
  fetchedAt: Date;
}

export type SourceHealthStatus = 'healthy' | 'degraded' | 'down';

// ─── Contract every ingestion adapter must implement ─────────────────────────
export interface SourceAdapter {
  /** Unique adapter identifier, e.g. 'remoteok', 'reddit_forhire' */
  id: string;
  /** Cron expression for polling schedule, e.g. every 30 min: 0,30 * * * * */
  schedule: string;
  /** Fetch new raw items from the source since the last cursor */
  poll(): Promise<RawLeadItem[]>;
  /** Map a single raw item to a partial Lead (title, description, url, etc.) */
  normalize(rawItem: RawLeadItem): Partial<Lead>;
  /** Verify the source is reachable */
  healthCheck(): Promise<SourceHealthStatus>;
}
