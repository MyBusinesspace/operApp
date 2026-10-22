import React, { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import TopNavBar from "./TopNavBar";
import QuickFinder from "./QuickFinder";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { pathToModule } from "@/lib/permissionMap";
import { Lock } from "lucide-react";

import { AgentPanelProvider, useAgentPanel } from "@/lib/AgentPanelContext";
import AgentPanel from "@/components/agents/AgentPanel";
import { getDepartmentForPath } from "@/lib/departments";
import "@/components/layout/departmentTheme.css";
import BackButton from "@/components/reports/BackButton";
import AttendanceBar from "./AttendanceBar";

// Pages under these sections get a consistent Back button (pages that already have their own are untouched).
// Every page except the home/overview/auth roots gets a Back button. A page that already renders its own
// back control (text "Back", or an arrow-left / chevron-left icon among its first links/buttons) keeps it and
// the global one stays hidden, so there is never a double Back.
const NO_BACK = /^\/($|dashboard$|login$|register$|resetpassword$|oauthconsent$|[^/]*overview$)/i;
function parentPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  const last = parts[parts.length - 1];
  if (last === "edit" || last === "new") parts.pop();
  if (parts.length > 2 || /^[a-f0-9]{16,}$/i.test(parts[parts.length - 1] || "")) parts.pop();
  else if (parts.length === 2) parts.pop();
  return "/" + parts.join("/");
}

export default function AppLayout() {
  const { pathname } = useLocation();
  const { can, loading } = usePermissionsMatrix();
  const isAccounting = pathname.startsWith("/accounting");
  const department = getDepartmentForPath(pathname);
  const module = pathToModule(pathname);
  const allowed = can(module, "can_view");

  const showBack = !NO_BACK.test(pathname);
  const content = loading ? (
    <div className="py-16 text-center text-sm text-muted-foreground">Checking access…</div>
  ) : allowed ? (
    <>
      {showBack && <GlobalBack pathname={pathname} />}
      <Outlet />
    </>
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
      <AgentPanelProvider>
        <div className="min-h-screen bg-background">
          <TopNavBar />
          <QuickFinder />
          <AgentLayoutContent isAccounting={isAccounting} content={content} department={department} />
        </div>
      </AgentPanelProvider>
  );
}

function AgentLayoutContent({ isAccounting, content, department }) {
  const { isOpen } = useAgentPanel();
  return (
    <div className="flex pt-[var(--nav-height)]">
      {isOpen && (
        <aside className="w-[30%] min-w-[280px] max-w-[480px] h-[calc(100vh-var(--nav-height))] shrink-0 sticky top-[var(--nav-height)]">
          <AgentPanel />
        </aside>
      )}
      <main className="department-content flex-1 min-w-0" data-department={department}>
          {isAccounting ? (
            <div className="h-[calc(100vh-var(--nav-height))] overflow-auto">
              <AttendanceBar className="sticky top-0 z-30" />
              {content}
            </div>
          ) : (
            <>
              <AttendanceBar className="sticky top-[var(--nav-height)] z-30" />
              <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {content}
              </div>
            </>
          )}
      </main>
    </div>
  );
}
function GlobalBack({ pathname }) {
  const wrapRef = useRef(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(false);
    const timer = setTimeout(() => {
      const wrap = wrapRef.current;
      const root = wrap && wrap.parentElement;
      if (!root) return;
      const own = [...root.querySelectorAll("a,button")]
        .filter((el) => !wrap.contains(el))
        .slice(0, 12)
        .some((el) => /^\s*(back\b|back to\b)/i.test(el.innerText || "") || !!el.querySelector("svg.lucide-arrow-left"));
      setShow(!own);
    }, 700);
    return () => clearTimeout(timer);
  }, [pathname]);
  return (
    <div ref={wrapRef} className="mb-2" style={show ? undefined : { display: "none" }}>
      <BackButton fallback={parentPath(pathname)} fallbackLabel="Back" />
    </div>
  );
}