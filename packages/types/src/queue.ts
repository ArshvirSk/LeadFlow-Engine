// BullMQ queue names
export const QUEUE_NAMES = {
    RAW_LEADS: 'raw.leads',
    NORMALIZED_LEADS: 'normalized.leads',
    SCORED_LEADS: 'scored.leads',
    OUTREACH_DRAFTS: 'outreach.drafts',
    SCHEDULED_SENDS: 'scheduled.sends',
    DEBRIEF_GENERATION: 'debrief.generation',
    BRIEFING_GENERATION: 'briefing.generation',
    PORTFOLIO_EMBEDDINGS: 'portfolio.embeddings',
    LEAD_EMBEDDINGS: 'lead.embeddings',
    TRIGGER_EVENTS: 'trigger.events',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

// ─── Job Payloads ─────────────────────────────────────────────────────────────
export interface RawLeadJob {
    source: string;
    source_id: string | null;
    title: string;
    description: string;
    url: string;
    client_name?: string;
    client_url?: string;
    raw_data: Record<string, unknown>;
    ingested_at: string;
}

export interface NormalizationJob {
    lead_id: string;
}

export interface ScoringJob {
    lead_id: string;
    user_id: string;
}

export interface OutreachDraftJob {
    lead_id: string;
    user_id: string;
    approval_queue_item_id?: string;
    portfolio_piece_id?: string; // FR-03: override the auto-matched portfolio piece
}

export interface ScheduledSendJob {
    user_id: string;
    lead_id: string;
    channel: string;
    draft_content: string;
    approval_queue_item_id?: string;
    scheduled_at: string;
}

export interface DebriefGenerationJob {
    user_id: string;
    lead_id: string;
    outcome: 'won' | 'lost';
}

export interface BriefingGenerationJob {
    user_id: string;
    scheduled_for: string; // ISO 8601
}

export interface PortfolioEmbeddingJob {
    portfolio_piece_id: string;
    user_id: string;
    operation: 'create' | 'update';
}

export interface LeadEmbeddingJob {
    lead_id: string;
}

export interface TriggerEventJob {
    watchlist_id: string;
    user_id: string;
    company_name: string;
    company_url: string | null;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────
export type WsEventName =
    | 'lead:new'
    | 'lead:updated'
    | 'lead:scored'
    | 'lead:debrief_ready'
    | 'approval_queue:new_item'
    | 'auto_send:scheduled'
    | 'pattern_report:ready'
    | 'alliance:invite';

export interface WsEvent<T = unknown> {
    event: WsEventName;
    data: T;
    user_id: string;
    timestamp: string;
}
