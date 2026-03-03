"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { watchlistApi } from "@/lib/api";
import {
  useLead,
  useLeadDraft,
  useRequestDraft,
  useUpdateLeadStatus,
} from "@/lib/queries";
import { cn, formatBudget, formatScore, timeAgo } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Archive,
  CheckCircle,
  Copy,
  ExternalLink,
  Eye,
  Flame,
  Loader2,
  RotateCcw,
  Send,
  Star,
  TrendingDown,
  Trophy,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CompanyHealthBadge } from "./CompanyHealthBadge";

// Score breakdown factor config — must match ScoringEngine.ts
const FACTORS = [
  { key: "skill_match", label: "Skill Match", max: 30, color: "bg-blue-500" },
  { key: "budget", label: "Budget Fit", max: 20, color: "bg-emerald-500" },
  {
    key: "client_quality",
    label: "Client Quality",
    max: 15,
    color: "bg-violet-500",
  },
  { key: "recency", label: "Recency", max: 15, color: "bg-orange-500" },
  { key: "competition", label: "Competition", max: 10, color: "bg-yellow-500" },
  { key: "contact", label: "Contact Info", max: 10, color: "bg-cyan-500" },
] as const;

// FR-08 debrief dimension labels
const DEBRIEF_DIMENSIONS: { key: string; label: string }[] = [
  { key: "rate_alignment", label: "Rate Alignment" },
  { key: "message_relevance", label: "Message Relevance" },
  { key: "response_speed", label: "Response Speed" },
  { key: "message_length", label: "Message Length" },
  { key: "portfolio_match", label: "Portfolio Match" },
  { key: "tone", label: "Tone" },
  { key: "subject_line", label: "Subject Line" },
];

interface LeadDetailPanelProps {
  leadId: string | null;
  onClose: () => void;
}

