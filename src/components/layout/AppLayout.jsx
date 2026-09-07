import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import TopNavBar from "./TopNavBar";
import QuickFinder from "./QuickFinder";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { pathToModule } from "@/lib/permissionMap";
import { Lock } from "lucide-react";

export default function AppLayout() {
  const { pathname } = useLocation();
  const { can, loading } = usePermissionsMatrix();
  const isAccounting = pathname.startsWith("/accounting");
  const module = pathToModule(pathname);
  const allowed = can(module, "can_view");

  const content = loading ? (
    <div className="py-16 text-center text-sm text-muted-foreground">Checking access…</div>
  ) : allowed ? (
    <Outlet />
  ) : (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <Lock className="w-6 h-6 text-muted-foreground/60" />
      </div>
      <p className="text-base font-semibold text-foreground">Access restricted</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        You don't have permission to view this module. Contact an administrator if you need access.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <TopNavBar />
      <QuickFinder />
      <main className="pt-[var(--nav-height)]">
        {isAccounting ? (
          <div className="h-[calc(100vh-var(--nav-height))] overflow-auto">
            {content}
          </div>
        ) : (
          <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6">
            {content}
          </div>
        )}
      </main>
    </div>
  );
}