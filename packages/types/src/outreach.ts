export type OutreachChannel = 'email' | 'linkedin' | 'twitter' | 'clipboard';
export type OutreachStatus = 'draft' | 'approved' | 'sent' | 'scheduled' | 'failed';

export interface OutreachDraft {
    email: EmailDraft;
    linkedin: LinkedInDraft;
    twitter: TwitterDraft;
    clipboard: ClipboardDraft;
    generated_at: string;
    outreach_angle: string;
}

export interface EmailDraft {
    subject: string;
    body: string;
    word_count: number;
}

export interface LinkedInDraft {
    connection_note: string;   // < 300 chars
    inmail_subject: string;
    inmail_body: string;        // < 1900 chars
}

export interface TwitterDraft {
    dm: string; // < 280 chars
}

export interface ClipboardDraft {
    pitch: string; // 5-8 lines, outcome-first
}

export interface OutreachContext {
    lead_title: string;
    lead_description: string;
    skills_required: string[];
    budget_display: string | null;
    client_name: string | null;
    ai_score: number;
    outreach_angle: string;
    portfolio_matches: Array<{
        title: string;
        url: string | null;
        key_outcome: string | null;
    }>;
    boomerang_context: {
        contacted_at: string;
        outcome: string;
        ai_summary: string;
    } | null;
    trigger_event: {
        type: string;
        summary: string;
    } | null;
    user_first_name: string;
    user_skills: string[];
    user_hourly_rate: number | null;
}

export interface ApprovalQueueItem {
    id: string;
    user_id: string;
    lead_id: string;
    lead_title: string;
    lead_source: string;
    ai_score: number;
    ai_summary: string;
    drafts: OutreachDraft;
    status: 'pending' | 'approved' | 'skipped' | 'expired';
    expires_at: string;
    created_at: string;
}

export interface SendRequest {
    lead_id: string;
    channel: OutreachChannel;
    draft_content: string;
    schedule: 'now' | 'optimal' | string; // ISO 8601 for explicit time
    approval_queue_item_id?: string;
}