export function LeadDetailPanel({ leadId, onClose }: LeadDetailPanelProps) {
  const [draftTab, setDraftTab] = useState("email");
  const [watching, setWatching] = useState(false);

  const { getToken } = useAuth();
  const { data: lead, isLoading } = useLead(leadId ?? "");
  const { data: draftResult } = useLeadDraft(leadId ?? "");
  const updateStatus = useUpdateLeadStatus();
  const requestDraft = useRequestDraft();

  const score = lead?.score;
  const breakdown = (score?.score_breakdown ?? {}) as Record<string, number>;
  const draftStatus = draftResult?.status ?? "none";
  const drafts = draftResult?.drafts as any;

  const copy = (text: string, label = "Copied!") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const handleStatus = async (status: string) => {
    if (!leadId) return;
    await updateStatus.mutateAsync({ id: leadId, status });
    toast.success(`Lead marked as ${status}`);
    onClose();
  };

  const handleGenerate = async () => {
    if (!leadId) return;
    await requestDraft.mutateAsync({ lead_id: leadId, channels: ["email"] });
  };

  const handleWatch = async () => {
    if (!lead?.client_name) return;
    setWatching(true);
    try {
      const token = await getToken();
      await watchlistApi.add(
        {
          company_name: lead.client_name,
          company_url: lead.client_url ?? undefined,
        },
        token ?? "",
      );
      toast.success(`${lead.client_name} added to watchlist`);
    } catch {
      toast.error("Failed to add to watchlist");
    } finally {
      setWatching(false);
    }
  };

  return (
    <Dialog.Root open={!!leadId} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-background border-l shadow-2xl outline-none"
          aria-describedby={undefined}
        >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex shrink-0 items-start gap-3 border-b px-5 py-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                {lead?.source && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {lead.source.replace(/_/g, " ")}
                  </Badge>
                )}
                {lead?.golden_hour && (
                  <Badge
                    variant="golden"
                    className="gap-1 text-[10px] shrink-0"
                  >
                    <Flame className="h-2.5 w-2.5" />
                    Golden Hour
                  </Badge>
                )}
                {lead?.boomerang && (
                  <Badge
                    variant="secondary"
                    className="gap-1 text-[10px] shrink-0 border-blue-200 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    Boomerang
                  </Badge>
                )}
                {lead?.remote && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    Remote
                  </Badge>
                )}
              </div>
              <Dialog.Title className="text-sm font-semibold leading-snug">
                {isLoading ? "Loading…" : (lead?.title ?? "Lead Detail")}
              </Dialog.Title>
              {lead?.client_name && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {lead.client_name}
                  {lead.ingested_at && ` · ${timeAgo(lead.ingested_at)}`}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {lead?.url && (
                <a
                  href={lead.url}
                  target="_blank"
                  rel="noreferrer"
                  title="Open original post"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          {/* ── Scrollable body ─────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {lead && (
              <div className="divide-y">
                {/* ── Score + AI Summary ── */}
                <div className="px-5 py-5 space-y-5">
                  <div className="flex items-start gap-4">
                    {/* Score circle */}
                    <div
                      className={cn(
                        "flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border-2 font-bold",
                        score
                          ? score.ai_score >= 75
                            ? "border-green-500 text-green-600"
                            : score.ai_score >= 50
                              ? "border-yellow-500 text-yellow-600"
                              : "border-red-500 text-red-600"
                          : "border-muted text-muted-foreground",
                      )}
                    >
                      <span className="text-2xl leading-none">
                        {score ? formatScore(score.ai_score) : "—"}
                      </span>
                      <span className="text-[9px] mt-0.5 font-normal text-muted-foreground">
                        score
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                        AI Analysis
                      </p>
                      <p className="text-sm leading-relaxed">
                        {score?.ai_summary ?? "Not yet scored."}
                      </p>
                    </div>
                  </div>

                  {/* Breakdown bars */}
                  {score && (
                    <div className="space-y-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Score Breakdown
                      </p>
                      {FACTORS.map(({ key, label, max, color }) => {
                        const val = breakdown[key] ?? 0;
                        const pct = Math.round((val / max) * 100);
                        return (
                          <div key={key} className="flex items-center gap-3">
                            <span className="w-28 shrink-0 text-xs text-muted-foreground">
                              {label}
                            </span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", color)}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-10 shrink-0 text-right text-xs font-mono tabular-nums text-muted-foreground">
                              {val}/{max}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Skill gaps */}
                  {score?.skill_gaps && score.skill_gaps.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                        Skill Gaps
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {score.skill_gaps.map((gap: string) => (
                          <Badge
                            key={gap}
                            variant="destructive"
                            className="text-[10px]"
                          >
                            {gap}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Lead metadata grid ── */}
                <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3">
                  {lead.client_name && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                        Company
                      </p>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium">
                          {lead.client_name}
                        </p>
                        {lead.company_health && (
                          <CompanyHealthBadge health={lead.company_health} />
                        )}
                      </div>
                    </div>
                  )}
                  {lead.company_health && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                        Company Health
                      </p>
                      <ul className="space-y-0.5">
                        {lead.company_health.signals.map(
                          (s: string, i: number) => (
                            <li
                              key={i}
                              className="text-xs text-muted-foreground"
                            >
                              • {s}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                      Budget
                    </p>
                    <p className="text-sm">
                      {formatBudget(lead.budget_min, lead.budget_max)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                      Posted
                    </p>
                    <p className="text-sm">{timeAgo(lead.ingested_at)}</p>
                  </div>
                  {lead.location && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                        Location
                      </p>
                      <p className="text-sm">{lead.location}</p>
                    </div>
                  )}
                  {lead.experience_level && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                        Level
                      </p>
                      <p className="text-sm capitalize">
                        {lead.experience_level}
                      </p>
                    </div>
                  )}
                  {lead.applicant_count != null && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                        Applicants
                      </p>
                      <p className="text-sm">{lead.applicant_count}</p>
                    </div>
                  )}
                </div>

                {/* ── Required skills ── */}
                {lead.skills_required?.length > 0 && (
                  <div className="px-5 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      Required Skills
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {lead.skills_required.map((s: string) => (
                        <Badge
                          key={s}
                          variant="secondary"
                          className="text-[10px]"
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Description ── */}
                {lead.description && (
                  <div className="px-5 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      Description
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line line-clamp-10">
                      {lead.description}
                    </p>
                  </div>
                )}

                {/* ── FR-05: Boomerang — Previous Contact ── */}
                {lead.boomerang && lead.boomerang_context && (
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-2">
                      <RotateCcw className="h-3.5 w-3.5 text-blue-500" />
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Previous Contact
                      </p>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20 p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium w-20 shrink-0">
                          Contacted
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {lead.boomerang_context.contacted_at
                            ? timeAgo(lead.boomerang_context.contacted_at)
                            : "unknown"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium w-20 shrink-0">
                          Outcome
                        </span>
                        <Badge
                          variant={
                            lead.boomerang_context.outcome === "won"
                              ? "default"
                              : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {lead.boomerang_context.outcome ?? "no reply"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium w-20 shrink-0">
                          Similarity
                        </span>
                        <span className="text-xs font-mono">
                          {Math.round(
                            (lead.boomerang_context.similarity ?? 0) * 100,
                          )}
                          % match
                        </span>
                      </div>
                      {lead.boomerang_context.ai_summary && (
                        <p className="text-xs text-muted-foreground italic pt-0.5">
                          {lead.boomerang_context.ai_summary}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* ── FR-03: Portfolio Matches ── */}
                {lead.portfolio_matches &&
                  (lead.portfolio_matches as any[]).length > 0 && (
                    <div className="px-5 py-4">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                        Portfolio Matches
                      </p>
                      <div className="space-y-2">
                        {(lead.portfolio_matches as any[]).map((m: any) => (
                          <div
                            key={m.portfolio_piece_id}
                            className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">
                                {m.title}
                              </p>
                              {m.key_outcome && (
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {m.key_outcome}
                                </p>
                              )}
                            </div>
                            <div className="text-right ml-3 shrink-0">
                              <p className="text-xs font-mono font-semibold">
                                {Math.round((m.similarity ?? 0) * 100)}%
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                match
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* ── FR-04: Optimal Send Window ── */}
                {lead.recipient_timezone && (
                  <div className="px-5 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                      Recipient Timezone
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lead.recipient_timezone.replace("_", " ")}
                    </p>
                  </div>
                )}

                {/* ── FR-08: Win/Loss Debrief ── */}
                {(lead.status === "won" || lead.status === "lost") && (
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-3">
                      {lead.status === "won" ? (
                        <Trophy className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Outcome Debrief
                      </p>
                      <Badge
                        variant={
                          lead.status === "won" ? "default" : "destructive"
                        }
                        className="text-[10px] ml-auto"
                      >
                        {lead.status.toUpperCase()}
                      </Badge>
                    </div>

                    {!score?.debrief ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating debrief…
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {DEBRIEF_DIMENSIONS.map(({ key, label }) => {
                          const dim = (score.debrief as any)?.dimensions?.[key];
                          if (!dim) return null;
                          return (
                            <div
                              key={key}
                              className="rounded-lg border p-3 space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium">
                                  {label}
                                </span>
                                <div className="flex">
                                  {[1, 2, 3, 4, 5].map((i) => (
                                    <Star
                                      key={i}
                                      className={cn(
                                        "h-3 w-3",
                                        i <= dim.score
                                          ? "fill-amber-400 text-amber-400"
                                          : "text-muted-foreground/30",
                                      )}
                                    />
                                  ))}
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {dim.analysis}
                              </p>
                              {dim.recommendation && (
                                <p className="text-xs text-blue-600 dark:text-blue-400">
                                  → {dim.recommendation}
                                </p>
                              )}
                            </div>
                          );
                        })}
                        {(score.debrief as any)?.top_strength && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">
                              Top Strength
                            </p>
                            <p className="text-xs">
                              {(score.debrief as any).top_strength}
                            </p>
                          </div>
                        )}
                        {(score.debrief as any)?.top_improvement && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1">
                              Top Improvement
                            </p>
                            <p className="text-xs">
                              {(score.debrief as any).top_improvement}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Outreach Draft ── */}
                <div className="px-5 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    Outreach Draft
                  </p>

                  {/* No draft yet */}
                  {draftStatus === "none" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGenerate}
                      disabled={requestDraft.isPending}
                    >
                      {requestDraft.isPending ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-3.5 w-3.5" />
                      )}
                      {requestDraft.isPending
                        ? "Requesting…"
                        : "Generate Draft"}
                    </Button>
                  )}

                  {/* Generating */}
                  {draftStatus === "generating" && (
                    <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      AI is writing your outreach draft…
                    </div>
                  )}

                  {/* Failed */}
                  {draftStatus === "failed" && (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          {(draftResult as any)?.error ??
                            "Draft generation failed."}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleGenerate}
                        disabled={requestDraft.isPending}
                      >
                        {requestDraft.isPending ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-3.5 w-3.5" />
                        )}
                        Retry
                      </Button>
                    </div>
                  )}

                  {/* Draft ready */}
                  {draftStatus === "ready" && drafts && (
                    <Tabs.Root value={draftTab} onValueChange={setDraftTab}>
                      <Tabs.List className="flex w-full items-center rounded-lg border bg-muted p-1 gap-1 mb-4">
                        {(
                          ["email", "linkedin", "twitter", "clipboard"] as const
                        )
                          .filter((t) => drafts[t])
                          .map((tab) => (
                            <Tabs.Trigger
                              key={tab}
                              value={tab}
                              className="flex-1 rounded-md py-1 text-xs font-medium capitalize transition-colors data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground"
                            >
                              {tab === "clipboard"
                                ? "Clipboard"
                                : tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </Tabs.Trigger>
                          ))}
                      </Tabs.List>

                      {/* Email */}
                      {drafts.email && (
                        <Tabs.Content value="email" className="mt-0 space-y-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                Subject
                              </p>
                              <button
                                onClick={() =>
                                  copy(drafts.email.subject, "Subject copied")
                                }
                                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Copy className="h-3 w-3" /> Copy
                              </button>
                            </div>
                            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
                              {drafts.email.subject}
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                Body · {drafts.email.word_count} words
                              </p>
                              <button
                                onClick={() =>
                                  copy(drafts.email.body, "Email body copied")
                                }
                                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Copy className="h-3 w-3" /> Copy
                              </button>
                            </div>
                            <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-line">
                              {drafts.email.body}
                            </div>
                          </div>

                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() =>
                              copy(
                                `Subject: ${drafts.email.subject}\n\n${drafts.email.body}`,
                                "Full email copied!",
                              )
                            }
                          >
                            <Copy className="mr-2 h-3.5 w-3.5" />
                            Copy Full Email
                          </Button>
                        </Tabs.Content>
                      )}

                      {/* LinkedIn */}
                      {drafts.linkedin && (
                        <Tabs.Content
                          value="linkedin"
                          className="mt-0 space-y-2"
                        >
                          {drafts.linkedin.inmail_subject && (
                            <div className="rounded-md border bg-muted/40 px-3 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                                Subject
                              </p>
                              <p className="text-sm font-medium">
                                {drafts.linkedin.inmail_subject}
                              </p>
                            </div>
                          )}
                          <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-line">
                            {drafts.linkedin.inmail_body ??
                              drafts.linkedin.body}
                          </div>
                          {drafts.linkedin.connection_note && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                                Connection Note
                              </p>
                              <div className="rounded-md border bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-line">
                                {drafts.linkedin.connection_note}
                              </div>
                            </div>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() =>
                              copy(
                                drafts.linkedin.inmail_body ??
                                  drafts.linkedin.body ??
                                  "",
                                "LinkedIn message copied",
                              )
                            }
                          >
                            <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                          </Button>
                        </Tabs.Content>
                      )}

                      {/* Twitter */}
                      {drafts.twitter && (
                        <Tabs.Content
                          value="twitter"
                          className="mt-0 space-y-2"
                        >
                          <div className="rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">
                            {drafts.twitter.dm ?? drafts.twitter.body}
                          </div>
                          <p className="text-right text-xs text-muted-foreground">
                            {
                              (drafts.twitter.dm ?? drafts.twitter.body ?? "")
                                .length
                            }
                            /280
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() =>
                              copy(
                                drafts.twitter.dm ?? drafts.twitter.body ?? "",
                                "Tweet copied",
                              )
                            }
                          >
                            <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                          </Button>
                        </Tabs.Content>
                      )}

                      {/* Clipboard */}
                      {drafts.clipboard && (
                        <Tabs.Content
                          value="clipboard"
                          className="mt-0 space-y-2"
                        >
                          <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-line">
                            {drafts.clipboard.pitch ?? drafts.clipboard.body}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() =>
                              copy(
                                drafts.clipboard.pitch ??
                                  drafts.clipboard.body ??
                                  "",
                                "Copied to clipboard",
                              )
                            }
                          >
                            <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                          </Button>
                        </Tabs.Content>
                      )}
                    </Tabs.Root>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Footer action bar ───────────────────────────────────────────── */}
          {lead && (
            <div className="shrink-0 flex items-center justify-between gap-2 border-t bg-background px-5 py-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatus("archived")}
                  disabled={updateStatus.isPending}
                >
                  <Archive className="mr-1.5 h-3.5 w-3.5" />
                  Archive
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatus("dismissed")}
                  disabled={updateStatus.isPending}
                >
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                  Dismiss
                </Button>
                {/* FR-06: Watch Company */}
                {lead.client_name && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleWatch}
                    disabled={watching}
                    title={`Watch ${lead.client_name} for trigger events`}
                  >
                    {watching ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Watch
                  </Button>
                )}
                {/* FR-08: Won / Lost — only when actioned/contacted/won/lost */}
                {lead.status != null &&
                  ["actioned", "contacted", "won", "lost"].includes(
                    lead.status,
                  ) && (
                    <>
                      <Button
                        size="sm"
                        disabled={
                          updateStatus.isPending || lead.status === "won"
                        }
                        onClick={() => handleStatus("won")}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                      >
                        <Trophy className="h-3.5 w-3.5" /> Won
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={
                          updateStatus.isPending || lead.status === "lost"
                        }
                        onClick={() => handleStatus("lost")}
                        className="gap-1.5"
                      >
                        <TrendingDown className="h-3.5 w-3.5" /> Lost
                      </Button>
                    </>
                  )}
              </div>
              <Button
                size="sm"
                onClick={() => handleStatus("actioned")}
                disabled={updateStatus.isPending}
              >
                <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                Mark Contacted
              </Button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
