// ─── Status & Enumerations ────────────────────────────────────────────────────
export type LeadStatus = 'new' | 'viewed' | 'contacted' | 'won' | 'lost' | 'dismissed';
export type BudgetType = 'fixed' | 'hourly' | 'monthly' | 'unknown';
export type CompetitionLevel = 'low' | 'medium' | 'high';
export type CompanyHealthStatus = 'green' | 'yellow' | 'red';
export type ExperienceLevel = 'junior' | 'mid' | 'senior' | 'any';

// ─── Embedded Objects ─────────────────────────────────────────────────────────
export interface CompanyHealth {
    status: CompanyHealthStatus;
    signals: string[];
    checked_at: string;
}

export interface TriggerEvent {
    type: 'FUNDING_ROUND' | 'PRODUCTHUNT_LAUNCH' | 'GITHUB_MILESTONE' | 'BLOG_HIRING_SIGNAL';
    event_date: string;
    event_data: Record<string, unknown>;
    watchlist_id: string;
}

export interface CommunitySource {
    platform: 'slack' | 'discord' | 'telegram' | 'browser_extension';
    server_name?: string;
    channel_name?: string;
}

export interface BoomerangContext {
    contacted_at: string;
    outcome: 'won' | 'lost' | 'no_reply';
    ai_summary: string;
    similarity: number;
}

export interface ScoreBreakdown {
    skill_match: number;   // 0-30
    budget: number;        // 0-20
    client_quality: number; // 0-15
    recency: number;       // 0-15
    competition: number;   // 0-10
    contact: number;       // 0-10
}

export interface DimensionResult {
    score: number; // 1-5
    analysis: string;
    recommendation: string;
}

export interface WinLossDebrief {
    outcome: 'won' | 'lost';
    dimensions: {
        rate_alignment: DimensionResult;
        message_relevance: DimensionResult;
        response_speed: DimensionResult;
        message_length: DimensionResult;
        portfolio_match: DimensionResult;
        tone: DimensionResult;
        subject_line: DimensionResult;
    };
    top_strength: string;
    top_improvement: string;
    pattern_indicators: string[];
}

export interface PortfolioMatch {
    portfolio_piece_id: string;
    title: string;
    url: string | null;
    similarity: number;
    key_outcome: string | null;
}

// ─── Core Types ───────────────────────────────────────────────────────────────
export interface Lead {
    id: string;
    source: string;
    source_id: string | null;
    title: string;
    description: string;
    url: string;
    client_name: string | null;
    client_url: string | null;
    budget: number | null;
    budget_type: BudgetType | null;
    budget_min: number | null;
    budget_max: number | null;
    skills_required: string[];
    location: string | null;
    remote: boolean;
    experience_level: ExperienceLevel | null;
    category: string | null;
    poster_id: string | null;
    poster_name: string | null;
    poster_history_score: number | null;
    applicant_count: number | null;
    contact_email: string | null;
    contact_linkedin: string | null;
    status: LeadStatus;
    golden_hour: boolean;
    boomerang: boolean;
    boomerang_ref: string | null;
    boomerang_context: BoomerangContext | null;
    company_health: CompanyHealth | null;
    portfolio_matches: PortfolioMatch[] | null;
    recipient_timezone: string | null;
    trigger_event: TriggerEvent | null;
    community_source: CommunitySource | null;
    competition_level: CompetitionLevel | null;
    ingested_at: string;
    created_at: string;
    updated_at: string;
}

export interface LeadScore {
    id: string;
    lead_id: string;
    user_id: string;
    ai_score: number;
    ai_summary: string;
    score_breakdown: ScoreBreakdown;
    skill_gaps: string[];
    alliance_eligible: boolean;
    debrief: WinLossDebrief | null;
    debrief_generated_at: string | null;
    golden_hour_notified_at: string | null;
    golden_hour_responded_at: string | null;
    scheduled_job_id: string | null;
    is_autopilot: boolean;
    actioned_from_briefing: boolean;
    created_at: string;
    updated_at: string;
}

export interface LeadWithScore extends Lead {
    score: LeadScore | null;
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export interface CursorPage<T> {
    items: T[];
    next_cursor: string | null;
    total: number;
}

// ─── Filters ─────────────────────────────────────────────────────────────────
export interface LeadFilters {
    status?: LeadStatus[];
    source?: string[];
    min_score?: number;
    max_score?: number;
    skills?: string[];
    remote?: boolean;
    budget_type?: BudgetType;
    min_budget?: number;
    max_budget?: number;
    golden_hour?: boolean;
    boomerang?: boolean;
    alliance_eligible?: boolean;
    hide_red_companies?: boolean;
    category?: string[];
    max_age_days?: number;
    cursor?: string;
    limit?: number;
}
