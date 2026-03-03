"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { outreachApi } from "@/lib/api";
import {
  useApproveOutreach,
  useOptimalSendWindow,
  useOutreachQueue,
  usePortfolio,
  useRequestDraft,
} from "@/lib/queries";
import { timeAgo } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clipboard,
  Clock,
  Copy,
  Linkedin,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  SkipForward,
  Twitter,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ── Per-channel draft body extraction ─────────────────────────────────────────
function getDraftText(channel: string, draft: any): string {
  if (!draft) return "";
  if (channel === "email") return draft.body ?? "";
  if (channel === "linkedin")
    return [
      draft.inmail_subject ? `Subject: ${draft.inmail_subject}` : null,
      draft.inmail_body ?? null,
      draft.connection_note
        ? `\n── Connection Note ──\n${draft.connection_note}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  if (channel === "twitter") return draft.dm ?? "";
  if (channel === "clipboard") return draft.pitch ?? "";
  return typeof draft === "string" ? draft : JSON.stringify(draft, null, 2);
}

const CHANNEL_ICON: Record<string, React.ElementType> = {
  email: Mail,
  linkedin: Linkedin,
  twitter: Twitter,
  clipboard: Clipboard,
};

// ── FR-04: Send window badge (own component so it can call a hook) ─────────────
function SendWindowBadge({ leadId }: { leadId: string }) {
  const { data: win } = useOptimalSendWindow(leadId);
  if (!win) return null;
  return (
    <div className="flex items-center gap-1 mt-1 text-[10px]">
      <Clock className="h-3 w-3 text-muted-foreground" />
      {win.is_in_window_now ? (
        <span className="text-emerald-600 font-medium">
          In optimal window now
        </span>
      ) : (
        <span className="text-muted-foreground">
          Best: {win.local_time_description}
        </span>
      )}
    </div>
  );
}

// ── Per-card component (own component so it can call hooks) ───────────────────
function OutreachCard({ item, portfolio }: { item: any; portfolio: any[] }) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const approve = useApproveOutreach();
  const requestDraft = useRequestDraft();
  const [skipping, setSkipping] = useState(false);
  const [selectedPieceId, setSelectedPieceId] = useState("");

  const drafts = (item.drafts ?? {}) as Record<string, any>;
  const isGenerating = item.status === "pending" || !item.drafts;
  const channels = Object.keys(drafts).filter((k) => k !== "generated_at");

  const handleApprove = async (channel: string) => {
    await approve.mutateAsync({ item_id: item.id, channel });
    toast.success("Outreach approved and queued for sending");
  };

  const handleSkip = async () => {
    setSkipping(true);
    try {
      const token = await getToken();
      await outreachApi.skip(item.id, token ?? "");
      qc.invalidateQueries({ queryKey: ["outreach", "queue"] });
      toast.success("Draft skipped");
    } catch {
      toast.error("Failed to skip draft");
    } finally {
      setSkipping(false);
    }
  };

  const handleRegenerate = async () => {
    await requestDraft.mutateAsync({
      lead_id: item.lead_id,
      channels: channels.length > 0 ? channels : ["email"],
      portfolio_piece_id: selectedPieceId || undefined,
    });
    toast.info("Regenerating draft…");
    setSelectedPieceId("");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm truncate">
              {item.lead_title ?? `Lead #${item.lead_id?.slice(0, 8)}`}
            </CardTitle>
            {item.lead_source && (
              <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
                {item.lead_source.replace(/_/g, " ")}
              </p>
            )}
            {/* FR-04: Optimal send window */}
            {item.lead_id && <SendWindowBadge leadId={item.lead_id} />}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isGenerating ? (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating…
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] text-emerald-600 border-emerald-300"
              >
                Ready
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {timeAgo(item.created_at)}
            </span>
          </div>
        </div>
      </CardHeader>

      {!isGenerating && channels.length > 0 && (
        <CardContent className="space-y-3 pt-0">
          {channels.map((channel) => {
            const draft = drafts[channel];
            const Icon = CHANNEL_ICON[channel] ?? Send;
            const bodyText = getDraftText(channel, draft);
            const subject = channel === "email" ? draft?.subject : null;
            const charCount = channel === "twitter" ? bodyText.length : null;

            return (
              <div
                key={channel}
                className="rounded-md border bg-muted/20 p-3 space-y-2"
              >
                {/* Channel header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium capitalize">
                      {channel}
                    </span>
                    {charCount !== null && (
                      <span
                        className={`text-[10px] ${charCount > 280 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {charCount}/280
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        const text = subject
                          ? `Subject: ${subject}\n\n${bodyText}`
                          : bodyText;
                        navigator.clipboard.writeText(text);
                        toast.success("Copied to clipboard");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => handleApprove(channel)}
                      disabled={approve.isPending}
                    >
                      <Check className="h-3 w-3" />
                      Approve
                    </Button>
                  </div>
                </div>

                {/* Email subject */}
                {subject && (
                  <div className="rounded border bg-background px-2.5 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                      Subject
                    </p>
                    <p className="text-xs font-medium">{subject}</p>
                  </div>
                )}

                {/* Body */}
                {bodyText && (
                  <pre className="max-h-40 overflow-y-auto rounded bg-background border px-2.5 py-2 whitespace-pre-wrap text-xs text-muted-foreground font-sans leading-relaxed">
                    {bodyText}
                  </pre>
                )}
              </div>
            );
          })}

          {/* FR-03: Portfolio override + regenerate ─────────────────────────── */}
          <div className="flex items-center gap-2 border-t pt-2">
            <select
              value={selectedPieceId}
              onChange={(e) => setSelectedPieceId(e.target.value)}
              className="flex-1 rounded border bg-background px-2 py-1 text-xs text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
              title="Pick a portfolio piece to use when regenerating"
            >
              <option value="">Auto portfolio (default)</option>
              {portfolio.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 shrink-0"
              onClick={handleRegenerate}
              disabled={requestDraft.isPending}
              title="Regenerate draft (optionally with a specific portfolio piece)"
            >
              {requestDraft.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Regenerate
            </Button>
          </div>

          {/* Skip entire item */}
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={handleSkip}
              disabled={skipping}
            >
              {skipping ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <SkipForward className="h-3 w-3" />
              )}
              Skip all
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function OutreachPage() {
  const { data: queue, isLoading } = useOutreachQueue();
  const { data: portfolio = [] } = usePortfolio();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Outreach Queue</h1>
        <p className="text-sm text-muted-foreground">
          Review and approve AI-generated outreach drafts
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!queue || queue.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <Send className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground">No pending drafts</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click &quot;Generate draft&quot; on a lead to create outreach
            drafts.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {queue?.map((item: any) => (
          <OutreachCard key={item.id} item={item} portfolio={portfolio} />
        ))}
      </div>
    </div>
  );
}
