import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Wallet, Search, X, Users, TrendingDown, TrendingUp,
  ChevronRight, Loader2, LayoutGrid, List
} from "lucide-react";
import EmployeeWalletModal from "@/components/pettycash/EmployeeWalletModal";
import { useTablePagination } from "@/hooks/useTablePagination";
import DataTablePagination from "@/components/shared/DataTablePagination";

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
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "table"
  const [rolePerms, setRolePerms] = useState([]);
  const [employeeRoles, setEmployeeRoles] = useState([]);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    base44.entities.RolePermission.list("-created_date", 200).then(list => setRolePerms(list)).catch(() => setRolePerms([]));
    base44.entities.EmployeeRole.list("name", 100).then(list => setEmployeeRoles(list)).catch(() => setEmployeeRoles([]));
  }, []);

  const mappedRole = employeeRoles.find(r => r.name === currentEmployee?.role)?.key || "";

  const canCreateOnBehalf = isAdmin || !!rolePerms.find(p => p.role === mappedRole && p.module === "petty_cash")?.can_create_on_behalf;

  const load = async () => {
    setLoading(true);
    const [emps, ents] = await Promise.all([
      base44.entities.Employee.filter({ status: "Active" }, "full_name").catch(() => []),
      base44.entities.PettyCashEntry.list("-date", 500).catch(() => [])
    ]);
    setEmployees(emps);
    setEntries(ents);
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
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-6 pt-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Petty Cash</h1>
              <p className="text-xs text-muted-foreground">Track employee expenses and cash allocations</p>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="rounded-xl bg-muted/40 border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Total Expenses</p>
            <p className="text-lg font-bold text-red-600 tabular-nums">{fmtAmount(totalExpenses, currency)}</p>
          </div>
          <div className="rounded-xl bg-muted/40 border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Total Income / Allocations</p>
            <p className="text-lg font-bold text-emerald-600 tabular-nums">{fmtAmount(totalIncome, currency)}</p>
          </div>
          <div className="rounded-xl bg-muted/40 border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Net Balance</p>
            <p className={`text-lg font-bold tabular-nums ${netBalance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {netBalance < 0 ? "- " : ""}{fmtAmount(Math.abs(netBalance), currency)}
            </p>
          </div>
        </div>
      </div>

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
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Users className="w-12 h-12 opacity-20" />
            <p className="text-sm">{search ? "No employees match your search." : "No active employees found."}</p>
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
                          <span className="text-white text-sm font-bold">{initials}</span>
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-foreground text-sm leading-tight">{emp.full_name}</p>
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
                    <span className={`text-sm font-bold tabular-nums ${balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
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
            <table className="w-full text-sm">
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
                      className="border-b border-border hover:bg-muted/20 cursor-pointer group transition-colors"
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
                      <td className="px-4 py-3 text-sm text-muted-foreground">{emp.role || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {stats.expenses > 0
                          ? <span className="text-sm font-semibold text-red-600 tabular-nums">{fmtAmount(stats.expenses, stats.currency)}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {stats.income > 0
                          ? <span className="text-sm font-semibold text-emerald-600 tabular-nums">{fmtAmount(stats.income, stats.currency)}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-bold tabular-nums ${balance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
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
        )}
      </div>

      <DataTablePagination pagination={pagination} />

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
      />
    </div>
  );
}