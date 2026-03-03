"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAnalyticsSummary, usePatternReport } from "@/lib/queries";
import {
  AlertTriangle,
  Lightbulb,
  Loader2,
  RotateCcw,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        highlight ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10" : ""
      }
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const COLORS = [
  "hsl(var(--primary))",
  "#10b981",
  "#f59e0b",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
];

const DIMENSION_LABELS: Record<string, string> = {
  rate_alignment: "Rate Alignment",
  message_relevance: "Message Relevance",
  response_speed: "Response Speed",
  message_length: "Message Length",
  portfolio_match: "Portfolio Match",
  tone: "Tone",
  subject_line: "Subject Line",
};

export function AnalyticsDashboard() {
  const { data, isLoading } = useAnalyticsSummary();
  const { data: patternData } = usePatternReport();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalLeads = data?.lead_volume?.total ?? 0;
  const winRate = data?.win_loss?.win_rate ?? 0;
  const ghHitRate = data?.golden_hour?.hit_rate ?? 0;
  const outreachSent = data?.outreach_activity?.sent ?? 0;
  const totalWon = data?.win_loss?.total_won ?? 0;
  const totalLost = data?.win_loss?.total_lost ?? 0;
  const boomerangDetected = data?.boomerang?.total_detected ?? 0;

  // Volume by day
  const byDayData: { date: string; count: number }[] =
    data?.lead_volume?.by_day ?? [];

  // By source pie data
  const bySourceData = Object.entries(data?.lead_volume?.by_source ?? {}).map(
    ([name, value]) => ({ name, value }),
  );

  // Source performance table
  const sourcePerfRows = data?.source_performance ?? [];

  // Win/loss by source bar data
  const wlData = (data?.win_loss?.by_source ?? []).map((r: any) => ({
    source: r.source,
    won: r.won,
    lost: r.lost,
  }));

  // Score band data
  const bandOrder = ["high", "medium", "low"];
  const bandData = bandOrder
    .map((band) => {
      const row = (data?.win_loss?.by_score_band ?? []).find(
        (r: any) => r.band === band,
      );
      return { band, won: row?.won ?? 0, lost: row?.lost ?? 0 };
    })
    .filter((r) => r.won + r.lost > 0);

  return (
    <div className="space-y-6">
      {/* ── Top metric cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Leads Scored (30d)" value={totalLeads} />
        <MetricCard
          label="Win Rate"
          value={`${winRate}%`}
          sub={`${totalWon}W · ${totalLost}L`}
          icon={Trophy}
          highlight={winRate > 0}
        />
        <MetricCard
          label="Golden Hour Hit Rate"
          value={`${ghHitRate}%`}
          sub={`${data?.golden_hour?.contacted_within_window ?? 0} / ${data?.golden_hour?.total_surfaced ?? 0}`}
          icon={Zap}
          highlight={ghHitRate > 50}
        />
        <MetricCard
          label="Outreach Sent (30d)"
          value={outreachSent}
          icon={TrendingUp}
        />
      </div>

      {/* Boomerang + autopilot quick stats */}
      {(boomerangDetected > 0 || (data?.autopilot?.leads_sent ?? 0) > 0) && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {boomerangDetected > 0 && (
            <MetricCard
              label="Boomerang Leads"
              value={boomerangDetected}
              sub={`${data?.boomerang?.won ?? 0} won · ${data?.boomerang?.win_rate ?? 0}% win rate`}
              icon={RotateCcw}
            />
          )}
          {(data?.autopilot?.leads_sent ?? 0) > 0 && (
            <MetricCard
              label="Autopilot Sent"
              value={data?.autopilot?.leads_sent ?? 0}
              sub={`${data?.autopilot?.win_rate ?? 0}% win rate · ~${data?.autopilot?.estimated_hours_saved?.toFixed(0) ?? 0}h saved`}
            />
          )}
          {data?.golden_hour?.best_source && (
            <MetricCard
              label="Best Source (Golden Hr)"
              value={data.golden_hour.best_source}
            />
          )}
        </div>
      )}

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Lead Volume by Day */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Lead Volume (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            {byDayData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={byDayData}>
                  <defs>
                    <linearGradient
                      id="leadGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => v.slice(5)} // "MM-DD"
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(v) => `Date: ${v}`}
                    formatter={(v: any) => [v, "Leads"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    fill="url(#leadGradient)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-14 text-center text-sm text-muted-foreground">
                No data yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* By Source Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Leads by Source</CardTitle>
          </CardHeader>
          <CardContent>
            {bySourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={bySourceData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {bySourceData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [v, "Leads"]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-14 text-center text-sm text-muted-foreground">
                No data yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Win/Loss charts */}
      {(wlData.length > 0 || bandData.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {wlData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Win / Loss by Source</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={wlData}>
                    <XAxis dataKey="source" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey="won"
                      name="Won"
                      fill="#10b981"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="lost"
                      name="Lost"
                      fill="#ef4444"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {bandData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Win / Loss by Score Band
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={bandData}>
                    <XAxis dataKey="band" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey="won"
                      name="Won"
                      fill="#10b981"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="lost"
                      name="Lost"
                      fill="#ef4444"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── FR-08: Pattern Report ── */}
      {patternData?.report && (
        <Card className="border-violet-200 dark:border-violet-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-violet-500" />
              Pattern Report
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                Based on {patternData.loss_count_at_generation} debriefs
                {patternData.generated_at
                  ? ` · ${new Date(patternData.generated_at).toLocaleDateString()}`
                  : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            {patternData.report.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {patternData.report.summary}
              </p>
            )}

            {/* Weakest dimensions */}
            {patternData.report.avg_dimension_scores && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  Recurring Weak Areas
                </p>
                <div className="space-y-2">
                  {Object.entries(
                    patternData.report.avg_dimension_scores as Record<
                      string,
                      number
                    >,
                  )
                    .sort((a, b) => a[1] - b[1])
                    .slice(0, 3)
                    .map(([dim, avg]) => (
                      <div key={dim} className="flex items-center gap-3">
                        <span className="w-36 shrink-0 text-xs text-muted-foreground">
                          {DIMENSION_LABELS[dim] ?? dim}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${Math.round((avg / 5) * 100)}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs font-mono tabular-nums text-muted-foreground">
                          {avg.toFixed(1)}/5
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {(patternData.report.recommendations as string[])?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Actionable Recommendations
                </p>
                <ol className="space-y-2">
                  {(patternData.report.recommendations as string[]).map(
                    (rec, i) => (
                      <li key={i} className="flex gap-2.5 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 text-[10px] font-bold">
                          {i + 1}
                        </span>
                        <span className="text-muted-foreground leading-relaxed">
                          {rec}
                        </span>
                      </li>
                    ),
                  )}
                </ol>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Source performance table ── */}
      {sourcePerfRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Source Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Source
                  </th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Total
                  </th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Responded
                  </th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Won
                  </th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Win %
                  </th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Avg Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {sourcePerfRows.map((r: any) => (
                  <tr
                    key={r.source}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5 font-medium capitalize">
                      {r.source.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.total}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.responded}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.won}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Badge
                        variant={r.win_rate >= 30 ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {r.win_rate}%
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs">
                      {r.avg_score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
