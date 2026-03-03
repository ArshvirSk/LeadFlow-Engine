"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRequestDraft, useUpdateLeadStatus } from "@/lib/queries";
import {
  cn,
  formatBudget,
  formatScore,
  scoreColor,
  timeAgo,
  truncate,
} from "@/lib/utils";
import {
  Archive,
  ExternalLink,
  Flame,
  RotateCcw,
  Send,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { CompanyHealthBadge } from "./CompanyHealthBadge";
import { CountdownTimer } from "./CountdownTimer";

interface LeadCardProps {
  lead: any;
  onOpen?: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  upwork: "Upwork",
  manual: "Manual",
  extension: "Extension",
  reddit: "Reddit",
  community: "Community",
  proactive_trigger: "Proactive",
};

const TRIGGER_BADGE: Record<string, { label: string; classes: string }> = {
  FUNDING_ROUND: {
    label: "💰 Funding Round",
    classes:
      "border-green-200 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  PRODUCTHUNT_LAUNCH: {
    label: "🚀 PH Launch",
    classes:
      "border-yellow-200 bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  },
  GITHUB_MILESTONE: {
    label: "⭐ GitHub Activity",
    classes:
      "border-sky-200 bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  },
  BLOG_HIRING_SIGNAL: {
    label: "📝 Hiring Signal",
    classes:
      "border-purple-200 bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  },
};

export function LeadCard({ lead, onOpen }: LeadCardProps) {
  const updateStatus = useUpdateLeadStatus();
  const requestDraft = useRequestDraft();

  const score = lead.score?.ai_score ?? null;
  const isGolden = lead.golden_hour;

  const handleAction = async (status: string) => {
    await updateStatus.mutateAsync({ id: lead.id, status });
    toast.success(`Lead ${status}`);
  };

  const handleDraft = async () => {
    await requestDraft.mutateAsync({
      lead_id: lead.id,
      channels: ["email", "linkedin"],
    });
    toast.success("Generating outreach drafts…");
  };

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card p-4 transition-shadow hover:shadow-md",
        isGolden && "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10",
      )}
    >
      {/* Golden hour indicator */}
      {isGolden && (
        <div className="absolute -top-1.5 -right-1.5 flex flex-col items-end gap-0.5">
          <Badge variant="golden" className="gap-1 golden-hour-badge">
            <Flame className="h-3 w-3" />
            Golden Hour
          </Badge>
          {lead.ingested_at && (
            <CountdownTimer
              expiresAt={
                new Date(
                  new Date(lead.ingested_at).getTime() + 2 * 60 * 60 * 1000,
                )
              }
            />
          )}
        </div>
      )}

      {/* Boomerang indicator — top-left when no golden badge, otherwise below */}
      {lead.boomerang && (
        <div
          className="absolute -top-1.5 -left-1.5"
          title={
            lead.boomerang_context
              ? `Previously contacted ${lead.boomerang_context.contacted_at ? new Date(lead.boomerang_context.contacted_at).toLocaleDateString() : ""} · outcome: ${lead.boomerang_context.outcome ?? "unknown"} · ${Math.round((lead.boomerang_context.similarity ?? 0) * 100)}% match`
              : "Seen before"
          }
        >
          <Badge
            variant="secondary"
            className="gap-1 text-[10px] border-blue-200 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            Boomerang
          </Badge>
        </div>
      )}

      {/* FR-06: Proactive trigger badge — top-left (if no boomerang) */}
      {!lead.boomerang && lead.source === "proactive_trigger" && (
        <div
          className="absolute -top-1.5 -left-1.5"
          title={
            lead.trigger_event
              ? `Trigger: ${lead.trigger_event.type?.replace(/_/g, " ") ?? ""}`
              : "Proactive trigger"
          }
        >
          <Badge
            variant="secondary"
            className={cn(
              "gap-1 text-[10px]",
              lead.trigger_event?.type
                ? TRIGGER_BADGE[lead.trigger_event.type]?.classes
                : "border-violet-200 bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
            )}
          >
            <Zap className="h-2.5 w-2.5" />
            {lead.trigger_event?.type
              ? (TRIGGER_BADGE[lead.trigger_event.type]?.label ?? "Proactive")
              : "Proactive"}
          </Badge>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Score */}
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border bg-background">
          {score !== null ? (
            <>
              <span
                className={cn(
                  "text-lg font-bold leading-none",
                  scoreColor(score),
                )}
              >
                {formatScore(score)}
              </span>
              <span className="text-[10px] text-muted-foreground">score</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold leading-tight line-clamp-2">
                <button
                  onClick={onOpen}
                  className="text-left hover:underline focus:outline-none"
                >
                  {lead.title || "Untitled Lead"}
                </button>
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">
                  {SOURCE_LABELS[lead.source] ?? lead.source}
                </Badge>
                {lead.remote && (
                  <Badge variant="secondary" className="text-[10px]">
                    Remote
                  </Badge>
                )}
                {lead.budget_min || lead.budget_max ? (
                  <Badge variant="outline" className="text-[10px]">
                    {formatBudget(lead.budget_min, lead.budget_max)}
                  </Badge>
                ) : null}
                {lead.client_name && lead.company_health ? (
                  <CompanyHealthBadge health={lead.company_health} />
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {timeAgo(lead.ingested_at)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                title="Generate outreach draft"
                onClick={handleDraft}
                disabled={requestDraft.isPending}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
              <a
                href={lead.url}
                target="_blank"
                rel="noreferrer"
                title="Open original"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <Button
                variant="ghost"
                size="icon"
                title="Archive"
                onClick={() => handleAction("archived")}
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Dismiss"
                onClick={() => handleAction("dismissed")}
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {lead.description && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
              {truncate(lead.description, 180)}
            </p>
          )}

          {lead.score?.ai_summary && (
            <p className="mt-1.5 text-xs text-muted-foreground italic line-clamp-1">
              {lead.score.ai_summary}
            </p>
          )}

          {/* FR-06: Trigger event callout banner */}
          {lead.source === "proactive_trigger" &&
            lead.trigger_event?.summary && (
              <div className="mt-2 flex items-start gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 dark:bg-violet-950/30 dark:border-violet-800">
                <Zap className="mt-0.5 h-3 w-3 shrink-0 text-violet-600 dark:text-violet-400" />
                <p className="text-[11px] leading-snug text-violet-700 dark:text-violet-300">
                  {lead.trigger_event.summary}
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
