import type { Metadata } from "next";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-xl font-bold">Analytics</h1>
      <AnalyticsDashboard />
    </div>
  );
}
