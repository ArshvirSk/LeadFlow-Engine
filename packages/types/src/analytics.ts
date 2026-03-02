export interface LeadVolumeStats {
    total: number;
    by_source: Record<string, number>;
    by_day: Array<{ date: string; count: number }>;
    avg_score_by_source: Record<string, number>;
}

export interface SourcePerformance {
    source: string;
    lead_count: number;
    avg_score: number;
    contacted_count: number;
    won_count: number;
    win_rate: number; // 0-100
    avg_response_hours: number | null;
}

export interface OutreachActivity {
    drafted: number;
    sent: number;
    acceptance_rate: number; // drafted -> sent %
    by_channel: Record<string, { sent: number; reply_rate: number }>;
}

export interface GoldenHourStats {
    total_surfaced: number;
    contacted_within_window: number;
    hit_rate: number; // 0-100
    missed_quiet_hours: number;
    best_source: string | null;
    period_delta: number; // % change from prior period
}

export interface WinLossStats {
    total_won: number;
    total_lost: number;
    total_no_reply: number;
    win_rate: number; // 0-100
    by_source: Array<{ source: string; won: number; lost: number; win_rate: number }>;
    by_score_band: Array<{ band: string; won: number; lost: number; win_rate: number }>;
    avg_dimension_scores_won: Record<string, number>;
    avg_dimension_scores_lost: Record<string, number>;
}

export interface BoomerangStats {
    total_detected: number;
    contacted: number;
    won: number;
    win_rate: number;
    cold_win_rate: number;
}

export interface AutopilotStats {
    leads_evaluated: number;
    leads_approved: number;
    leads_sent: number;
    win_rate: number;
    manual_win_rate: number;
    estimated_hours_saved: number;
}

export interface BriefingStats {
    total_sent: number;
    delivery_rate: number;
    open_rate: number;
    action_rate: number;
    approved_from_briefing: number;
    won_from_briefing: number;
}

export interface AnalyticsSummary {
    period: string;
    lead_volume: LeadVolumeStats;
    source_performance: SourcePerformance[];
    outreach_activity: OutreachActivity;
    golden_hour: GoldenHourStats;
    win_loss: WinLossStats;
    boomerang: BoomerangStats;
    autopilot: AutopilotStats;
    briefing: BriefingStats;
}
