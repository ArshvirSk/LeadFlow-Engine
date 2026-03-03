"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SkillsAutocomplete } from "@/components/ui/skills-autocomplete";
import { profileApi } from "@/lib/api";
import {
  useAddPortfolioPiece,
  useDeletePortfolioPiece,
  usePortfolio,
  useProfile,
  useSkills,
  useUpdateProfile,
} from "@/lib/queries";
import { useAuth } from "@clerk/nextjs";
import { ExternalLink, FileUp, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { getToken } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: skillsList = [] } = useSkills();
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const addPiece = useAddPortfolioPiece();
  const deletePiece = useDeletePortfolioPiece();
  const [pdfUploading, setPdfUploading] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are supported");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("PDF must be under 5 MB");
      return;
    }
    setPdfUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++)
        binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const token = await getToken();
      const { text } = await profileApi.uploadPortfolioPdf(base64, token ?? "");
      setNewPiece((prev) => ({ ...prev, description: text }));
      toast.success("PDF text extracted — review and edit the description");
    } catch {
      toast.error("Failed to extract PDF text");
    } finally {
      setPdfUploading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    headline: "",
    bio: "",
    timezone: "",
    hourly_rate_min: 0,
    hourly_rate_max: 0,
    core_skills: [] as string[],
  });

  const [newPiece, setNewPiece] = useState({
    title: "",
    description: "",
    url: "",
    outcomes: "",
  });
  const [showAddPiece, setShowAddPiece] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        first_name: profile.first_name ?? "",
        last_name: profile.last_name ?? "",
        headline: profile.headline ?? "",
        bio: profile.bio ?? "",
        timezone: profile.timezone ?? "",
        hourly_rate_min: profile.min_budget ? Number(profile.min_budget) : 0,
        hourly_rate_max: profile.max_budget ? Number(profile.max_budget) : 0,
        core_skills: profile.core_skills ?? [],
      });
    }
  }, [profile]);

  const handleSave = async () => {
    const { hourly_rate_min, hourly_rate_max, ...rest } = form;
    await updateProfile.mutateAsync({
      ...rest,
      min_budget: hourly_rate_min,
      max_budget: hourly_rate_max,
    });
    toast.success("Settings saved");
  };

  const handleAddPiece = async () => {
    if (!newPiece.title.trim()) {
      toast.error("Title is required");
      return;
    }
    await addPiece.mutateAsync({
      title: newPiece.title,
      description: newPiece.description,
      url: newPiece.url || undefined,
      outcomes: newPiece.outcomes || undefined,
    });
    setNewPiece({ title: "", description: "", url: "", outcomes: "" });
    setShowAddPiece(false);
    toast.success("Portfolio piece added — embedding generating…");
  };

  const handleDeletePiece = async (id: string) => {
    await deletePiece.mutateAsync(id);
    toast.success("Removed");
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">First name</label>
                <input
                  value={form.first_name}
                  onChange={(e) =>
                    setForm({ ...form, first_name: e.target.value })
                  }
                  placeholder="Jane"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Last name</label>
                <input
                  value={form.last_name}
                  onChange={(e) =>
                    setForm({ ...form, last_name: e.target.value })
                  }
                  placeholder="Doe"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
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
                <label className="text-sm font-medium">
                  Min hourly rate (USD)
                </label>
                <input
                  type="number"
                  value={form.hourly_rate_min}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      hourly_rate_min: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Max hourly rate (USD)
                </label>
                <input
                  type="number"
                  value={form.hourly_rate_max}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      hourly_rate_max: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Skills ── */}
        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <SkillsAutocomplete
              skills={skillsList}
              value={form.core_skills}
              onChange={(skills) => setForm({ ...form, core_skills: skills })}
              placeholder="e.g. React, Python, Figma…"
            />
            <p className="text-xs text-muted-foreground">
              These skills are used to score leads by fit and match portfolio
              pieces. Start typing to search 500+ skills or add your own.
            </p>
          </CardContent>
        </Card>

        {/* ── FR-03: Portfolio Pieces ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Portfolio Pieces</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddPiece(!showAddPiece)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Portfolio pieces are embedded and matched against incoming leads
              to suggest relevant work samples when generating outreach.
            </p>

            {/* Add new piece form */}
            {showAddPiece && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-medium">New Portfolio Piece</p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Title *
                  </label>
                  <input
                    value={newPiece.title}
                    onChange={(e) =>
                      setNewPiece({ ...newPiece, title: e.target.value })
                    }
                    placeholder="E.g. SaaS dashboard redesign for Acme"
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Description
                  </label>
                  <textarea
                    value={newPiece.description}
                    onChange={(e) =>
                      setNewPiece({ ...newPiece, description: e.target.value })
                    }
                    placeholder="Describe the project, tech used, what you built…"
                    rows={3}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                  {/* FR-03: PDF import */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={pdfUploading}
                      onClick={() => pdfInputRef.current?.click()}
                      className="flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/60 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {pdfUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileUp className="h-3.5 w-3.5" />
                      )}
                      {pdfUploading ? "Extracting…" : "Import from PDF"}
                    </button>
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept=".pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePdfUpload(file);
                      }}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Auto-fills description from PDF (max 5 MB)
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      URL (optional)
                    </label>
                    <input
                      value={newPiece.url}
                      onChange={(e) =>
                        setNewPiece({ ...newPiece, url: e.target.value })
                      }
                      placeholder="https://…"
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Key outcome (optional)
                    </label>
                    <input
                      value={newPiece.outcomes}
                      onChange={(e) =>
                        setNewPiece({ ...newPiece, outcomes: e.target.value })
                      }
                      placeholder="E.g. 40% faster load time"
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowAddPiece(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddPiece}
                    disabled={addPiece.isPending}
                  >
                    {addPiece.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Add piece
                  </Button>
                </div>
              </div>
            )}

            {/* Existing pieces */}
            {portfolioLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading portfolio…
              </div>
            ) : portfolio && portfolio.length > 0 ? (
              <div className="space-y-3">
                {portfolio.map((piece: any) => (
                  <div
                    key={piece.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{piece.title}</p>
                        <Badge
                          variant={
                            piece.embedding_status === "ready"
                              ? "default"
                              : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {piece.embedding_status}
                        </Badge>
                      </div>
                      {piece.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {piece.description}
                        </p>
                      )}
                      {piece.outcomes && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                          ✓ {piece.outcomes}
                        </p>
                      )}
                      {piece.url && (
                        <a
                          href={piece.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {piece.url}
                        </a>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeletePiece(piece.id)}
                      disabled={deletePiece.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                No portfolio pieces yet. Add some to improve lead matching.
              </p>
            )}
          </CardContent>
        </Card>

        <Card id="extension">
          <CardHeader>
            <CardTitle>Browser Extension</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              The LeadFlow browser extension lets you capture leads directly
              from Upwork, LinkedIn, Contra, and any job board.
            </p>
            <p>
              Extension builds are in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                packages/extension
              </code>
              . Load the unpacked extension from Chrome&apos;s extensions page
              during development.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateProfile.isPending}>
            {updateProfile.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
