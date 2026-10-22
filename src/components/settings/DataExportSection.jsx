import React, { useState } from "react";
import { motion } from "framer-motion";
import { Download, Loader2, Check, Database } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { todayLocalISO } from "@/lib/dateOnly";
import { ENTITIES } from "@/pages/settings/ImportCenter";

const BUILTIN_FIELDS = new Set(["id", "created_date", "updated_date", "created_by_id"]);

function recordsToCSV(records) {
  if (!records || records.length === 0) return "";
  const fieldSet = new Set();
  records.forEach(r => {
    Object.keys(r).forEach(k => {
      if (!BUILTIN_FIELDS.has(k)) fieldSet.add(k);
    });
  });
  const headers = Array.from(fieldSet);
  const escape = (val) => {
    if (val === null || val === undefined) return "";
    if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
    const s = String(val).replace(/"/g, '""');
    return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
  };
  const lines = [headers.join(",")];
  records.forEach(r => {
    lines.push(headers.map(h => escape(r[h])).join(","));
  });
  return lines.join("\n");
}

function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataExportSection() {
  const [exporting, setExporting] = useState(null);
  const [done, setDone] = useState(null);

  const handleExport = async (entity) => {
    setExporting(entity.key);
    setDone(null);
    try {
      let allRecords = [];
      let cursor = null;
      let hasMore = true;
      while (hasMore) {
        const page = await base44.entities[entity.key].filter({}, { sort: "-created_date", limit: 500, cursor });
        const items = page.items || page;
        allRecords = allRecords.concat(items);
        cursor = page.next_cursor;
        hasMore = page.has_more;
        if (!items || items.length === 0) break;
      }
      const csv = recordsToCSV(allRecords);
      downloadCSV(`${entity.key}_export_${todayLocalISO()}.csv`, csv);
      setDone({ entity, count: allRecords.length });
    } catch (err) {
      setDone({ entity, error: err.message });
    }
    setExporting(null);
  };

  return (
    <div className="mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
        <Database className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">Export your data</h2>
        <p className="text-xs text-muted-foreground mt-1">Download your data as CSV files — one file per entity</p>
      </motion.div>

      {done && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>
            {done.error
              ? `Export failed: ${done.error}`
              : `${done.count} ${done.entity.label} exported successfully.`}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ENTITIES.map((entity) => (
          <motion.button
            key={entity.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleExport(entity)}
            disabled={exporting !== null}
            className="p-5 rounded-xl border-2 border-border text-left transition-all duration-200 hover:border-primary/40 hover:bg-accent/50 disabled:opacity-50"
          >
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-lg ${entity.color} shrink-0`}>
                {exporting === entity.key ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <entity.icon className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{entity.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{entity.desc}</p>
              </div>
              <Download className="w-5 h-5 text-muted-foreground shrink-0" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}