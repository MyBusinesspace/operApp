import React from "react";
import { usePermission } from "@/hooks/usePermissions";
import { Lock } from "lucide-react";

/**
 * Matrix-driven UI gate. Renders children only if the current user has the
 * requested permission for the module; otherwise shows a neutral "restricted"
 * notice (or a custom fallback).
 *
 * @param {string} module   - Module key e.g. "payroll", "tasks"
 * @param {string} action   - Permission key e.g. "can_view", "can_edit" (default "can_view")
 * @param {React.ReactNode} fallback - Optional custom fallback
 */
export default function RequirePermission({ module, action = "can_view", fallback = null, children }) {
  const { allowed, loading } = usePermission(module, action);

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Checking access…</div>;
  }
  if (!allowed) {
    return fallback ?? (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <Lock className="w-5 h-5 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-semibold text-foreground">Access restricted</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          You don't have permission to view this section. Contact an administrator if you need access.
        </p>
      </div>
    );
  }
  return children;
}