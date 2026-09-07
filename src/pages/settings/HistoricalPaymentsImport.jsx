import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, History, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, ArrowLeft, Download } from "lucide-react";

// Simple CSV parser (handles quoted fields with commas)
function parseCSV(text) {
  const rows = [];
  let cur = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { cur.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (field || cur.length > 0) { cur.push(field); rows.push(cur); cur = []; field = ""; }
        if (ch === "\r" && text[i + 1] === "\n") i++;
      } else field += ch;
    }
  }
  if (field || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows;
}

const TYPE_MAP = {
  gratuity: "gratuity",
  leave_bonus: "leave_bonus",
  "leave bonus": "leave_bonus",
  "annual gratuity": "gratuity",
  "annual leave bonus": "leave_bonus",
  "gratuity": "gratuity",
  "leave": "leave_bonus",
};

const num = (v) => (parseFloat(v) || 0);

export default function HistoricalPaymentsImport() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const loadEmployees = async () => {
    const list = await base44.entities.Employee.list();
    setEmployees(Array.isArray(list) ? list : []);
  };

  React.useEffect(() => { loadEmployees(); }, []);

  const handleFile = async (file) => {
    setLoading(true);
    setResult(null);
    try {
      const text = await file.text();
      const data = parseCSV(text);
      if (data.length < 2) {
        setResult({ error: "CSV must have a header row and at least one data row." });
        setLoading(false);
        return;
      }
      const headers = data[0].map(h => h.trim().toLowerCase());
      const idx = {
        email: headers.findIndex(h => h.includes("email")),
        name: headers.findIndex(h => h.includes("name") || h.includes("employee")),
        year: headers.findIndex(h => h === "year"),
        type: headers.findIndex(h => h.includes("type")),
        amount: headers.findIndex(h => h.includes("amount")),
        date: headers.findIndex(h => h.includes("date")),
        notes: headers.findIndex(h => h.includes("note")),
      };

      if (idx.year < 0 || idx.type < 0 || idx.amount < 0) {
        setResult({ error: "CSV must include at least: year, type, amount columns. Also email or employee name." });
        setLoading(false);
        return;
      }

      await loadEmployees();
      const empByEmail = {};
      const empByName = {};
      for (const e of employees) {
        if (e.email) empByEmail[e.email.toLowerCase()] = e;
        if (e.full_name) empByName[e.full_name.toLowerCase()] = e;
      }

      const parsed = [];
      for (let r = 1; r < data.length; r++) {
        const row = data[r];
        const email = idx.email >= 0 ? (row[idx.email] || "").trim() : "";
        const name = idx.name >= 0 ? (row[idx.name] || "").trim() : "";
        const year = parseInt((row[idx.year] || "").trim());
        const rawType = (row[idx.type] || "").trim().toLowerCase();
        const type = TYPE_MAP[rawType] || rawType;
        const amount = num((row[idx.amount] || "").trim());
        const date = idx.date >= 0 ? (row[idx.date] || "").trim() : "";
        const notes = idx.notes >= 0 ? (row[idx.notes] || "").trim() : "";

        const emp = (email && empByEmail[email.toLowerCase()]) || (name && empByName[name.toLowerCase()]) || null;

        parsed.push({
          email, name, year, type, amount, date, notes,
          employee: emp,
          matched: !!emp,
        });
      }
      setRows(parsed);
    } catch (e) {
      console.error(e);
      setResult({ error: "Failed to parse CSV file." });
    }
    setLoading(false);
  };

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    let created = 0;
    let skipped = 0;
    let errors = 0;
    try {
      // Group by employee to batch-update profile flags
      const profileUpdates = {}; // employee_id -> { last_gratuity_year, last_annual_bonus_year }

      for (const r of rows) {
        if (!r.matched || !r.employee) { skipped++; continue; }
        if (!r.year || !r.type || r.amount <= 0) { errors++; continue; }
        try {
          await base44.entities.HistoricalPayment.create({
            employee_id: r.employee.id,
            employee_name: r.employee.full_name,
            payment_type: r.type,
            year: r.year,
            amount: r.amount,
            payment_date: r.date || null,
            notes: r.notes || `Historical import · ${r.year}`,
          });
          created++;
          if (!profileUpdates[r.employee.id]) profileUpdates[r.employee.id] = {};
          if (r.type === "gratuity") {
            profileUpdates[r.employee.id].last_gratuity_year = Math.max(profileUpdates[r.employee.id].last_gratuity_year || 0, r.year);
          } else {
            profileUpdates[r.employee.id].last_annual_bonus_year = Math.max(profileUpdates[r.employee.id].last_annual_bonus_year || 0, r.year);
          }
        } catch (e) {
          errors++;
        }
      }

      // Update profile flags
      for (const [empId, flags] of Object.entries(profileUpdates)) {
        const profiles = await base44.entities.EmployeePayrollProfile.filter({ employee_id: empId }, "-created_date", 1);
        if (profiles.length > 0) {
          const prof = profiles[0];
          const update = {};
          if (flags.last_gratuity_year && (!prof.last_gratuity_year || flags.last_gratuity_year > prof.last_gratuity_year)) {
            update.last_gratuity_year = flags.last_gratuity_year;
          }
          if (flags.last_annual_bonus_year && (!prof.last_annual_bonus_year || flags.last_annual_bonus_year > prof.last_annual_bonus_year)) {
            update.last_annual_bonus_year = flags.last_annual_bonus_year;
          }
          if (Object.keys(update).length > 0) {
            await base44.entities.EmployeePayrollProfile.update(prof.id, update).catch(() => {});
          }
        }
      }

      setResult({ created, skipped, errors });
      setRows([]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setResult({ error: "Import failed: " + e.message });
    }
    setImporting(false);
  };

  const matchedCount = rows.filter(r => r.matched).length;

  const downloadSample = () => {
    const csv = [
      "email,year,type,amount,date,notes",
      "kenneth@company.com,2024,gratuity,14000,2024-12-20,Annual gratuity 2024",
      "kenneth@company.com,2024,leave_bonus,5000,2024-07-15,Leave bonus 2024",
      "jane@company.com,2023,gratuity,12000,2023-12-18,Annual gratuity 2023",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historical_payments_sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/settings/hr" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to HR Settings
      </Link>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="w-6 h-6 text-primary" />
          Historical Payments Import
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bulk-import past gratuity and annual leave bonus payments (e.g. from before this system was in use) so each employee's history and "last paid year" status are accurate.
        </p>
      </div>

      {/* Instructions */}
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <FileSpreadsheet className="w-4 h-4" /> CSV Format
        </h3>
        <p className="text-xs text-muted-foreground mb-2">Required columns: <code className="bg-muted px-1 rounded">email</code> (or <code>employee</code>), <code>year</code>, <code>type</code>, <code>amount</code>. Optional: <code>date</code>, <code>notes</code>.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">email</th>
                <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">year</th>
                <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">type</th>
                <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">amount</th>
                <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">date</th>
                <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">notes</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-1.5 px-2">kenneth@company.com</td>
                <td className="py-1.5 px-2">2024</td>
                <td className="py-1.5 px-2">gratuity</td>
                <td className="py-1.5 px-2">14000</td>
                <td className="py-1.5 px-2">2024-12-20</td>
                <td className="py-1.5 px-2">Annual gratuity 2024</td>
              </tr>
              <tr>
                <td className="py-1.5 px-2">kenneth@company.com</td>
                <td className="py-1.5 px-2">2024</td>
                <td className="py-1.5 px-2">leave_bonus</td>
                <td className="py-1.5 px-2">5000</td>
                <td className="py-1.5 px-2">2024-07-15</td>
                <td className="py-1.5 px-2">Leave bonus 2024</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          <code className="bg-muted px-1 rounded">type</code> values: <code>gratuity</code> or <code>leave_bonus</code>. Employees are matched by email (preferred) or full name.
        </p>
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={downloadSample} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Download Sample CSV
          </Button>
        </div>
      </div>

      {/* Upload */}
      <div className="rounded-xl border border-border p-4">
        <Label className="text-sm font-semibold">Upload CSV File</Label>
        <div className="flex items-center gap-3 mt-2">
          <Input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
            className="max-w-xs"
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Preview */}
      {rows.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border">
            <p className="text-sm font-medium">
              Preview: {rows.length} rows · <span className="text-emerald-600">{matchedCount} matched</span> · <span className="text-amber-600">{rows.length - matchedCount} unmatched</span>
            </p>
            <Button onClick={handleImport} disabled={importing || matchedCount === 0} className="gap-1.5">
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {importing ? "Importing…" : `Import ${matchedCount} Records`}
            </Button>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Employee</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Year</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Type</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Match</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 px-3">
                      <p className="font-medium">{r.employee?.full_name || r.name || r.email}</p>
                      <p className="text-[11px] text-muted-foreground">{r.email || "—"}</p>
                    </td>
                    <td className="py-2 px-3">{r.year}</td>
                    <td className="py-2 px-3 capitalize">{r.type}</td>
                    <td className="py-2 px-3 text-right font-medium">{r.amount.toLocaleString("en-AE", { maximumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-muted-foreground">{r.date || "—"}</td>
                    <td className="py-2 px-3 text-center">
                      {r.matched ? (
                        <Badge className="bg-emerald-100 text-emerald-700 text-[10px] gap-1"><CheckCircle2 className="w-3 h-3" /> Matched</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-600 text-[10px] gap-1"><AlertCircle className="w-3 h-3" /> No match</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && !result.error && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Import complete</p>
            <p className="text-xs text-emerald-700">
              {result.created} payments created · {result.skipped} skipped (unmatched) · {result.errors} errors
            </p>
          </div>
        </div>
      )}
      {result?.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-sm text-red-700">{result.error}</p>
        </div>
      )}
    </div>
  );
}