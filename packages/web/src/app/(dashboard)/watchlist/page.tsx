'use client';

import { useState } from 'react';
import { useWatchlist } from '@/lib/queries';
import { watchlistApi } from '@/lib/api';
import { useAuth } from '@clerk/nextjs';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { timeAgo } from '@/lib/utils';

export default function WatchlistPage() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { data: items, isLoading } = useWatchlist();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ company_name: '', company_url: '', notes: '' });

  const handleAdd = async () => {
    const token = await getToken();
    await watchlistApi.add(form, token ?? '');
    qc.invalidateQueries({ queryKey: ['watchlist'] });
    setForm({ company_name: '', company_url: '', notes: '' });
    setAdding(false);
    toast.success('Company added to watchlist');
  };

  const handleRemove = async (id: string) => {
    const token = await getToken();
    await watchlistApi.remove(id, token ?? '');
    qc.invalidateQueries({ queryKey: ['watchlist'] });
    toast.success('Removed from watchlist');
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Watchlist</h1>
          <p className="text-sm text-muted-foreground">Monitor companies for trigger events</p>
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
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              placeholder="Company URL"
              value={form.company_url}
              onChange={(e) => setForm({ ...form, company_url: e.target.value })}
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
              <Button size="sm" onClick={handleAdd} disabled={!form.company_name}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
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
            Add companies to get notified when they raise funding, post jobs, or change leadership.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {items?.map((item: any) => (
          <div key={item.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
            <div>
              <p className="font-medium text-sm">{item.company_name}</p>
              {item.company_url && (
                <a href={item.company_url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">
                  {item.company_url}
                </a>
              )}
            </div>
            <div className="flex items-center gap-2">
              {item.latest_funding_round_at && (
                <Badge variant="golden" className="text-[10px]">Recent funding</Badge>
              )}
              <span className="text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
              <Button variant="ghost" size="icon" onClick={() => handleRemove(item.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
