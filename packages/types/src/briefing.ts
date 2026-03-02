import type { LeadWithScore } from './lead.js';

export interface BriefingTopLead {
  lead: LeadWithScore;
  action_token_approve: string;
  action_token_skip: string;
}

export interface BriefingData {
  user_id: string;
  user_first_name: string;
  date: string;
  top_leads: BriefingTopLead[];
  outreach_queue_count: number;
  golden_hour_yesterday: {
    surfaced: number;
    hit_rate: number;
  };
  recent_wins: Array<{ lead_id: string; title: string; won_at: string }>;
  recent_losses: Array<{ lead_id: string; title: string; lost_at: string }>;
  alliance_eligible_leads: Array<{ lead_id: string; title: string; skill_gaps: string[] }>;
  weekly_insight: {
    this_week_win_rate: number;
    last_week_win_rate: number;
    delta: number;
    message: string;
  } | null;
}

export interface BriefingLog {
  id: string;
  user_id: string;
  generated_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  suppressed: boolean;
  suppressed_at: string | null;
  actions_taken: number;
  channel: 'email' | 'slack';
}
