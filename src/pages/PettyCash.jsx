import React, { useState, useEffect } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import BackToOverviewButton from "@/components/shared/BackToOverviewButton";
import { Input } from "@/components/ui/input";
import {
  Wallet, Search, X, Users, TrendingDown, TrendingUp,
  ChevronRight, Loader2, LayoutGrid, List
} from "lucide-react";
import EmployeeWalletModal from "@/components/pettycash/EmployeeWalletModal";
import PettyCashBankPanel from "@/components/pettycash/PettyCashBankPanel";
import { useTablePagination } from "@/hooks/useTablePagination";
import DataTablePagination from "@/components/shared/DataTablePagination";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";

function fmtAmount(n, currency = "AED") {
  if (!n && n !== 0) return `${currency} 0.00`;
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

function getInitials(name = "") {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

const COLORS = ["bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-indigo-500", "bg-teal-500", "bg-orange-500"];
function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function PettyCash() {
  const { user } = useAuth();
  const { employee: currentEmployee } = useCurrentEmployee();
  const { can } = usePermissionsMatrix();
  const canCreate = can("petty_cash", "can_create");
  const canEdit = can("petty_cash", "can_edit");
  const canDelete = can("petty_cash", "can_delete");
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = usePersistedSearch("petty_cash");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "table"
  const [rolePerms, setRolePerms] = useState([]);
  const [employeeRoles, setEmployeeRoles] = useState([]);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    // Admin access below does not depend on role mappings. Do not spend two
    // entity reads on every admin visit, or fetch before identity is known.
    setRolePerms([]);
    setEmployeeRoles([]);
    if (!user?.id || user.role === "admin") return;
    let cancelled = false;
    base44.entities.RolePermission.list("-created_date", 200).then(list => { if (!cancelled) setRolePerms(list); }).catch(() => { if (!cancelled) setRolePerms([]); });
    base44.entities.EmployeeRole.list("name", 100).then(list => { if (!cancelled) setEmployeeRoles(list); }).catch(() => { if (!cancelled) setEmployeeRoles([]); });
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  const mappedRole = employeeRoles.find(r => r.name === currentEmployee?.role)?.key || "";

  const canCreateOnBehalf = isAdmin || (!!rolePerms.find(p => p.role === mappedRole && p.module === "petty_cash")?.can_create && !!employeeRoles.find(r => r.key === mappedRole)?.can_view_all_petty_cash && employeeRoles.find(r => r.key === mappedRole)?.can_edit_all_petty_cash !== false);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    const errors = [];
    const [emps, ents] = await Promise.all([
      base44.entities.Employee.filter({ status: "Active" }, "full_name").catch((e) => { errors.push("employees: " + (e?.message || "failed")); return []; }),
      base44.entities.PettyCashEntry.list("-date", 5000).catch((e) => { errors.push("entries: " + (e?.message || "failed")); return []; })
    ]);
    setEmployees(emps);
    setEntries(ents);
    if (errors.length) setLoadError("Could not load all petty cash data (" + errors.join("; ") + "). Balances and employee wallets are unavailable until the data can be loaded.");
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openWallet = (emp) => {
    setSelectedEmployee(emp);
    setWalletOpen(true);
  };

  // Build per-employee stats
  const statsMap = {};
  entries.forEach(e => {
    if (!e.employee_id) return;
    if (!statsMap[e.employee_id]) statsMap[e.employee_id] = { expenses: 0, income: 0, count: 0, currency: e.currency || "AED" };
    if (e.type === "expense") statsMap[e.employee_id].expenses += e.amount || 0;
    else statsMap[e.employee_id].income += e.amount || 0;
    statsMap[e.employee_id].count++;
  });

  const filtered = employees.filter(emp => {
    const s = search.toLowerCase();
    return !search || emp.full_name?.toLowerCase().includes(s) || emp.department?.toLowerCase().includes(s) || emp.role?.toLowerCase().includes(s);
  });
  const pagination = useTablePagination(filtered);

  // Global totals
  const totalExpenses = entries.filter(e => e.type === "expense").reduce((s, e) => s + (e.amount || 0), 0);
  const totalIncome = entries.filter(e => e.type === "income").reduce((s, e) => s + (e.amount || 0), 0);
  const netBalance = totalIncome - totalExpenses;
  const currency = entries[0]?.currency || "AED";

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-6 pt-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BackToOverviewButton to="/purchasing-overview" />
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Petty Cash</h1>
              <p className="text-xs text-muted-foreground">App-recorded employee entries. Xero source history is separate.</p>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="rounded-xl bg-muted/40 border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Total Expenses</p>
            <p className="text-lg font-bold text-red-600 tabular-nums">{loading ? "Loading..." : loadError ? "Unavailable" : fmtAmount(totalExpenses, currency)}</p>
          </div>
          <div className="rounded-xl bg-muted/40 border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Total Income / Allocations</p>
            <p className="text-lg font-bold text-emerald-600 tabular-nums">{loading ? "Loading..." : loadError ? "Unavailable" : fmtAmount(totalIncome, currency)}</p>
          </div>
          <div className="rounded-xl bg-muted/40 border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Net Balance</p>
            <p className={`text-lg font-bold tabular-nums ${netBalance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {loading ? "Loading..." : loadError ? "Unavailable" : `${netBalance < 0 ? "- " : ""}${fmtAmount(Math.abs(netBalance), currency)}`}
            </p>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{loadError}</div>
      )}
      {!loading && !loadError && entries.length === 0 && (
        <div className="mx-6 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {(isAdmin || user?.can_read_finance || user?.can_write_finance)
            ? 'No employee wallet entries have been recorded in this screen yet. Petty cash imported from the bank (Xero) is shown below under "Petty cash accounts (bank movements)".'
            : 'No petty cash entries have been recorded for you yet.'}
        </div>
      )}
      {/* Search + view toggle */}
      <div className="bg-card border-b border-border px-6 py-3 flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search employees..." className="pl-9 bg-muted/40 border-muted"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* View toggle */}
        <div className="flex items-center border border-border rounded-lg overflow-hidden bg-muted/30">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`h-8 w-8 flex items-center justify-center transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            title="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`h-8 w-8 flex items-center justify-center transition-colors ${viewMode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            title="Table view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Employee list */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <p className="text-xs text-muted-foreground">Employee wallets could not be loaded. No balances or empty-list conclusions are available.</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Users className="w-12 h-12 opacity-20" />
            <p className="text-xs">{search ? "No employees match your search." : "No active employees found."}</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pagination.pageItems.map(emp => {
              const stats = statsMap[emp.id] || { expenses: 0, income: 0, count: 0, currency: "AED" };
              const balance = stats.income - stats.expenses;
              const initials = getInitials(emp.full_name);
              const bgColor = colorFor(emp.full_name);
              return (
                <button key={emp.id} type="button" onClick={() => openWallet(emp)}
                  className="text-left bg-card border border-border rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all group cursor-pointer">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {emp.avatar_url ? (
                        <img src={emp.avatar_url} alt={emp.full_name} className="w-11 h-11 rounded-full object-cover" />
                      ) : (
                        <div className={`w-11 h-11 rounded-full ${bgColor} flex items-center justify-center`}>
                          <span className="text-white text-xs font-bold">{initials}</span>
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-foreground text-xs leading-tight">{emp.full_name}</p>
                        <p className="text-xs text-muted-foreground">{emp.role}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground"><TrendingDown className="w-3 h-3 text-red-400" /> Expenses</span>
                      <span className="font-medium text-red-600 tabular-nums">{stats.expenses > 0 ? fmtAmount(stats.expenses, stats.currency) : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground"><TrendingUp className="w-3 h-3 text-emerald-400" /> Received</span>
                      <span className="font-medium text-emerald-600 tabular-nums">{stats.income > 0 ? fmtAmount(stats.income, stats.currency) : "—"}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{stats.count} entries</span>
                    <span className={`text-xs font-bold tabular-nums ${balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {balance < 0 ? "−" : "+"}{fmtAmount(Math.abs(balance), stats.currency || "AED")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* TABLE VIEW */
          <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expenses</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Received</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Balance</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entries</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map(emp => {
                  const stats = statsMap[emp.id] || { expenses: 0, income: 0, count: 0, currency: "AED" };
                  const balance = stats.income - stats.expenses;
                  const initials = getInitials(emp.full_name);
                  const bgColor = colorFor(emp.full_name);
                  return (
                    <tr key={emp.id}
                      className="border-b border-border hover:bg-primary/[0.06] cursor-pointer group transition-colors"
                      onClick={() => openWallet(emp)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {emp.avatar_url ? (
                            <img src={emp.avatar_url} alt={emp.full_name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className={`w-8 h-8 rounded-full ${bgColor} flex items-center justify-center flex-shrink-0`}>
                              <span className="text-white text-xs font-bold">{initials}</span>
                            </div>
                          )}
                          <span className="font-medium text-foreground">{emp.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{emp.role || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {stats.expenses > 0
                          ? <span className="text-xs font-semibold text-red-600 tabular-nums">{fmtAmount(stats.expenses, stats.currency)}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {stats.income > 0
                          ? <span className="text-xs font-semibold text-emerald-600 tabular-nums">{fmtAmount(stats.income, stats.currency)}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-bold tabular-nums ${balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {balance < 0 ? "−" : "+"}{fmtAmount(Math.abs(balance), stats.currency || "AED")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-muted-foreground">{stats.count}</span>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            </div>
            )}
            </div>

      <DataTablePagination pagination={pagination} />

      {(isAdmin || user?.can_read_finance || user?.can_write_finance) && <PettyCashBankPanel />}

      <EmployeeWalletModal
        open={walletOpen}
        onClose={(didChange) => {
          setWalletOpen(false);
          setSelectedEmployee(null);
          if (didChange) load();
        }}
        employee={selectedEmployee}
        onBehalfEmployees={employees}
        canCreateOnBehalf={canCreateOnBehalf}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </div>
  );
}