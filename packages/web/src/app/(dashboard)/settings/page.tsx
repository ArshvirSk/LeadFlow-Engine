'use client';

import { useProfile, useUpdateProfile } from '@/lib/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const [form, setForm] = useState({ headline: '', bio: '', timezone: '', hourly_rate_min: 0, hourly_rate_max: 0 });

  useEffect(() => {
    if (profile) {
      setForm({
        headline: profile.headline ?? '',
        bio: profile.bio ?? '',
        timezone: profile.timezone ?? '',
        hourly_rate_min: profile.hourly_rate_min ?? 0,
        hourly_rate_max: profile.hourly_rate_max ?? 0,
      });
    }
  }, [profile]);

  const handleSave = async () => {
    await updateProfile.mutateAsync(form);
    toast.success('Settings saved');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="mb-6 text-xl font-bold">Settings</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Headline</label>
              <input
                value={form.headline}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Bio</label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={4}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Timezone</label>
              <input
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rate Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Min hourly rate (USD)</label>
                <input
                  type="number"
                  value={form.hourly_rate_min}
                  onChange={(e) => setForm({ ...form, hourly_rate_min: Number(e.target.value) })}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Max hourly rate (USD)</label>
                <input
                  type="number"
                  value={form.hourly_rate_max}
                  onChange={(e) => setForm({ ...form, hourly_rate_max: Number(e.target.value) })}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card id="extension">
          <CardHeader>
            <CardTitle>Browser Extension</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>The LeadFlow browser extension lets you capture leads directly from Upwork, LinkedIn, Contra, and any job board.</p>
            <p>Extension builds are in <code className="rounded bg-muted px-1 py-0.5 text-xs">packages/extension</code>. Load the unpacked extension from Chrome's extensions page during development.</p>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateProfile.isPending}>
            {updateProfile.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
