"use client";

import { Sidebar } from "@/components/sidebar";
import { useProfile } from "@/lib/queries";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: profile, isSuccess } = useProfile();

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
    </div>
  );
}
