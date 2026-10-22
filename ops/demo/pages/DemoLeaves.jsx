import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Search,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BackToOverviewButton from "@/components/shared/BackToOverviewButton";
import ColumnToggle from "@/components/shared/ColumnToggle";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import DemoLeaveDialog from "../components/DemoLeaveDialog.jsx";
import "../demo.css";

const STATUS_MAP = {
  pending: {
    label: "Pending",
    color: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30",
    icon: CheckCircle,
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
    icon: XCircle,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/15 dark:text-slate-400 dark:border-slate-500/30",
    icon: AlertCircle,
  },
};

const TYPE_LABELS = {
  vacation: "Vacation",
  sick: "Sick Leave",
  other: "Other",
  unjustified: "Unjustified Absence",
};

const TYPE_COLORS = {
  vacation: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  sick: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  other: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
  unjustified: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

const COLUMN_DEFS = [
  { key: "employee", label: "Employee", required: true },
  { key: "type", label: "Type", required: false },
  { key: "status", label: "Status", required: false },
  { key: "dates", label: "Dates", required: false },
  { key: "reason", label: "Reason", required: false },
  { key: "submitter", label: "Submitter", required: false },
  { key: "approver", label: "Approver", required: false },
];

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

function fmtDate(d) {
  if (!d) return "—";
  try {
    return format(typeof d === "string" ? parseISO(d) : d, "dd MMM yyyy");
  } catch {
    return d;
  }
}

function normalizeType(t) {
  const s = (t || "").toLowerCase();
  if (s === "annual" || s === "vacation") return "vacation";
  if (s === "sick") return "sick";
  if (s === "unjustified") return "unjustified";
  if (["vacation", "sick", "other", "unjustified"].includes(s)) return s;
  return "other";
}

export default function DemoLeaves() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  const employees = data?.employees || [];
  const rawRequests = data?.leaveRequests || [];

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [dateFilterMode, setDateFilterMode] = useState("all");
  const [filterMonth, setFilterMonth] = useState("");
  const [visibleCols, setVisibleCols] = useState({
    employee: true,
    type: true,
    status: true,
    dates: true,
    reason: true,
    submitter: true,
    approver: true,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [approveModal, setApproveModal] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [rejectOption, setRejectOption] = useState("vacation");

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const requests = rawRequests.map((r) => ({
    ...r,
    leave_type: normalizeType(r.leave_type),
  }));

  const toggleCol = (key) => {
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const tabCounts = {
    all: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
    cancelled: requests.filter((r) => r.status === "cancelled").length,
  };

  const filtered = requests.filter((r) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      (r.employee_name || "").toLowerCase().includes(s) ||
      (r.reason || "").toLowerCase().includes(s) ||
      (r.submitted_by_name || "").toLowerCase().includes(s);
    const matchTab = tab === "all" || r.status === tab;
    const matchType = filterType === "all" || r.leave_type === filterType;
    let matchDate = true;
    if (dateFilterMode === "month" && filterMonth) {
      const start = r.start_date || "";
      matchDate = start.startsWith(filterMonth);
    }
    return matchSearch && matchTab && matchType && matchDate;
  });

  const pendingCount = tabCounts.pending;
  const approvedVacationDays = requests
    .filter((r) => r.status === "approved" && r.leave_type === "vacation")
    .reduce((s, r) => s + (r.total_days || 0), 0);
  const sickDays = requests
    .filter((r) => r.status === "approved" && r.leave_type === "sick")
    .reduce((s, r) => s + (r.total_days || 0), 0);
  const entitlement = 30;
  const remaining = Math.max(0, entitlement - approvedVacationDays);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (req) => {
    setEditing(req);
    setFormOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DemoTopNavBar companyName={data.companyName} />

      <main className="pt-[var(--nav-height)]">
        <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-start justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <BackToOverviewButton to="/demo/app/hr-overview" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                  <UserCheck className="w-6 h-6 text-primary" /> Leave
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Leave requests & approvals — view only in this demo.
                </p>
              </div>
            </div>
            <Button className="gap-2 shadow-sm" onClick={openNew}>
              <Plus className="w-4 h-4" /> New Request
            </Button>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              {
                label: "Entitlement",
                value: `${entitlement}d`,
                icon: Calendar,
                tone: "text-indigo-400",
              },
              {
                label: "Days Taken",
                value: `${approvedVacationDays}d`,
                icon: CheckCircle,
                tone: "text-emerald-400",
              },
              {
                label: "Remaining",
                value: `${remaining}d`,
                icon: Clock,
                tone: "text-sky-400",
              },
              {
                label: "Sick Days",
                value: `${sickDays}d`,
                icon: AlertCircle,
                tone: "text-orange-400",
              },
              {
                label: "Pending",
                value: pendingCount,
                icon: Clock,
                tone: "text-amber-400",
              },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-border bg-card p-3.5"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <m.icon className={`w-3.5 h-3.5 ${m.tone}`} />
                  {m.label}
                </div>
                <p className="text-xl font-bold tabular-nums text-foreground">
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 border-b border-border pb-px">
            {STATUS_TABS.filter(
              (t) => t.id === "all" || tabCounts[t.id] > 0 || tab === t.id
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                <span className="ml-1.5 text-xs tabular-nums opacity-70">
                  {tabCounts[t.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Search employee, reason…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="vacation">Vacation</SelectItem>
                <SelectItem value="sick">Sick Leave</SelectItem>
                <SelectItem value="other">Other</SelectItem>
                <SelectItem value="unjustified">Unjustified</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={dateFilterMode}
              onValueChange={(v) => {
                setDateFilterMode(v);
                if (v === "month" && !filterMonth) {
                  const d = new Date();
                  setFilterMonth(
                    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
                  );
                }
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                <SelectItem value="month">By month</SelectItem>
              </SelectContent>
            </Select>
            {dateFilterMode === "month" && (
              <Input
                type="month"
                className="w-40"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
              />
            )}
            <ColumnToggle
              columns={COLUMN_DEFS}
              visible={visibleCols}
              onToggle={toggleCol}
            />
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {visibleCols.employee && (
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                        Employee
                      </th>
                    )}
                    {visibleCols.type && (
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                        Type
                      </th>
                    )}
                    {visibleCols.status && (
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                        Status
                      </th>
                    )}
                    {visibleCols.dates && (
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                        Dates
                      </th>
                    )}
                    {visibleCols.reason && (
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                        Reason / Docs
                      </th>
                    )}
                    {visibleCols.submitter && (
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                        Submitter
                      </th>
                    )}
                    {visibleCols.approver && (
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                        Approver
                      </th>
                    )}
                    <th className="px-4 py-3 w-36" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-12 text-center text-muted-foreground"
                      >
                        No leave requests found
                      </td>
                    </tr>
                  ) : (
                    filtered.map((req) => {
                      const st = STATUS_MAP[req.status] || STATUS_MAP.pending;
                      const StIcon = st.icon;
                      const typ = normalizeType(req.leave_type);
                      return (
                        <tr
                          key={req.id}
                          className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                          onClick={() => openEdit(req)}
                        >
                          {visibleCols.employee && (
                            <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                              {req.employee_name || "—"}
                            </td>
                          )}
                          {visibleCols.type && (
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${
                                  TYPE_COLORS[typ] || TYPE_COLORS.other
                                }`}
                              >
                                {TYPE_LABELS[typ] || typ}
                              </span>
                            </td>
                          )}
                          {visibleCols.status && (
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={`gap-1 font-medium ${st.color}`}
                              >
                                <StIcon className="w-3 h-3" />
                                {st.label}
                              </Badge>
                            </td>
                          )}
                          {visibleCols.dates && (
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                              <div>
                                {fmtDate(req.start_date)} → {fmtDate(req.end_date)}
                              </div>
                              <div className="font-mono text-foreground/80">
                                {req.total_days || 0}d
                              </div>
                            </td>
                          )}
                          {visibleCols.reason && (
                            <td className="px-4 py-3 max-w-[200px]">
                              <p className="text-xs text-muted-foreground truncate">
                                {req.reason || "—"}
                              </p>
                              {(req.documents || []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {(req.documents || []).slice(0, 2).map((d, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                    >
                                      <Paperclip className="w-2.5 h-2.5" />
                                      {d.title || d.file_name}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {req.admin_notes && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate mt-0.5 flex items-center gap-1">
                                  <MessageSquare className="w-2.5 h-2.5" />
                                  {req.admin_notes}
                                </p>
                              )}
                            </td>
                          )}
                          {visibleCols.submitter && (
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {req.submitted_by_name || "—"}
                            </td>
                          )}
                          {visibleCols.approver && (
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {req.approved_by_name || "—"}
                              {req.approved_at && (
                                <div className="text-[10px] opacity-70">
                                  {fmtDate(req.approved_at)}
                                </div>
                              )}
                            </td>
                          )}
                          <td
                            className="px-3 py-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-0.5">
                              {req.status === "pending" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                                    title="Demo — view only"
                                    onClick={() => {
                                      setAdminNotes("");
                                      setApproveModal({
                                        req,
                                        action: "approved",
                                      });
                                    }}
                                  >
                                    <ThumbsUp className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10"
                                    title="Demo — view only"
                                    onClick={() => {
                                      setAdminNotes("");
                                      setRejectOption("vacation");
                                      setApproveModal({
                                        req,
                                        action: "rejected",
                                      });
                                    }}
                                  >
                                    <ThumbsDown className="w-3.5 h-3.5" />
                                  </Button>
                                </>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => openEdit(req)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground"
                                title="Demo — view only"
                                onClick={(e) => e.preventDefault()}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DemoLeaveDialog
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          request={editing}
          employees={employees}
        />

        <Dialog
          open={!!approveModal}
          onOpenChange={(v) => {
            if (!v) setApproveModal(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {approveModal?.action === "approved"
                  ? "Approve leave"
                  : "Reject leave"}
              </DialogTitle>
              <DialogDescription>
                {approveModal?.req?.employee_name} —{" "}
                {TYPE_LABELS[normalizeType(approveModal?.req?.leave_type)] ||
                  "Leave"}{" "}
                ({approveModal?.req?.total_days || 0} days)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div className="space-y-1.5">
                <Label>Admin notes</Label>
                <Textarea
                  rows={2}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Optional notes…"
                />
              </div>
              {approveModal?.action === "rejected" && (
                <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground">
                    Deduction option (demo)
                  </p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="rejectOpt"
                      checked={rejectOption === "vacation"}
                      onChange={() => setRejectOption("vacation")}
                    />
                    Deduct vacation days
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="rejectOpt"
                      checked={rejectOption === "salary"}
                      onChange={() => setRejectOption("salary")}
                    />
                    Deduct from salary
                  </label>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveModal(null)}>
                Cancel
              </Button>
              <Button
                title="Demo — view only"
                className={
                  approveModal?.action === "approved"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : ""
                }
                variant={
                  approveModal?.action === "rejected" ? "destructive" : "default"
                }
                onClick={() => setApproveModal(null)}
              >
                {approveModal?.action === "approved" ? "Approve" : "Reject"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DemoGuideCard pageId="leave" />
      </main>
    </div>
  );
}
