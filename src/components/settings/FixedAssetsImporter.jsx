import React, { useState, useRef, useMemo, useEffect } from "react";
import { readImportText, isExcelName, isCsvName, downloadCsvTemplate } from "@/lib/readImportFile";
import { motion } from "framer-motion";
import { ArrowLeft, Upload, Check, Loader2, AlertCircle, Box, RefreshCw, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { parseImportCsv as parseCSV, parseImportNumber } from "@/lib/importCsv";

const parseNum = (val) => {
  if (!val) return 0;
  const n = parseImportNumber(val);
  return isNaN(n) ? 0 : n;
};

export default function FixedAssetsImporter({ onBack, onReset }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [existingByName, setExistingByName] = useState({});
  const inputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.Asset.list("-created_date", 100000);
        const arr = Array.isArray(all) ? all : all.items || [];
        const byName = {};
        arr.forEach(a => {
          const nameKey = (a.name || "").replace(/\s+/g, " ").trim().toLowerCase();
          if (!nameKey) return;
          const cost = Number(a.purchase_price) || 0;
          // Assets with a stored cost are keyed by name||cost; assets without cost fall back to name-only
          const key = cost > 0 ? `${nameKey}||${cost}` : nameKey;
          (byName[key] = byName[key] || []).push(a);
        });
        setExistingByName(byName);
      } catch {}
    })();
  }, []);

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
      const hasName = parsed.headers.some(h => {
        const l = h.toLowerCase();
        return l === "name" || l === "assetname" || l === "asset";
      });
      if (!hasName) {
        setError("This doesn't look like a Depreciation Schedule export. Required: Name column.");
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

  const assetRows = useMemo(() => {
    if (!parseResult) return [];
    const { headers, rows } = parseResult;
    const nk = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const find = (...names) => headers.find(h => names.includes(nk(h)));
    const nameCol = find("name", "assetname", "asset");
    const groupCol = headers.find(h => /assetgroup/i.test(h)) || find("assettype", "category", "type");
    const costCol = find("cost", "purchaseprice", "purchasecost");
    const closingCol = headers.find(h => /^closingvalue_/i.test(h)) || find("bookvalue", "netbookvalue", "nbv", "closingvalue");
    const depreciationCol = find("depreciation", "periodepreciation", "ytddepreciation");
    const accumCol = find("accumulateddepreciation", "accumulated");
    const numberCol = find("assetnumber", "assetno", "number");
    const pdateCol = find("purchasedate", "dateofpurchase");
    const statusCol = find("status", "assetstatus", "accountingstatus");
    const methodCol = find("depreciationmethod", "method");
    const lifeCol = find("effectivelifeyears", "effectivelife", "usefullife", "usefullifeyears");
    const rateCol = find("rate", "depreciationrate", "ratepercent");
    const residualCol = find("residualvalue", "residual", "salvagevalue");
    const startCol = find("depreciationstartdate", "startdate");
    const closingDate = closingCol && /^closingvalue_/i.test(closingCol) ? closingCol.replace(/^ClosingValue_/i, "") : null;
    const toDate = (v) => {
      const x = String(v || "").trim();
      if (!x) return "";
      if (/^\d{4}-\d{2}-\d{2}/.test(x)) return x.slice(0, 10);
      const m = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/.exec(x);
      if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      const d = new Date(x + " UTC");
      return isNaN(d) ? "" : d.toISOString().slice(0, 10);
    };
    const mapStatus = (v) => {
      const x = String(v || "").trim().toLowerCase();
      if (/^reg/.test(x)) return "registered";
      if (/sold|dispos/.test(x)) return "sold_disposed";
      if (/^draft/.test(x)) return "draft";
      return "";
    };
    const mapMethod = (v) => {
      const x = String(v || "").toLowerCase();
      if (!x) return "";
      if (/^no\s*depr|^none/.test(x)) return "none";
      if (/declin|diminish/.test(x)) return "diminishing_value";
      if (/straight/.test(x)) return "straight_line";
      return "";
    };

    // First pass: parse all rows with their original index
    const parsed = rows.map((row, idx) => {
      const name = String(row[nameCol] || "").trim();
      if (!name || name.toLowerCase().includes("total") || name.toLowerCase().includes("totales")) return null;
      const cost = parseNum(row[costCol]);
      const hasClosing = closingCol && String(row[closingCol] || "").trim() !== "";
      const closing = hasClosing ? parseNum(row[closingCol]) : null;
      const category = String(row[groupCol] || "").replace(/^Asset type:\s*/i, "").trim();
      const periodDepreciation = parseNum(row[depreciationCol]);
      let accumulated = null;
      if (accumCol && String(row[accumCol] || "").trim() !== "") accumulated = parseNum(row[accumCol]);
      else if (closing !== null) accumulated = Math.round((cost - closing) * 100) / 100;
      const r = { idx, name, category, purchase_price: cost, period_depreciation: periodDepreciation, last_depreciation_date: closingDate };
      if (closing !== null) r.net_book_value = closing;
      if (accumulated !== null) r.accumulated_depreciation = accumulated;
      if (numberCol) r.number = String(row[numberCol] || "").trim();
      const pd = pdateCol ? toDate(row[pdateCol]) : ""; if (pd) r.purchase_date = pd;
      const st = statusCol ? mapStatus(row[statusCol]) : ""; if (st) r.accounting_status = st;
      const me = methodCol ? mapMethod(row[methodCol]) : ""; if (me) r.depreciation_method = me;
      const life = lifeCol ? parseNum(row[lifeCol]) : 0; if (life > 0) r.useful_life_years = life;
      const rate = rateCol ? parseNum(row[rateCol]) : 0; if (rate > 0) r.depreciation_rate = rate;
      if (residualCol && String(row[residualCol] || "").trim() !== "") r.residual_value = parseNum(row[residualCol]);
      const sd = startCol ? toDate(row[startCol]) : ""; if (sd) r.depreciation_start_date = sd;
      return r;
    }).filter(Boolean);

    // Track name occurrences to detect duplicates within the CSV
    const nameCount = {};
    const nameFirstIdx = {};
    parsed.forEach(r => {
      const key = r.name.toLowerCase();
      nameCount[key] = (nameCount[key] || 0) + 1;
      if (nameFirstIdx[key] === undefined) nameFirstIdx[key] = r.idx;
    });

    // Determine action: update only for first occurrence of a name that matches an existing asset
    // (each existing asset is claimed by at most one CSV row; the rest are created as new)
    const claimedExisting = new Set();
    return parsed.map(r => {
      const nameKey = r.name.replace(/\s+/g, " ").trim().toLowerCase();
      // Match by name + cost first, then by name among assets with no stored cost. Every existing
      // asset is claimed by at most one file row, so same-name twins never swap values.
      const costKey = `${nameKey}||${r.purchase_price}`;
      const pick = (list) => (list || []).find(x => !claimedExisting.has(x.id));
      const existing = pick(existingByName[costKey]) || pick(existingByName[nameKey]);
      let action = "create";
      let existingAsset = null;
      if (existing) {
        action = "update";
        existingAsset = existing;
        claimedExisting.add(existing.id);
      }
      const isDuplicateName = nameCount[nameKey] > 1;
      return { ...r, existing: existingAsset, action, isDuplicateName };
    });
  }, [parseResult, existingByName]);

  const newCount = useMemo(() => assetRows.filter(r => r.action === "create").length, [assetRows]);
  const updateCount = useMemo(() => assetRows.filter(r => r.action === "update").length, [assetRows]);
  const duplicateNameCount = useMemo(() => {
    const names = new Set(assetRows.filter(r => r.isDuplicateName).map(r => r.name.toLowerCase()));
    return names.size;
  }, [assetRows]);

  const handleImport = async (test = false) => {
    setImporting(true); setError(""); setResult(null);
    try {
      const toImport = test ? assetRows.slice(0, 20) : assetRows;
      let created = 0, updated = 0;
      const failed = [];
      for (let i = 0; i < toImport.length; i++) {
        const r = toImport[i];
        const accountingFields = {
          purchase_price: r.purchase_price,
          period_depreciation: r.period_depreciation,
        };
        ["accumulated_depreciation", "net_book_value", "purchase_date", "depreciation_method", "useful_life_years",
          "depreciation_rate", "residual_value", "depreciation_start_date", "accounting_status"].forEach(k => {
          if (r[k] !== undefined && r[k] !== null && r[k] !== "") accountingFields[k] = r[k];
        });
        if (r.last_depreciation_date) accountingFields.last_depreciation_date = r.last_depreciation_date;
        if (r.category) accountingFields.category = r.category;
        try {
          if (r.action === "update" && r.existing) {
            await base44.entities.Asset.update(r.existing.id, accountingFields);
            updated++;
          } else {
            await base44.entities.Asset.create({
              name: r.name,
              ...accountingFields,
              status: "Available",
              accounting_status: r.accounting_status || "draft",
              currency: "AED",
            });
            created++;
          }
        } catch (err) {
          failed.push(`${r.name}: ${err.message}`);
        }
        setProgress(Math.round(((i + 1) / toImport.length) * 100));
      }
      setResult({ created, updated, failed, total: toImport.length, testMode: test });
      try {
        await base44.entities.ImportRecord.create({
          entity_type: "Asset",
          imported_at: new Date().toISOString(),
          record_count: created + updated,
          created_count: created,
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
          <h2 className="text-xl font-bold text-foreground">{result.testMode ? "Fixed Assets Test Import Complete" : "Fixed Assets Import Complete"}</h2>
          <p className="text-muted-foreground mt-1">{result.created + result.updated} of {result.total} assets processed.</p>
          {result.created > 0 && <p className="text-xs text-blue-600 mt-1">{result.created} new assets created.</p>}
          {result.updated > 0 && <p className="text-xs text-emerald-600 mt-1">{result.updated} existing assets updated (accounting fields only).</p>}
          {result.testMode && (
            <p className="text-xs text-amber-600 mt-1 font-medium">Test mode: only the first 20 assets were processed. Click "Import More" to process all.</p>
          )}
          {result.failed.length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-destructive/10 text-destructive text-sm text-left max-h-40 overflow-y-auto">
              <p className="font-medium mb-1">{result.failed.length} assets had errors:</p>
              {result.failed.map((f, i) => <p key={i} className="text-xs opacity-80">{f}</p>)}
            </div>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <Button onClick={onReset} variant="outline" className="gap-1.5"><RefreshCw className="w-4 h-4" /> Import More</Button>
            <Link to="/accounting/fixed-assets"><Button className="gap-1.5">View Fixed Assets <ChevronRight className="w-4 h-4" /></Button></Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <Box className="w-10 h-10 mx-auto text-primary mb-3" />
          <h2 className="text-xl font-bold text-foreground">Upload Xero Depreciation Schedule</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Export from Xero: <span className="font-medium">Fixed Assets → Depreciation Schedule → Export to CSV</span>
          </p>
        </motion.div>
        <div className="flex items-start gap-2.5 mb-6 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
          <div>
            <p className="font-semibold mb-1">How it works</p>
            <p>The Depreciation Schedule CSV (AssetGroup(CostAccount), Name, Cost, OpeningValue, Purchases, Disposals, Depreciation, ClosingValue) maps category, purchase_price, net_book_value, accumulated_depreciation (Cost minus ClosingValue) and period depreciation. Optional extra columns (AssetNumber, PurchaseDate, Status = Draft/Registered/Disposed, DepreciationMethod, EffectiveLifeYears, Rate, ResidualValue, DepreciationStartDate, AccumulatedDepreciation, BookValue) also set purchase date, status and depreciation settings. Assets are deduped by name — existing assets only update accounting fields, operational data is never modified.</p>
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
          <button type="button" onClick={(e) => { e.stopPropagation(); downloadCsvTemplate("fixed_assets_template.csv", ["AssetNumber", "Name", "AssetType", "PurchaseDate", "Cost", "Status", "DepreciationMethod", "EffectiveLifeYears", "ResidualValue", "DepreciationStartDate", "AccumulatedDepreciation", "BookValue"], ["PU13", "Tower Crane TC-01", "Cranes", "2025-09-01", "220000", "Registered", "Declining balance", "6", "25000", "2025-09-01", "65000", "155000"]); }} className="mt-3 text-xs font-medium text-primary hover:underline">Download template (CSV)</button>
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
          {parsing ? (
            <div className="flex flex-col items-center gap-3"><Loader2 className="w-8 h-8 text-primary animate-spin" /><p className="text-sm text-muted-foreground">Parsing Depreciation Schedule...</p></div>
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
              <div><p className="font-medium text-foreground">Click to upload or drag & drop</p><p className="text-xs text-muted-foreground mt-0.5">Xero Depreciation Schedule CSV</p></div>
            </div>
          )}
        </div>
        {error && <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
        <div className="flex justify-start mt-6"><Button variant="outline" onClick={onBack} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button></div>
      </div>
    );
  }

  return (
    <div className="mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
        <Box className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">Preview Depreciation Schedule</h2>
        <p className="text-sm text-muted-foreground mt-1">{assetRows.length} assets found in <span className="font-medium">{file?.name}</span></p>
      </motion.div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-2xl font-bold text-primary tabular-nums">{assetRows.length}</p>
          <p className="text-xs text-muted-foreground">Total rows</p>
        </div>
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <p className="text-2xl font-bold text-emerald-600 tabular-nums">{updateCount}</p>
          <p className="text-xs text-muted-foreground">Update existing</p>
        </div>
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-2xl font-bold text-blue-600 tabular-nums">{newCount}</p>
          <p className="text-xs text-muted-foreground">Create new</p>
        </div>
      </div>

      {duplicateNameCount > 0 && (
        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <p>
            <span className="font-semibold">{duplicateNameCount} asset name{duplicateNameCount > 1 ? "s" : ""} appear multiple times</span> with different costs in this CSV. Each row is imported as a separate asset — no row overwrites another. Rows update existing assets matched by name and cost (each existing asset is used once); unmatched rows are created as new.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Category</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Cost</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Closing Value</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Accum. Dep.</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Period Dep.</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assetRows.slice(0, 15).map((r, i) => (
                <tr key={i} className={`hover:bg-muted/20 ${r.isDuplicateName ? "bg-amber-50/40" : ""}`}>
                  <td className="px-3 py-2 text-xs text-foreground max-w-[200px] truncate" title={r.name}>
                    {r.isDuplicateName && <span className="text-amber-500 mr-1" title="Duplicate name in CSV">⚠</span>}
                    {r.name}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[150px] truncate" title={r.category}>{r.category || "—"}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">{r.purchase_price.toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">{r.net_book_value.toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">{r.accumulated_depreciation.toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">{r.period_depreciation.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">
                    {r.action === "update"
                      ? <span className="text-[10px] text-emerald-600 font-medium">Update</span>
                      : <span className="text-[10px] text-blue-600 font-medium">Create</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {assetRows.length > 15 && <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground text-center border-t border-border">+ {assetRows.length - 15} more assets</div>}
      </div>

      {importing && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-muted-foreground">Importing assets...</span>
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
          <Button onClick={() => handleImport(true)} disabled={importing || assetRows.length === 0} variant="outline" className="gap-1.5"><Upload className="w-4 h-4" /> Test Import (20)</Button>
          <Button onClick={() => handleImport(false)} disabled={importing || assetRows.length === 0} className="gap-1.5 min-w-[200px]">
            {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <><Upload className="w-4 h-4" /> Import All {assetRows.length} Assets</>}
          </Button>
        </div>
      </div>

      {importing && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-card border border-border shadow-xl max-w-sm">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-semibold text-foreground">Importing assets...</p>
            <p className="text-xs text-muted-foreground text-center">Please don't navigate away until the import is complete.</p>
            <div className="w-48 h-2 rounded-full bg-muted overflow-hidden mt-1">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-medium text-foreground tabular-nums">{progress}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
