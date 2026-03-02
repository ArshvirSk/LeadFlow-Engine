export type Availability = 'full_time' | 'part_time' | 'not_available';
export type BriefingChannel = 'email' | 'slack' | 'both';

export interface NotificationSettings {
    golden_hour_push: boolean;
    golden_hour_email: boolean;
    golden_hour_sms: boolean;
    min_score_threshold: number;
    quiet_hours_start: string | null; // HH:MM in user timezone
    quiet_hours_end: string | null;   // HH:MM in user timezone
}

export interface AutopilotRules {
    min_score: number;
    required_skills: string[];
    preferred_sources: string[];
    min_budget: number | null;
    max_budget: number | null;
    category_filter: string[];
    exclude_red_companies: boolean;
    require_contact_info: boolean;
}

export interface AutopilotPauseConfig {
    vacation_start: string | null;
    vacation_end: string | null;
    paused_categories: string[];
    paused_sources: string[];
}

export interface UserProfile {
    id: string;
    clerk_user_id: string;
    email: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    core_skills: string[];
    preferred_skills: string[];
    experience_years: number;
    hourly_rate: number | null;
    availability: Availability;
    timezone: string;
    portfolio_url: string | null;
    linkedin_url: string | null;
    github_url: string | null;
    preferred_project_types: string[];
    preferred_sources: string[];
    min_budget: number | null;
    max_budget: number | null;
    notification_settings: NotificationSettings;
    autopilot_enabled: boolean;
    autopilot_rules: AutopilotRules | null;
    autopilot_pause_config: AutopilotPauseConfig | null;
    auto_send_enabled: boolean;
    briefing_delivery_time: string; // HH:MM
    briefing_snooze_until: string | null;
    briefing_channel: BriefingChannel;
    briefing_email_bounced: boolean;
    community_tokens: Record<string, string> | null; // AES-256-GCM encrypted
    slack_monitored_channels: string[];
    alliance_opt_in: boolean;
    filter_hide_red_companies: boolean;
    phone_number: string | null;
    phone_verified: boolean;
    golden_hour_sms: boolean;
    profile_completeness: number; // 0-100
    onboarding_completed: boolean;
    created_at: string;
    updated_at: string;
}

export interface PortfolioPiece {
    id: string;
    user_id: string;
    title: string;
    description: string;
    url: string | null;
    skills_demonstrated: string[];
    outcomes: string | null;
    embedding_status: 'pending' | 'ready' | 'failed';
    matched_count: number;
    created_at: string;
    updated_at: string;
}

export interface AllianceMember {
    id: string;
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    skills: string[];
    hourly_rate_min: number | null;
    hourly_rate_max: number | null;
    availability: Availability;
    bio: string | null;
    rating: number; // weighted avg 0-5
    alliance_count: number;
    verified_badge: boolean;
    created_at: string;
}
