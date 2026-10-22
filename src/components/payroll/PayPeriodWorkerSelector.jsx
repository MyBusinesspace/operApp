import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Search, Check, ChevronDown, ChevronRight, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

// Worker selector for pay periods. Empty selection = all active employees.
export default function PayPeriodWorkerSelector({ selectedIds, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Load employees + payroll profiles on first expand
  const ensureLoaded = async () => {
    if (employees.length > 0) return;
    setLoading(true);
    try {
      const [empList, profList] = await Promise.all([
        base44.entities.Employee.list(),
        base44.entities.EmployeePayrollProfile.filter({ is_active: true }),
      ]);
      const profIds = new Set((Array.isArray(profList) ? profList : []).map(p => p.employee_id));
      // Only show employees that have an active payroll profile
      setEmployees((Array.isArray(empList) ? empList : []).filter(e => profIds.has(e.id)));
      setProfiles(Array.isArray(profList) ? profList : []);
    } catch (e) {
      toast({ title: "Error loading employees", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) ensureLoaded();
  };

  const allSelected = selectedIds.length === 0;
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return employees;
    return employees.filter(e =>
      (e.full_name || "").toLowerCase().includes(q) ||
      (e.role || "").toLowerCase().includes(q) ||
      (e.department || "").toLowerCase().includes(q)
    );
  }, [employees, search]);

  const toggleEmployee = (id) => {
    if (allSelected) {
      // Switching from "all" to specific — start with everyone selected except the toggled one
      const allIds = employees.map(e => e.id).filter(eid => eid !== id);
      onChange(allIds);
    } else {
      if (selectedIds.includes(id)) {
        const next = selectedIds.filter(x => x !== id);
        onChange(next); // empty = back to all
      } else {
        onChange([...selectedIds, id]);
      }
    }
  };

  const selectAll = () => onChange([]);

  return (
    <div className="space-y-1.5">
      <button type="button" onClick={toggle}
        className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        <span className="flex items-center gap-1.5">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Workers
        </span>
        <span className="text-[11px] font-normal">
          {allSelected ? "All employees" : `${selectedIds.length} selected`}
        </span>
      </button>

      {expanded && (
        <div className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search workers…"
                className="h-7 pl-7 text-xs" />
            </div>
            <button type="button" onClick={selectAll}
              className={`text-[11px] px-2 py-1 rounded shrink-0 transition-colors ${allSelected ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}>
              All
            </button>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-3">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No employees with active payroll profiles.</p>
          ) : (
            <div className="max-h-44 overflow-auto space-y-0.5">
              {filtered.map(e => {
                const checked = allSelected || selectedIds.includes(e.id);
                return (
                  <button key={e.id} type="button" onClick={() => toggleEmployee(e.id)}
                    className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/50 transition-colors text-left">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary" : "border-border"}`}>
                      {checked && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{e.full_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{[e.role, e.department].filter(Boolean).join(" · ")}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 pt-0.5">
            <Users className="w-2.5 h-2.5" />
            Empty selection includes all active employees automatically.
          </p>
        </div>
      )}
    </div>
  );
}