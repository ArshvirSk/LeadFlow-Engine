"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { watchlistApi } from "@/lib/api";
import { useWatchlist } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function WatchlistPage() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { data: items, isLoading } = useWatchlist();
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [eventsMap, setEventsMap] = useState<Record<string, any[]>>({});
  const [loadingEvents, setLoadingEvents] = useState<Record<string, boolean>>(
    {},
  );
  const [form, setForm] = useState({
    company_name: "",
    company_url: "",
    notes: "",
  });

  const EVENT_META: Record<
    string,
    { icon: string; label: string; colorClass: string }
  > = {
    FUNDING_ROUND: {
      icon: "💰",
      label: "Funding Round",
      colorClass: "text-green-700 dark:text-green-400",
    },
    PRODUCTHUNT_LAUNCH: {
      icon: "🚀",
      label: "PH Launch",
      colorClass: "text-yellow-700 dark:text-yellow-400",
    },
    GITHUB_MILESTONE: {
      icon: "⭐",
      label: "GitHub Activity",
      colorClass: "text-sky-700 dark:text-sky-400",
    },
    BLOG_HIRING_SIGNAL: {
      icon: "📝",
      label: "Hiring Signal",
      colorClass: "text-purple-700 dark:text-purple-400",
    },
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (eventsMap[id]) return; // already loaded
    setLoadingEvents((prev) => ({ ...prev, [id]: true }));
    try {
      const token = await getToken();
      const events = await watchlistApi.events(id, token ?? "");
      setEventsMap((prev) => ({ ...prev, [id]: events }));
    } catch {
      setEventsMap((prev) => ({ ...prev, [id]: [] }));
    } finally {
      setLoadingEvents((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleAdd = async () => {
    const token = await getToken();
    await watchlistApi.add(form, token ?? "");
    qc.invalidateQueries({ queryKey: ["watchlist"] });
    setForm({ company_name: "", company_url: "", notes: "" });
    setAdding(false);
    toast.success("Company added to watchlist");
  };

  const handleRemove = async (id: string) => {
    const token = await getToken();
    await watchlistApi.remove(id, token ?? "");
    qc.invalidateQueries({ queryKey: ["watchlist"] });
    toast.success("Removed from watchlist");
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Watchlist</h1>
          <p className="text-sm text-muted-foreground">
            Monitor companies for trigger events
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add company
        </Button>
      </div>

      {adding && (
        <Card className="mb-4">
          <CardContent className="pt-4 space-y-3">
            <input
              placeholder="Company name *"
              value={form.company_name}
              onChange={(e) =>
                setForm({ ...form, company_name: e.target.value })
              }
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              placeholder="Company URL"
              value={form.company_url}
              onChange={(e) =>
                setForm({ ...form, company_url: e.target.value })
              }
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <textarea
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={!form.company_name}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAdding(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!items || items.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <Eye className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground">No companies watched</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add companies to get notified when they raise funding, post jobs, or
            change leadership.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {items?.map((item: any) => (
          <div
            key={item.id}
            className="rounded-lg border bg-card overflow-hidden"
          >
            {/* Company row */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{item.company_name}</p>
                {item.company_url && (
                  <a
                    href={item.company_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    {item.company_url}
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                {item.latest_funding_round_at && (
                  <Badge variant="golden" className="text-[10px]">
                    Recent funding
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {timeAgo(item.created_at)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  title="View event history"
                  onClick={() => toggleExpand(item.id)}
                >
                  {expandedId === item.id ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remove from watchlist"
                  onClick={() => handleRemove(item.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* FR-06: Event history panel */}
            {expandedId === item.id && (
              <div className="border-t bg-muted/30 px-4 py-3">
                {loadingEvents[item.id] ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading events…
                  </div>
                ) : !eventsMap[item.id]?.length ? (
                  <p className="py-2 text-xs text-muted-foreground">
                    No trigger events detected yet. The monitor runs daily.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {eventsMap[item.id].map((ev: any, idx: number) => {
                      const meta = EVENT_META[ev.event_type] ?? {
                        icon: "📌",
                        label: ev.event_type,
                        colorClass: "text-foreground",
                      };
                      return (
                        <li
                          key={idx}
                          className="flex items-start gap-2.5 text-sm"
                        >
                          <span className="mt-0.5 shrink-0 text-base leading-none">
                            {meta.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-xs font-semibold ${meta.colorClass}`}
                              >
                                {meta.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                · {timeAgo(ev.detected_at)}
                              </span>
                            </div>
                            {ev.event_data?.summary && (
                              <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                                {ev.event_data.summary}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
