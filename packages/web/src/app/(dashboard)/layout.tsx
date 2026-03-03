"use client";

import { NLSearchModal } from "@/components/leads/NLSearchModal";
import { Sidebar } from "@/components/sidebar";
import { useProfile } from "@/lib/queries";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: profile, isSuccess } = useProfile();
  const [searchOpen, setSearchOpen] = useState(false);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (
      isSuccess &&
      profile &&
      !profile.onboarding_completed &&
      pathname !== "/onboarding"
    ) {
      router.replace("/onboarding");
    }
  }, [isSuccess, profile, pathname, router]);

  const isOnboarding = pathname === "/onboarding";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {!isOnboarding && <Sidebar />}
      <main className="flex-1 overflow-y-auto">{children}</main>
      <NLSearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
