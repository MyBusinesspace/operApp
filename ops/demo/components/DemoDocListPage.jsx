import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BackToOverviewButton from "@/components/shared/BackToOverviewButton";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import DemoTopNavBar from "./DemoTopNavBar.jsx";
import DemoGuideCard from "./DemoGuideCard.jsx";
import "../demo.css";

const DEFAULT_STATUS = {
  Draft: "bg-zinc-500/10 text-zinc-400",
  Sent: "bg-sky-500/10 text-sky-400",
  Approved: "bg-indigo-500/10 text-indigo-400",
  Accepted: "bg-emerald-500/10 text-emerald-400",
  Invoiced: "bg-violet-500/10 text-violet-400",
  Billed: "bg-violet-500/10 text-violet-400",
  "Awaiting Payment": "bg-amber-500/10 text-amber-400",
  Paid: "bg-emerald-500/10 text-emerald-400",
  Pending: "bg-amber-500/10 text-amber-400",
  Active: "bg-emerald-500/10 text-emerald-400",
  Archived: "bg-zinc-500/10 text-zinc-500",
  Expense: "bg-rose-500/10 text-rose-400",
  "Top-up": "bg-sky-500/10 text-sky-400",
};

function money(n) {
  return `AED ${(Number(n) || 0).toLocaleString("en-AE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Generic demo document / catalog list.
 * columns: [{ key, label, render?(row) }]
 * onCreate / onRowClick open demo forms (optional).
 * children(data) can render dialogs with fixture context.
 */
export default function DemoDocListPage({
  title,
  subtitle,
  icon: Icon,
  overviewTo,
  rowsKey,
  getRows,
  columns,
  searchKeys = [],
  statusKey = "status",
  statusStyles = DEFAULT_STATUS,
  createLabel = "New",
  guidePageId,
  onCreate,
  onRowClick,
  children,
}) {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );
  const [search, setSearch] = useState("");

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const rows = getRows ? getRows(data) : data[rowsKey] || [];
  const q = search.trim().toLowerCase();
  const filtered = !q
    ? rows
    : rows.filter((row) =>
        searchKeys.some((k) =>
          String(row[k] ?? "")
            .toLowerCase()
            .includes(q)
        )
      );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DemoTopNavBar companyName={data.companyName} />
      <main className="pt-[var(--nav-height)]">
        <div className="demo-readonly max-w-[1400px] mx-auto px-6 py-8 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-start justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <BackToOverviewButton to={overviewTo} />
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                  {Icon && <Icon className="w-6 h-6 text-primary" />}
                  {title}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {subtitle || "Interactive demo — try the create forms."}
                </p>
              </div>
            </div>
            <Button
              className="gap-2 shadow-sm"
              type="button"
              onClick={() => onCreate?.(data)}
            >
              <Plus className="w-4 h-4" /> {createLabel}
            </Button>
          </motion.div>

          {guidePageId && <DemoGuideCard pageId={guidePageId} />}

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="pl-9"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {filtered.length} of {rows.length}
            </span>
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card/40">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={row.id || row.number || row.code || row.name}
                      className={`border-b border-border/60 hover:bg-accent/40 transition-colors ${
                        onRowClick ? "cursor-pointer" : ""
                      }`}
                      onClick={() => onRowClick?.(row, data)}
                    >
                      {columns.map((col) => (
                        <td key={col.key} className="px-4 py-3 align-middle">
                          {col.render
                            ? col.render(row, { money, statusStyles, statusKey })
                            : col.key === statusKey
                              ? (
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                      statusStyles[row[statusKey]] ||
                                      "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {row[statusKey] || "—"}
                                  </span>
                                )
                              : col.money
                                ? money(row[col.key])
                                : row[col.key] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        No records match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
      {typeof children === "function" ? children(data) : children}
    </div>
  );
}
