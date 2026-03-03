const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

async function apiFetch<T>(
    path: string,
    init?: RequestInit & { token?: string }
): Promise<T> {
    const { token, ...rest } = init ?? {};
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((rest.headers as Record<string, string>) ?? {}),
    };

    const res = await fetch(`${API_URL}/api/v1${path}`, { ...rest, headers });

    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        // Persistent 401 means the session is invalid — redirect to sign-in
        if (res.status === 401 && typeof window !== 'undefined') {
            window.location.href = '/sign-in';
        }
        throw new ApiError(res.status, body.error ?? res.statusText);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
}

// ── Leads ─────────────────────────────────────────────────────────────────────
export type LeadFeedParams = {
    cursor?: string;
    limit?: number;
    status?: string;
    minScore?: number;
    remote?: boolean;
    goldenHour?: boolean;
    source?: string;
};

function buildParams(params: Record<string, unknown>): URLSearchParams {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
    }
    return sp;
}

export const leadsApi = {
    list: (params: LeadFeedParams, token: string) =>
        apiFetch<{ data: any[]; nextCursor: string | null; hasMore: boolean }>(
            `/leads?${buildParams(params as Record<string, unknown>)}`, { token }
        ),
    get: (id: string, token: string) => apiFetch<any>(`/leads/${id}`, { token }),
    updateStatus: (id: string, status: string, token: string) =>
        apiFetch<{ ok: boolean }>(`/leads/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
            token,
        }),
    getDraft: (id: string, token: string) =>
        apiFetch<{ status: 'none' | 'generating' | 'ready' | 'failed'; drafts?: any; item_id?: string; error?: string }>(
            `/leads/${id}/outreach`, { token }
        ),
    ingest: (url: string, token: string) =>
        apiFetch<{ jobId: string }>(`/leads/ingest`, { method: 'POST', body: JSON.stringify({ url }), token }),
    nlSearch: (query: string, token: string) =>
        apiFetch<{
            filters_applied: Record<string, unknown>;
            leads: any[];
            total_count: number;
            natural_language_summary: string;
            error?: string;
            examples?: string[];
        }>('/leads/search', { method: 'POST', body: JSON.stringify({ query }), token }),
    getOptimalSendWindow: (leadId: string, token: string) =>
        apiFetch<any>(`/leads/${leadId}/optimal-send-window`, { token }),
};

// ── Profile ─────────────────────────────────────────────────────────────────────────────────
export const profileApi = {
    get: (token: string) => apiFetch<any>('/profile', { token }),
    update: (data: any, token: string) =>
        apiFetch<any>('/profile', { method: 'PUT', body: JSON.stringify(data), token }),
    getPortfolio: (token: string) => apiFetch<any[]>('/profile/portfolio', { token }),
    addPortfolioPiece: (data: any, token: string) =>
        apiFetch<any>('/profile/portfolio', { method: 'POST', body: JSON.stringify(data), token }),
    updatePortfolioPiece: (id: string, data: any, token: string) =>
        apiFetch<any>(`/profile/portfolio/${id}`, { method: 'PUT', body: JSON.stringify(data), token }),
    deletePortfolioPiece: (id: string, token: string) =>
        apiFetch<void>(`/profile/portfolio/${id}`, { method: 'DELETE', token }),
    uploadPortfolioPdf: (pdf_base64: string, token: string) =>
        apiFetch<{ text: string }>('/profile/portfolio/upload', { method: 'POST', body: JSON.stringify({ pdf_base64 }), token }),
};

// ── Outreach ──────────────────────────────────────────────────────────────────
export const outreachApi = {
    requestDraft: (lead_id: string, channels: string[], token: string, portfolio_piece_id?: string) =>
        apiFetch<{ jobId: string }>('/outreach/drafts', {
            method: 'POST',
            body: JSON.stringify({ lead_id, channels, ...(portfolio_piece_id ? { portfolio_piece_id } : {}) }),
            token,
        }),
    getQueue: (token: string) => apiFetch<any[]>('/outreach/queue', { token }),
    approve: (data: any, token: string) =>
        apiFetch<any>('/outreach/approve', { method: 'POST', body: JSON.stringify(data), token }),
    skip: (item_id: string, token: string) =>
        apiFetch<{ ok: boolean }>('/outreach/skip', { method: 'POST', body: JSON.stringify({ item_id }), token }),
    history: (token: string) => apiFetch<any[]>('/outreach/history', { token }),
};

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analyticsApi = {
    summary: (token: string) => apiFetch<any>('/analytics/summary', { token }),
    goldenHours: (token: string) => apiFetch<any[]>('/analytics/golden-hours', { token }),
    patternReport: (token: string) => apiFetch<any>('/analytics/pattern-report/latest', { token }),
};

// ── Briefings ─────────────────────────────────────────────────────────────────
export const briefingsApi = {
    list: (token: string) => apiFetch<any[]>('/briefings', { token }),
    generate: (token: string) =>
        apiFetch<{ jobId: string }>('/briefings/generate', { method: 'POST', body: '{}', token }),
    markOpened: (id: string, token: string) =>
        apiFetch<{ ok: boolean }>(`/briefings/${id}/opened`, { method: 'POST', token }),
};

// ── Meta / reference data (public — no auth token required) ─────────────────
export const metaApi = {
    /** Returns the canonical 500+ skills list. Endpoint is public, no token needed. */
    skills: () => apiFetch<{ skills: string[] }>('/meta/skills'),
};

// ── Watchlist ─────────────────────────────────────────────────────────────────
export const watchlistApi = {
    list: (token: string) => apiFetch<any[]>('/watchlist', { token }),
    add: (data: any, token: string) =>
        apiFetch<any>('/watchlist', { method: 'POST', body: JSON.stringify(data), token }),
    remove: (id: string, token: string) =>
        apiFetch<void>(`/watchlist/${id}`, { method: 'DELETE', token }),
    events: (id: string, token: string) => apiFetch<any[]>(`/watchlist/${id}/events`, { token }),
};
