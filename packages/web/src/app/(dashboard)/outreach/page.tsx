'use client';

import { useOutreachQueue, useApproveOutreach } from '@/lib/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { timeAgo } from '@/lib/utils';

export default function OutreachPage() {
  const { data: queue, isLoading } = useOutreachQueue();
  const approve = useApproveOutreach();

  const handleApprove = async (item: any, channel: string) => {
    await approve.mutateAsync({ item_id: item.id, channel });
    toast.success('Outreach approved and queued for sending');
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Outreach Queue</h1>
        <p className="text-sm text-muted-foreground">Review and approve AI-generated outreach drafts</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!queue || queue.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <p className="text-muted-foreground">No pending drafts</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click "Generate draft" on a lead to create outreach drafts.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {queue?.map((item: any) => {
          const drafts = item.drafts ?? {};
          const channels = Object.keys(drafts);
          return (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Lead #{item.lead_id?.slice(0, 8)}</CardTitle>
                  <Badge variant="secondary">{timeAgo(item.created_at)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {channels.map((channel) => (
                  <div key={channel} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <Badge variant="outline" className="capitalize">{channel}</Badge>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApprove(item, channel)}
                          disabled={approve.isPending}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
                      </div>
                    </div>
                    <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-sans">
                      {typeof drafts[channel] === 'string'
                        ? drafts[channel]
                        : drafts[channel]?.body ?? JSON.stringify(drafts[channel])}
                    </pre>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
