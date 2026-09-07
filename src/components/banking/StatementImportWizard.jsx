import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadCloud, FileText, CheckCircle2, ChevronLeft, ChevronRight, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

const ACCEPTED_EXTS = [".csv", ".ofx", ".qfx", ".qif", ".qbo"];
const STEPS = [
  { num: 1, label: "Upload" },
  { num: 2, label: "Import settings" },
  { num: 3, label: "Review" },
];

// CSV template content for download
const CSV_TEMPLATE = `Date,Description,Reference,Type,Amount
2026-06-01,Opening balance,,Receive Money,5000.00
2026-06-05,Payment to supplier INV-001,INV-001,Spend Money,1200.00
2026-06-10,Customer payment REF-987,REF-987,Receive Money,3500.00`;

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return obj;
  });
  return { headers, rows };
}

export default function StatementImportWizard({ open, bankAccount, onClose, onImported }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState({ headers: [], rows: [] });
  const [mapping, setMapping] = useState({ date: "", description: "", reference: "", type: "", amount: "" });
  const [defaultType, setDefaultType] = useState("Spend Money");
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef(null);

  const reset = () => {
    setStep(1);
    setFile(null);
    setParsedData({ headers: [], rows: [] });
    setMapping({ date: "", description: "", reference: "", type: "", amount: "" });
    setDefaultType("Spend Money");
    setImporting(false);
    setImportedCount(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (f) => {
    const ext = f.name.toLowerCase().match(/\.[a-z]+$/)?.[0];
    if (!ACCEPTED_EXTS.includes(ext)) {
      toast.error("File should end in OFX, QFX, QIF, QBO, or CSV");
      return;
    }
    setFile(f);
    if (ext === ".csv") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const { headers, rows } = parseCSV(e.target.result);
        setParsedData({ headers, rows });
        // Auto-detect mapping
        const lc = headers.map(h => h.toLowerCase());
        setMapping({
          date: headers.find((_, i) => lc[i].includes("date")) || "",
          description: headers.find((_, i) => lc[i].includes("desc") || lc[i].includes("particular")) || "",
          reference: headers.find((_, i) => lc[i].includes("ref")) || "",
          type: headers.find((_, i) => lc[i].includes("type") || lc[i].includes("dr") || lc[i].includes("cr")) || "",
          amount: headers.find((_, i) => lc[i].includes("amount") || lc[i].includes("value")) || "",
        });
      };
      reader.readAsText(f);
    } else {
      // Non-CSV formats: show placeholder for future parsing
      setParsedData({ headers: [], rows: [] });
      toast.info(`${ext.toUpperCase()} parsing will be available in a future update. Please use CSV for now.`);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bank_statement_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Build preview transactions from mapping
  const previewTx = parsedData.rows.slice(0, 10).map(row => {
    const amountStr = mapping.amount ? (row[mapping.amount] || "0").replace(/[^0-9.\-]/g, "") : "0";
    const amount = Math.abs(parseFloat(amountStr) || 0);
    let type = defaultType;
    if (mapping.type) {
      const t = (row[mapping.type] || "").toLowerCase();
      if (t.includes("rec") || t.includes("cr") || t.includes("credit")) type = "Receive Money";
      else if (t.includes("spend") || t.includes("dr") || t.includes("debit")) type = "Spend Money";
      else if (parseFloat(amountStr) < 0) type = "Spend Money";
      else type = "Receive Money";
    } else if (parseFloat(amountStr) < 0) {
      type = "Spend Money";
    }
    return {
      date: mapping.date ? (row[mapping.date] || "") : "",
      description: mapping.description ? (row[mapping.description] || "") : "",
      reference: mapping.reference ? (row[mapping.reference] || "") : "",
      type,
      amount,
    };
  }).filter(tx => tx.date && tx.amount > 0);

  const totalImport = parsedData.rows.filter(row => {
    const amountStr = mapping.amount ? (row[mapping.amount] || "0").replace(/[^0-9.\-]/g, "") : "0";
    return parseFloat(amountStr) && (mapping.date ? row[mapping.date] : false);
  }).length;

  const handleImport = async () => {
    setImporting(true);
    try {
      const records = parsedData.rows.map(row => {
        const amountStr = mapping.amount ? (row[mapping.amount] || "0").replace(/[^0-9.\-]/g, "") : "0";
        const amount = Math.abs(parseFloat(amountStr) || 0);
        let type = defaultType;
        if (mapping.type) {
          const t = (row[mapping.type] || "").toLowerCase();
          if (t.includes("rec") || t.includes("cr") || t.includes("credit")) type = "Receive Money";
          else if (t.includes("spend") || t.includes("dr") || t.includes("debit")) type = "Spend Money";
        } else if (parseFloat(amountStr) < 0) {
          type = "Spend Money";
        } else {
          type = "Receive Money";
        }
        return {
          bank_account_id: bankAccount.id,
          bank_account_name: bankAccount.name,
          date: row[mapping.date] || "",
          description: mapping.description ? (row[mapping.description] || "") : "",
          reference: mapping.reference ? (row[mapping.reference] || "") : "",
          type,
          amount,
          currency: bankAccount.currency || "AED",
          status: "Unreconciled",
          source_type: "Manual",
        };
      }).filter(r => r.date && r.amount > 0);

      if (records.length === 0) {
        toast.error("No valid transactions found. Check your column mapping.");
        setImporting(false);
        return;
      }

      const created = await base44.entities.BankTransaction.bulkCreate(records);
      setImportedCount(created.length);
      setStep(3);
      toast.success(`${created.length} transactions imported`);
      onImported();
    } catch (err) {
      toast.error("Failed to import transactions");
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  if (!bankAccount) return null;
  const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Bank Statement — {bankAccount.name}</DialogTitle>
          <DialogDescription>Upload your bank statement file to import transactions for reconciliation.</DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 py-4">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step > s.num ? "bg-primary text-primary-foreground" :
                  step === s.num ? "bg-primary text-primary-foreground ring-4 ring-primary/20" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                </div>
                <span className={`text-sm font-medium ${step === s.num ? "text-primary" : step > s.num ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 h-0.5 mx-2 ${step > s.num ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        {/* STEP 1: Upload */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Prepare file for upload</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Download bank statements from your online banking as an OFX (preferred), QFX, QIF, QBO, or CSV file.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Alternatively, create your own statement file with our CSV template.
              </p>
              <div className="flex gap-3 mt-2">
                <button onClick={downloadTemplate} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> Download CSV template
                </button>
              </div>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-border rounded-xl py-12 flex flex-col items-center justify-center gap-3 hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setFile(null); setParsedData({ headers: [], rows: [] }); }}
                    className="ml-2 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <UploadCloud className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Drag and drop file or select manually</p>
                  <Button variant="outline" size="sm">Select file</Button>
                </>
              )}
              <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTS.join(",")} className="hidden"
                onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f); }} />
            </div>
            <p className="text-xs text-muted-foreground text-center">File should end in OFX, QFX, QIF, QBO, or CSV</p>
          </div>
        )}

        {/* STEP 2: Import settings */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Import settings</h3>
              <p className="text-sm text-muted-foreground mt-1">Map the columns from your file to the matching fields.</p>
            </div>

            {parsedData.headers.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "date", label: "Date" },
                    { key: "amount", label: "Amount" },
                    { key: "description", label: "Description" },
                    { key: "reference", label: "Reference" },
                    { key: "type", label: "Transaction type (optional)" },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-1.5">
                      <Label>{label}</Label>
                      <Select value={mapping[key]} onValueChange={v => setMapping(p => ({ ...p, [key]: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select column…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={null}>— None —</SelectItem>
                          {parsedData.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <Label>Default transaction type</Label>
                  <Select value={defaultType} onValueChange={setDefaultType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Spend Money">Spend Money</SelectItem>
                      <SelectItem value="Receive Money">Receive Money</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Used when the file doesn't contain a type column or a row has no type.</p>
                </div>

                {/* Preview */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 bg-muted/50">Preview (first rows)</p>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0">
                        <tr className="bg-muted/60 border-b border-border">
                          <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Date</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Description</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Type</th>
                          <th className="px-3 py-2 text-right text-muted-foreground font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewTx.length === 0 ? (
                          <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No valid rows detected. Adjust your mapping.</td></tr>
                        ) : previewTx.map((tx, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{tx.date}</td>
                            <td className="px-3 py-2 text-foreground truncate max-w-[12rem]">{tx.description}</td>
                            <td className="px-3 py-2 text-muted-foreground">{tx.type}</td>
                            <td className="px-3 py-2 text-right text-foreground font-medium tabular-nums">{num(tx.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Column mapping is available for CSV files. For other formats, please convert to CSV and re-upload.
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Review */}
        {step === 3 && (
          <div className="space-y-4 text-center py-8">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Import complete</h3>
            <p className="text-sm text-muted-foreground">
              {importedCount} transactions have been imported to <span className="font-medium text-foreground">{bankAccount.name}</span> and are ready for reconciliation.
            </p>
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex justify-between pt-4 border-t border-border mt-4">
          {step === 1 ? (
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          ) : step === 3 ? (
            <Button variant="ghost" onClick={handleClose}>Close</Button>
          ) : (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}

          <div className="flex gap-2">
            {step === 1 && (
              <Button onClick={() => setStep(2)} disabled={!file || parsedData.rows.length === 0}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {step === 2 && (
              <Button onClick={handleImport} disabled={importing || previewTx.length === 0}>
                {importing ? "Importing…" : `Import ${totalImport} transactions`}
              </Button>
            )}
            {step === 3 && (
              <Button onClick={handleClose}>Done</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}