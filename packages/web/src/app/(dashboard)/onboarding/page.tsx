"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SkillsAutocomplete } from "@/components/ui/skills-autocomplete";
import { useSkills, useUpdateProfile } from "@/lib/queries";
import { CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const STEPS = [
  { id: 1, title: "Welcome", description: "Tell us about yourself" },
  { id: 2, title: "Skills", description: "What are your core competencies?" },
  { id: 3, title: "Rates", description: "Set your pricing preferences" },
  {
    id: 4,
    title: "Notifications",
    description: "Configure your briefing schedule",
  },
  { id: 5, title: "Ready!", description: "Your account is configured" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const updateProfile = useUpdateProfile();
  const { data: skillsList = [] } = useSkills();
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    first_name: "",
    last_name: "",
    core_skills: [] as string[],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hourly_rate_min: 75,
    hourly_rate_max: 150,
  });

  const set = (patch: Partial<typeof data>) =>
    setData((d) => ({ ...d, ...patch }));

  const handleComplete = async () => {
    await updateProfile.mutateAsync({
      first_name: data.first_name,
      last_name: data.last_name,
      core_skills: data.core_skills,
      timezone: data.timezone,
      hourly_rate: data.hourly_rate_min,
      min_budget: data.hourly_rate_min,
      max_budget: data.hourly_rate_max,
      onboarding_completed: true,
    });
    toast.success("Profile saved! Welcome to LeadFlow.");
    router.push("/leads");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((s) => (
            <div key={s.id} className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-colors ${s.id <= step ? "bg-primary" : "bg-muted"}`}
              />
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Step {step} of {STEPS.length}
              </span>
            </div>
            <CardTitle>{STEPS[step - 1].title}</CardTitle>
            <CardDescription>{STEPS[step - 1].description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">First name</label>
                    <input
                      value={data.first_name}
                      onChange={(e) => set({ first_name: e.target.value })}
                      placeholder="Jane"
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Last name</label>
                    <input
                      value={data.last_name}
                      onChange={(e) => set({ last_name: e.target.value })}
                      placeholder="Doe"
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Timezone</label>
                  <input
                    value={data.timezone}
                    onChange={(e) => set({ timezone: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-detected from your browser
                  </p>
                </div>
              </>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <SkillsAutocomplete
                  skills={skillsList}
                  value={data.core_skills}
                  onChange={(skills) => set({ core_skills: skills })}
                  placeholder="e.g. React, Python, Figma…"
                />
                <p className="text-xs text-muted-foreground">
                  Start typing to search 500+ skills. Press Enter to select the
                  top match, or add your own custom skill.
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Set your preferred hourly rate range. This helps score leads
                  by budget fit.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">
                      Min rate ($/hr)
                    </label>
                    <div className="flex items-center gap-1 rounded-md border px-3 py-2">
                      <span className="text-sm text-muted-foreground">$</span>
                      <input
                        type="number"
                        value={data.hourly_rate_min}
                        onChange={(e) =>
                          set({ hourly_rate_min: Number(e.target.value) })
                        }
                        className="w-full bg-transparent text-sm outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">
                      Max rate ($/hr)
                    </label>
                    <div className="flex items-center gap-1 rounded-md border px-3 py-2">
                      <span className="text-sm text-muted-foreground">$</span>
                      <input
                        type="number"
                        value={data.hourly_rate_max}
                        onChange={(e) =>
                          set({ hourly_rate_max: Number(e.target.value) })
                        }
                        className="w-full bg-transparent text-sm outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  You'll receive a daily briefing at 8 AM in your timezone with
                  your top-scored leads, insights, and suggested actions.
                </p>
                <p>
                  You can customise the schedule and delivery channel in
                  Settings after setup.
                </p>
                <div className="rounded-lg border bg-muted/40 p-3 text-foreground">
                  <strong>Autopilot mode</strong> — LeadFlow can automatically
                  approve outreach for leads scoring above your threshold. You
                  can enable this in Settings.
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <p className="font-medium">
                  You're all set, {data.first_name || "there"}!
                </p>
                <p className="text-sm text-muted-foreground">
                  LeadFlow will start scoring opportunities for you. Check back
                  in a few minutes.
                </p>
              </div>
            )}
          </CardContent>

          <div className="flex justify-between border-t p-4">
            {step > 1 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </Button>
            ) : (
              <div />
            )}

            {step < STEPS.length ? (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Continue
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleComplete}
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? "Saving…" : "Go to Dashboard"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
