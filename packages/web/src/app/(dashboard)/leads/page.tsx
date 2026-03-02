"use client";

import { LeadCard } from "@/components/leads/lead-card";
import { LeadFiltersBar } from "@/components/leads/lead-filters-bar";
import { LeadDetailPanel } from "@/components/leads/LeadDetailPanel";
import { Button } from "@/components/ui/button";
import type { LeadFeedParams } from "@/lib/api";
import { useLeadFeed } from "@/lib/queries";
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useInView } from "react-intersection-observer";

export default function LeadsPage() {
  const [filters, setFilters] = useState<LeadFeedParams>({});
  const [activeLead, setActiveLead] = useState<string | null>(null);
  const { ref: loaderRef, inView } = useInView();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useLeadFeed(filters);

  // Auto-fetch next page when loader comes into view
  if (inView && hasNextPage && !isFetchingNextPage) {
    fetchNextPage();
  }

  const leads = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Lead Feed</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading…" : `${leads.length} leads`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
        <LeadFiltersBar filters={filters} onChange={setFilters} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">Failed to load leads.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => refetch()}
            >
              Try again
            </Button>
          </div>
        )}

        {!isLoading && leads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-lg font-medium text-muted-foreground">
              No leads yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Install the browser extension or paste a lead URL to get started.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onOpen={() => setActiveLead(lead.id)}
            />
          ))}
        </div>

        {/* Infinite scroll trigger */}
        <div ref={loaderRef} className="py-4 flex justify-center">
          {isFetchingNextPage && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
          {!hasNextPage && leads.length > 0 && (
            <p className="text-xs text-muted-foreground">All leads loaded</p>
          )}
        </div>
      </div>

      <LeadDetailPanel
        leadId={activeLead}
        onClose={() => setActiveLead(null)}
      />
    </div>
  );
}
