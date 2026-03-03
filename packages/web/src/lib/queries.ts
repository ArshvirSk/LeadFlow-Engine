'use client';

import { useAuth } from '@clerk/nextjs';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeadFeedParams } from './api';
import { analyticsApi, briefingsApi, leadsApi, metaApi, outreachApi, profileApi, watchlistApi } from './api';

// ── Auth helper ───────────────────────────────────────────────────────────────
export function useToken() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    return {
        /** Returns the JWT, or throws if Clerk hasn't produced one yet (React Query retries). */
        getToken: async () => {
            const t = await getToken();
            if (!t) throw new Error('No Clerk token — session not yet ready');
            return t;
        },
        ready: isLoaded && !!isSignedIn,
    };
}

// ── Leads ─────────────────────────────────────────────────────────────────────
export function useLeadFeed(filters: LeadFeedParams = {}) {
    const { getToken, ready } = useToken();
    return useInfiniteQuery({
        queryKey: ['leads', filters],
        queryFn: async ({ pageParam }) => {
            const token = await getToken();
            return leadsApi.list({ ...filters, cursor: pageParam as string | undefined }, token);
        },
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        enabled: ready,
    });
}

export function useLead(id: string) {
    const { getToken, ready } = useToken();
    return useQuery({
        queryKey: ['lead', id],
        queryFn: async () => {
            const token = await getToken();
            return leadsApi.get(id, token);
        },
        enabled: ready && !!id,
    });
}

export function useUpdateLeadStatus() {
    const { getToken } = useToken();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, status }: { id: string; status: string }) => {
            const token = await getToken();
            return leadsApi.updateStatus(id, status, token);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['leads'] });
        },
    });
}

// ── Outreach ──────────────────────────────────────────────────────────────────
export function useOutreachQueue() {
    const { getToken, ready } = useToken();
    return useQuery({
        queryKey: ['outreach', 'queue'],
        queryFn: async () => {
            const token = await getToken();
            return outreachApi.getQueue(token);
        },
        enabled: ready,
    });
}

export function useRequestDraft() {
    const { getToken } = useToken();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ lead_id, channels, portfolio_piece_id }: { lead_id: string; channels: string[]; portfolio_piece_id?: string }) => {
            const token = await getToken();
            return outreachApi.requestDraft(lead_id, channels, token, portfolio_piece_id);
        },
        onSuccess: (_data, vars) => {
            // Immediately start polling for the draft
            qc.invalidateQueries({ queryKey: ['lead-draft', vars.lead_id] });
            qc.invalidateQueries({ queryKey: ['outreach', 'queue'] });
        },
    });
}

export function useLeadDraft(leadId: string) {
    const { getToken, ready } = useToken();
    return useQuery({
        queryKey: ['lead-draft', leadId],
        queryFn: async () => {
            const token = await getToken();
            return leadsApi.getDraft(leadId, token);
        },
        enabled: ready && !!leadId,
        refetchInterval: (query) => {
            const status = (query.state.data as any)?.status;
            // Poll every 3s while generating or not yet fetched
            if (!status || status === 'generating') return 3000;
            return false;
        },
    });
}

export function useApproveOutreach() {
    const { getToken } = useToken();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => {
            const token = await getToken();
            return outreachApi.approve(data, token);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['outreach', 'queue'] });
        },
    });
}

// ── FR-04: Optimal send window ────────────────────────────────────────────────────────────────────────
export function useOptimalSendWindow(leadId: string | null) {
    const { getToken, ready } = useToken();
    return useQuery({
        queryKey: ['lead-send-window', leadId],
        queryFn: async () => {
            const token = await getToken();
            return leadsApi.getOptimalSendWindow(leadId!, token);
        },
        enabled: ready && !!leadId,
        staleTime: 15 * 60 * 1000, // 15 minutes
        retry: false,
    });
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export function useAnalyticsSummary() {
    const { getToken, ready } = useToken();
    return useQuery({
        queryKey: ['analytics', 'summary'],
        queryFn: async () => {
            const token = await getToken();
            return analyticsApi.summary(token);
        },
        enabled: ready,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

// ── Profile ───────────────────────────────────────────────────────────────────
export function useProfile() {
    const { getToken, ready } = useToken();
    return useQuery({
        queryKey: ['profile'],
        queryFn: async () => {
            const token = await getToken();
            return profileApi.get(token);
        },
        enabled: ready,
    });
}

export function useUpdateProfile() {
    const { getToken } = useToken();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => {
            const token = await getToken();
            return profileApi.update(data, token);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['profile'] });
            qc.invalidateQueries({ queryKey: ['leads'] });
        },
    });
}

// ── Briefings ─────────────────────────────────────────────────────────────────
export function useBriefings() {
    const { getToken, ready } = useToken();
    return useQuery({
        queryKey: ['briefings'],
        queryFn: async () => {
            const token = await getToken();
            return briefingsApi.list(token);
        },
        enabled: ready,
    });
}

// ── Watchlist ─────────────────────────────────────────────────────────────────
export function useWatchlist() {
    const { getToken, ready } = useToken();
    return useQuery({
        queryKey: ['watchlist'],
        queryFn: async () => {
            const token = await getToken();
            return watchlistApi.list(token);
        },
        enabled: ready,
    });
}

// ── NL Search — FR-11 ────────────────────────────────────────────────────────
export function useNLSearch() {
    const { getToken } = useToken();
    return useMutation({
        mutationFn: async (query: string) => {
            const token = await getToken();
            return leadsApi.nlSearch(query, token);
        },
    });
}

// ── Portfolio ─────────────────────────────────────────────────────────────────
export function usePortfolio() {
    const { getToken, ready } = useToken();
    return useQuery({
        queryKey: ['portfolio'],
        queryFn: async () => {
            const token = await getToken();
            return profileApi.getPortfolio(token);
        },
        enabled: ready,
    });
}

export function useAddPortfolioPiece() {
    const { getToken } = useToken();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (data: { title: string; description: string; url?: string; outcomes?: string }) => {
            const token = await getToken();
            return profileApi.addPortfolioPiece(data, token);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portfolio'] });
        },
    });
}

export function useDeletePortfolioPiece() {
    const { getToken } = useToken();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const token = await getToken();
            return profileApi.deletePortfolioPiece(id, token);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portfolio'] });
        },
    });
}

// ── Pattern report — FR-08 ────────────────────────────────────────────────────
export function usePatternReport() {
    const { getToken, ready } = useToken();
    return useQuery({
        queryKey: ['analytics', 'pattern-report'],
        queryFn: async () => {
            const token = await getToken();
            return (await import('./api')).analyticsApi.patternReport(token);
        },
        enabled: ready,
        retry: false, // 404 means no report yet — don't retry
    });
}


/**
 * Returns the canonical skills list from GET /api/v1/meta/skills.
 * Public endpoint — no auth token required.
 * Cached for 24 h (matches API Cache-Control header).
 */
export function useSkills() {
    return useQuery({
        queryKey: ['meta', 'skills'],
        queryFn: () => metaApi.skills().then((d) => d.skills),
        staleTime: 24 * 60 * 60 * 1000, // 24 h — matches API Cache-Control
        gcTime: 24 * 60 * 60 * 1000,
    });
}
