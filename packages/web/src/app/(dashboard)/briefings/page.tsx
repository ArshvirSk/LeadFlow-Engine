"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { briefingsApi } from "@/lib/api";
import { useBriefings } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  ListChecks,
  Loader2,
  RefreshCw,
  Trophy,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function BriefingsPage() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { data: briefings, isLoading, refetch } = useBriefings();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const token = await getToken();
      await briefingsApi.generate(token ?? "");
      toast.success("Briefing generation queued — check back in a moment");
      setTimeout(() => refetch(), 4000);
    } finally {
      setGenerating(false);
    }
  };

  const handleExpand = async (b: any) => {
    const isOpening = expanded !== b.id;
    setExpanded(isOpening ? b.id : null);
    if (isOpening && !b.opened_at) {
      try {
        const token = await getToken();
        await briefingsApi.markOpened(b.id, token ?? "");
        qc.invalidateQueries({ queryKey: ["briefings"] });
      } catch {
        // non-critical
      }
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Daily Briefings</h1>
          <p className="text-sm text-muted-foreground">
            Your AI-generated lead intelligence summaries
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Generate now
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!briefings || briefings.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground">No briefings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your first briefing will be generated at 8 AM in your timezone, or
            click &ldquo;Generate now&rdquo; above.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {briefings?.map((b: any) => {
          const content = b.content as {
            headline?: string;
            topLeads?: {
              id: string;
              title: string;
              reason: string;
              score: number;
            }[];
            insights?: string[];
            actionItems?: string[];
          } | null;
          const isOpen = expanded === b.id;

          return (
            <Card key={b.id} className={b.opened_at ? "" : "border-primary/40"}>
              {/* Clickable header */}
              <CardHeader
                className="cursor-pointer select-none py-4"
                onClick={() => handleExpand(b)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <CardTitle className="text-sm truncate">
                        {content?.headline ??
                          `Briefing — ${new Date(b.generated_at).toLocaleDateString()}`}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {b.lead_count} leads · {b.actions_taken} actions taken
                        this week
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {b.opened_at ? (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <CheckCircle className="h-3 w-3" />
                        Read
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] bg-primary text-primary-foreground">
                        New
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(b.generated_at)}
                    </span>
                  </div>
                </div>
              </CardHeader>

              {/* Expanded content */}
              {isOpen && content && (
                <CardContent className="pt-0 pb-5 space-y-5 border-t">
                  {/* Top leads */}
                  {content.topLeads && content.topLeads.length > 0 && (
                    <div className="pt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Zap className="h-3 w-3 text-amber-500" />
                        Top Leads Today
                      </p>
                      <div className="space-y-2">
                        {content.topLeads.map((lead, i) => (
                          <div
                            key={lead.id ?? i}
                            className="flex items-start gap-2.5 rounded-md border bg-muted/30 px-3 py-2.5"
                          >
                            <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">
                                {lead.title}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {lead.reason}
                              </p>
                            </div>
                            {lead.score > 0 && (
                              <span className="text-xs font-mono font-semibold shrink-0">
                                {lead.score}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Insights */}
                  {content.insights && content.insights.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Lightbulb className="h-3 w-3 text-violet-500" />
                        Insights
                      </p>
                      <ul className="space-y-1.5">
                        {content.insights.map((insight, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-sm text-muted-foreground"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                            {insight}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action items */}
                  {content.actionItems && content.actionItems.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                        <ListChecks className="h-3 w-3 text-emerald-500" />
                        Action Items
                      </p>
                      <ol className="space-y-1.5">
                        {content.actionItems.map((action, i) => (
                          <li key={i} className="flex gap-2.5 text-sm">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold">
                              {i + 1}
                            </span>
                            <span className="text-muted-foreground">
                              {action}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </CardContent>
              )}

              {/* Expanded but no content yet (legacy/empty rows) */}
              {isOpen && !content && (
                <CardContent className="pt-0 pb-4 border-t">
                  <p className="pt-4 text-sm text-muted-foreground">
                    No content available for this briefing.
                  </p>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
