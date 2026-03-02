'use client';

import { useBriefings } from '@/lib/queries';
import { briefingsApi } from '@/lib/api';
import { useAuth } from '@clerk/nextjs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, BookOpen, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { timeAgo } from '@/lib/utils';

export default function BriefingsPage() {
  const { getToken } = useAuth();
  const { data: briefings, isLoading, refetch } = useBriefings();

  const handleGenerate = async () => {
    const token = await getToken();
    await briefingsApi.generate(token ?? '');
    toast.success('Briefing generation queued — check back in a moment');
    setTimeout(() => refetch(), 3000);
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Daily Briefings</h1>
          <p className="text-sm text-muted-foreground">Your AI-generated lead intelligence summaries</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleGenerate}>
          <RefreshCw className="h-3.5 w-3.5" />
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
            Your first briefing will be generated at 8 AM in your timezone.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {briefings?.map((b: any) => (
          <Card key={b.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  Briefing — {new Date(b.generated_at).toLocaleDateString()}
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  {b.opened_at && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Opened
                    </Badge>
                  )}
                  <Badge variant="outline">{timeAgo(b.generated_at)}</Badge>
                </div>
              </div>
              <CardDescription>
                {b.lead_count} leads · {b.actions_taken} actions taken
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
