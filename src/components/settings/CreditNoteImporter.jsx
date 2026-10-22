import React, { useState, useRef, useMemo } from "react";
import { readImportText, isExcelName, isCsvName, downloadCsvTemplate } from "@/lib/readImportFile";
import { motion } from "framer-motion";
import { ArrowLeft, Upload, Check, Loader2, AlertCircle, RefreshCw, ChevronRight, FileMinus, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { XERO_CREDITNOTE_FIELD_MAP, NUMERIC_FIELDS } from "@/lib/importCenterConfig";
import { parseImportCsv as parseCSV, parseImportNumber, getXeroCreditReason } from "@/lib/importCsv";
import { saveXeroCreditNote } from "@/lib/xeroCreditImport";



const parseNum = (val) => {
  if (!val) return 0;
  const n = parseFloat(String(val).replace(/[,%]/g, ""));
  return isNaN(n) ? 0 : n;
};

const normalizeDate = (val) => {
  if (!val) return undefined;
  const s = String(val).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // d/m/yyyy or dd/mm/yyyy (accepts / - . separators, day first)
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) { return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return s;
};

const XERO_CN_STATUS_MAP = {
  "DRAFT": "Draft",
  "AUTHORISED": "Awaiting Application",
  "SUBMITTED": "Awaiting Approval",
  "PAID": "Applied",
  "VOIDED": "Cancelled",
  "DELETED": "Cancelled",
};

export default function CreditNoteImporter({ onBack, onReset }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [columnOverrides, setColumnOverrides] = useState({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const inputRef = useRef(null);

  const { headers, rows } = parseResult || { headers: [], rows: [] };

  // Xero uses human-readable document types in real CSV exports.
  const creditNoteRows = useMemo(() => {
    if (!parseResult) return [];
    const typeCol = headers.find(h => h.toLowerCase() === "type");
    if (!typeCol) return rows; // If no Type column, import all rows
    return rows.filter(r => Boolean(getXeroCreditReason(r[typeCol])));
  }, [parseResult, headers, rows]);

  const resolveField = (h) => {
    const o = columnOverrides[h];
    if (o === "__skip__") return null;
    if (o) return o;
    if (XERO_CREDITNOTE_FIELD_MAP[h] !== undefined) return XERO_CREDITNOTE_FIELD_MAP[h];
    return null;
  };

  const handleFile = async (f) => {
    setError("");
    if (!f) return;
    if (!isCsvName(f.name) && !isExcelName(f.name)) { setError("Please upload a CSV (.csv) or Excel (.xlsx) file"); return; }
    setFile(f); setParsing(true);
    try {
      const text = await readImportText(f);
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("The file appears to be empty or has no data rows.");
        setFile(null); setParsing(false); return;
      }
      setParseResult(parsed);
      setParsing(false);
      setStep(2);
    } catch {
      setError("Could not read the file. Make sure it's a valid CSV.");
      setFile(null); setParsing(false);
    }
  };

  // Group rows by credit note number
  const groupedNotes = useMemo(() => {
    if (!parseResult || creditNoteRows.length === 0) return [];
    const numCol = headers.find(h => h.toLowerCase() === "invoicenumber") || headers.find(h => resolveField(h) === "number");
    const contactCol = headers.find(h => resolveField(h) === "contact_name");
    const dateCol = headers.find(h => resolveField(h) === "issue_date");
    const refCol = headers.find(h => resolveField(h) === "reference");
    const totalCol = headers.find(h => resolveField(h) === "total");
    const groups = new Map();
    const ordered = [];
    for (const row of creditNoteRows) {
      const num = numCol ? String(row[numCol] || "").trim() : "";
      // Group by number + contact + date + total: same number with different dates are separate documents
      const key = num
        ? [
            num,
            contactCol ? String(row[contactCol] || "").trim().toLowerCase() : "",
            dateCol ? String(row[dateCol] || "").trim() : "",
            totalCol ? String(row[totalCol] || "").trim() : "",
          ].join("||")
        : [
            contactCol ? String(row[contactCol] || "").trim().toLowerCase() : "",
            dateCol ? String(row[dateCol] || "").trim() : "",
            refCol ? String(row[refCol] || "").trim().toLowerCase() : "",
            totalCol ? String(row[totalCol] || "").trim() : "",
          ].join("||");
      if (!groups.has(key)) { groups.set(key, []); ordered.push(key); }
      groups.get(key).push(row);
    }
    return ordered.map(key => ({ key, lines: groups.get(key) }));
  }, [parseResult, creditNoteRows, headers, columnOverrides]);

  const buildRecord = (group) => {
    const first = group.lines[0];
    const record = {};
    headers.forEach(h => {
      const val = first[h];
      if (columnOverrides[h] === "__skip__") return;
      const fieldName = columnOverrides[h] || (XERO_CREDITNOTE_FIELD_MAP[h] !== undefined ? XERO_CREDITNOTE_FIELD_MAP[h] : null);
      if (fieldName === null || fieldName === undefined) return;
      if (val === undefined || val === "") return;
      if (NUMERIC_FIELDS.includes(fieldName)) {
        record[fieldName] = parseImportNumber(val); return;
      }
      record[fieldName] = String(val);
    });
    const invoiceNumberHeader = headers.find(h => h.toLowerCase() === "invoicenumber");
    if (invoiceNumberHeader && first[invoiceNumberHeader]) record.number = String(first[invoiceNumberHeader]).trim();
    const typeColumn = headers.find(h => h.toLowerCase() === "type");
    record._cn_reason = getXeroCreditReason(first[typeColumn]);
    // Build line items from grouped lines
    record.line_items = group.lines.map(row => {
      const li = {};
      headers.forEach(h => {
        const f = resolveField(h);
        if (!f) return;
        const val = row[h];
        if (val === undefined || val === "") return;
        if (f === "_li_description") li.description = val;
        else if (f === "_li_account_code") li.account_code = val;
        else if (f === "_li_quantity") li.quantity = parseImportNumber(val);
        else if (f === "_li_unit_price") li.unit_price = parseImportNumber(val);
        else if (f === "_li_discount") li.discount = String(val);
        else if (f === "_li_tax_amount") li.tax_rate = parseImportNumber(val);
        else if (f === "_li_total") li.total = parseImportNumber(val);
      });
      return li;
    });
    // Clean up virtual fields
    ["_li_description", "_li_account_code", "_li_quantity", "_li_unit_price", "_li_discount", "_li_tax_rate", "_li_tax_amount", "_li_total"].forEach(k => delete record[k]);
    // Map status
    if (record.status) {
      const s = String(record.status).trim().toUpperCase();
      if (s === "VOIDED" || s === "DELETED") { record._skip = true; }
      else if (XERO_CN_STATUS_MAP[s]) record.status = XERO_CN_STATUS_MAP[s];
    }
    if (!record.status && !record._skip) record.status = "Draft";
    // Normalize date
    if (record.issue_date) record.issue_date = normalizeDate(record.issue_date);
    // Compute line item totals
    if (Array.isArray(record.line_items)) {
      for (const li of record.line_items) {
        const qty = Number(li.quantity) || 1;
        const price = Number(li.unit_price) || 0;
        const liTotal = Number(li.total) || 0;
        if (liTotal === 0 && price > 0) li.total = price * qty;
        else if (price === 0 && liTotal > 0 && qty > 0) li.unit_price = liTotal / qty;
      }
    }
    // Compute document totals from lines when Total/TaxTotal not provided
    if (!record.total && Array.isArray(record.line_items) && record.line_items.length) {
      record.subtotal = record.line_items.reduce((s, l) => s + (Number(l.total) || 0), 0);
      record.tax_amount = record.line_items.reduce((s, l) => s + (Number(l.tax_rate) || 0), 0);
      record.total = record.subtotal + record.tax_amount;
    }
    if (!record.subtotal && record.total) {
      record.subtotal = record.total - (record.tax_amount || 0);
    }
    return record;
  };

  const handleImport = async (test = false) => {
    setImporting(true); setError(""); setResult(null);
    try {
      // Resolve contacts and duplicate note numbers against the server before saving.
      let coaByCode = {};
      const accountCodes = [...new Set((test ? groupedNotes.slice(0, 20) : groupedNotes).flatMap(group => group.lines.map(row => {
        const header = headers.find(h => resolveField(h) === "_li_account_code");
        return String(row[header] || "").trim();
      })).filter(Boolean))];
      if (accountCodes.length) {
        const page = await base44.entities.ChartOfAccount.filter({ code: { $in: accountCodes } }, { limit: 1000 });
        page.items.forEach(account => { coaByCode[String(account.code).trim().toLowerCase()] = account; });
      }
      const notesToImport = test ? groupedNotes.slice(0, 20) : groupedNotes;
      let imported = 0, updated = 0, unchanged = 0, skipped = 0;
      const failed = [];
      const updatedChanges = [];

      for (let i = 0; i < notesToImport.length; i++) {
        const record = buildRecord(notesToImport[i]);
        if (record._skip) { skipped++; setProgress(Math.round(((i + 1) / notesToImport.length) * 100)); continue; }
        if (!record.contact_name || !record.contact_name.trim()) {
          failed.push(`Row ${i + 1}: Missing contact name`);
          setProgress(Math.round(((i + 1) / notesToImport.length) * 100)); continue;
        }
        // The shared saver resolves or creates ContactName before saving.
        // Resolve line item accounts
        if (record.line_items) {
          for (const li of record.line_items) {
            if (li.account_code) {
              const coa = coaByCode[String(li.account_code).trim().toLowerCase()];
              if (coa) { li.account_id = coa.id; li.account_name = coa.name; }
            }
          }
        }
        try {
          const saved = await saveXeroCreditNote(record);
          if (saved.action === "created") { imported++; }
          else if (saved.action === "updated") { imported++; updated++; if (updatedChanges.length < 10) updatedChanges.push({ number: record.number, contact: record.contact_name, changes: saved.changeList || [] }); }
          else { unchanged++; }
        } catch (err) {
          failed.push(`Row ${i + 1} (${record.number || "no number"}): ${err.message}`);
        }
        setProgress(Math.round(((i + 1) / notesToImport.length) * 100));
      }

      setResult({ imported, updated, unchanged, updatedChanges, skipped, failed, total: notesToImport.length, testMode: test, allRows: creditNoteRows.length });
      try {
        await base44.entities.ImportRecord.create({
          entity_type: "CreditNote",
          imported_at: new Date().toISOString(),
          record_count: imported,
          created_count: imported - updated,
          updated_count: updated,
          mode: "append",
          file_name: file?.name || "",
        });
      } catch {}
    } catch (err) {
      setError(err.message || "Import failed");
    }
    setImporting(false);
  };

  if (result) {
    return (
      <div className="mx-auto text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{result.testMode ? "Credit Note Test Import Complete" : "Credit Note Import Complete"}</h2>
          <p className="text-muted-foreground mt-1">{result.imported} of {result.total} credit notes imported successfully.</p>
          {result.testMode && (
            <p className="text-xs text-amber-600 mt-1 font-medium">Test mode: only the first 20 credit notes were imported. Click "Import More" to import all.</p>
          )}
          <p className="text-xs mt-1">
            <span className="text-emerald-600 font-medium">{result.imported - result.updated} new</span>
            {" / "}
            <span className="text-blue-600 font-medium">{result.updated} updated</span>
            {result.unchanged > 0 && (
              <>
                {" / "}
                <span className="text-muted-foreground font-medium">{result.unchanged} unchanged</span>
              </>
            )}
          </p>
          {result.updatedChanges?.length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200 text-left max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-blue-800 mb-2">Updated credit notes (first {result.updatedChanges.length}):</p>
              <ul className="space-y-1.5">
                {result.updatedChanges.map((c, i) => (
                  <li key={i} className="text-xs text-blue-700">
                    <span className="font-mono font-medium">{c.number || "(no number)"}</span>
                    {c.contact ? <span className="text-muted-foreground"> · {c.contact}</span> : null}
                    <span className="text-muted-foreground"> — </span>
                    <span className="text-blue-600">{(c.changes || []).map((ch) => `${ch.label}: ${String(ch.from ?? "—")} → ${String(ch.to ?? "—")}`).join(", ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.skipped > 0 && (
            <p className="text-xs text-orange-600 mt-1">{result.skipped} voided/deleted credit notes skipped.</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{result.allRows} credit note rows found in file (credit notes, overpayments and prepayments).</p>
          {result.failed.length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-destructive/10 text-destructive text-xs text-left max-h-40 overflow-y-auto">
              <p className="font-medium mb-1">{result.failed.length} errors:</p>
              {result.failed.map((f, i) => <p key={i} className="text-xs opacity-80">{f}</p>)}
            </div>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <Button onClick={onReset} variant="outline" className="gap-1.5"><RefreshCw className="w-4 h-4" /> Import More</Button>
            <Link to="/sales/credit-notes"><Button className="gap-1.5">View Credit Notes <ChevronRight className="w-4 h-4" /></Button></Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <FileMinus className="w-10 h-10 mx-auto text-primary mb-3" />
          <h2 className="text-xl font-bold text-foreground">Upload Xero Credit Notes</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Export from Xero: <span className="font-medium">Sales → Credit Notes → Export to CSV</span> (or include in the Invoices export)
          </p>
        </motion.div>
        <div className="flex items-start gap-2.5 mb-6 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
          <div>
            <p className="font-semibold mb-1">How it works</p>
            <p>This step imports Sales credit note, Bill credit note, Sales overpayment, Bill overpayment and Bill prepayment rows. Type must contain credit note, overpayment or prepayment. Rows are grouped by InvoiceNumber, which is kept as the credit note number. Voided/Deleted are skipped. ContactName is resolved or created, and existing credit notes are updated without duplicates.</p>
          </div>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
            dragOver ? "border-primary bg-primary/5" : file ? "border-emerald-300 bg-emerald-50/50" : "border-border hover:border-primary/40 hover:bg-accent/30"
          }`}
        >
          <button type="button" onClick={(e) => { e.stopPropagation(); downloadCsvTemplate("credit_notes_template.csv", ["Type", "InvoiceNumber", "Reference", "ContactName", "EmailAddress", "InvoiceDate", "DueDate", "Total", "TaxTotal", "Currency", "Status", "Description", "AccountCode", "Quantity", "UnitAmount", "TaxType", "TaxAmount", "LineAmount"], ["Sales Credit Note", "CN-0001", "", "Acme Corp", "info@acme.com", "2026-06-10", "2026-06-10", "525.00", "25.00", "AED", "AUTHORISED", "Discount", "430", "1", "500.00", "OUTPUT2", "25.00", "525.00"]); }} className="mt-3 text-xs font-medium text-primary hover:underline">Download template (CSV)</button>
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
          {parsing ? (
            <div className="flex flex-col items-center gap-3"><Loader2 className="w-8 h-8 text-primary animate-spin" /><p className="text-sm text-muted-foreground">Parsing credit notes...</p></div>
          ) : file ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="w-5 h-5 text-emerald-600" /></div>
              <p className="font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              <button onClick={(e) => { e.stopPropagation(); setFile(null); setParseResult(null); }} className="text-xs text-primary hover:underline mt-1">Remove & choose another</button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Upload className="w-5 h-5 text-primary" /></div>
              <div><p className="font-medium text-foreground">Click to upload or drag & drop</p><p className="text-xs text-muted-foreground mt-0.5">Xero Credit Notes CSV (can be mixed with invoices)</p></div>
            </div>
          )}
        </div>
        {error && <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
        <div className="flex justify-start mt-6"><Button variant="outline" onClick={onBack} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button></div>
      </div>
    );
  }

  // Step 2: Preview & Import
  const mappedCount = headers.filter(h => resolveField(h) !== null).length;
  const sampleRow = creditNoteRows[0] || {};

  return (
    <div className="mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
        <FileMinus className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">Preview Credit Notes</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {creditNoteRows.length} credit note rows found (credit notes, overpayments and prepayments) → {groupedNotes.length} credit notes in <span className="font-medium">{file?.name}</span>
        </p>
      </motion.div>

      {creditNoteRows.length === 0 && (
        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-orange-500" />
          <p>No credit note, overpayment or prepayment rows found. Include a Type column such as Sales credit note, Bill credit note, Sales overpayment, Bill overpayment or Bill prepayment.</p>
        </div>
      )}

      {/* Column mapping preview */}
      <div className="rounded-lg border border-border mb-4 overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/50 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Column Mapping</span>
          <span className="text-xs text-emerald-600 font-medium">{mappedCount} mapped</span>
          <span className="text-xs text-muted-foreground">{headers.length - mappedCount} skipped</span>
        </div>
        <div className="divide-y divide-border max-h-60 overflow-y-auto">
          {headers.map((h, i) => {
            const target = resolveField(h);
            const isMapped = target !== null;
            return (
              <div key={h} className={`grid grid-cols-[1fr_auto_1fr] gap-2 px-4 py-2 items-center ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                <p className="text-xs font-mono font-medium text-foreground truncate">{h}</p>
                <ArrowRight className={`w-4 h-4 ${isMapped ? "text-emerald-500" : "text-muted-foreground/40"}`} />
                <p className={`text-xs truncate ${isMapped ? "text-emerald-700 font-medium" : "text-muted-foreground"}`}>
                  {isMapped ? target : "— skipped —"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Data preview */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-10">#</th>
              {headers.map(h => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {creditNoteRows.slice(0, 10).map((row, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  {headers.map(h => <td key={h} className="px-3 py-2 text-xs text-foreground max-w-[200px] truncate">{row[h] ?? ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {creditNoteRows.length > 10 && <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground text-center border-t border-border">+ {creditNoteRows.length - 10} more rows</div>}
      </div>

      {importing && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Importing credit notes...</span>
            <span className="font-medium text-foreground">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
          </div>
        </div>
      )}

      {error && <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}

      <div className="flex gap-3 justify-between">
        <Button variant="outline" onClick={() => { setStep(1); setFile(null); setParseResult(null); }} disabled={importing} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <div className="flex gap-2">
          <Button onClick={() => handleImport(true)} disabled={importing || groupedNotes.length === 0} variant="outline" className="gap-1.5"><Upload className="w-4 h-4" /> Test Import (20)</Button>
          <Button onClick={() => handleImport(false)} disabled={importing || groupedNotes.length === 0} className="gap-1.5 min-w-[200px]">
            {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <><Upload className="w-4 h-4" /> Import All {groupedNotes.length} Credit Notes</>}
          </Button>
        </div>
      </div>
    </div>
  );
}