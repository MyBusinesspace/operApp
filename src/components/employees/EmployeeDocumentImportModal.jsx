import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

// Bulk-import documents for employees: pick employee + document type, upload files,
// and create EmployeeDocument records for each file.

export default function EmployeeDocumentImportModal({ open, onClose, onSaved }) {
  const [employees, setEmployees] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [docTypeId, setDocTypeId] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] });
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      base44.entities.Employee.list("full_name", 500),
      base44.entities.EmployeeDocumentType.list("name", 100),
    ]).then(([emps, types]) => {
      setEmployees(emps || []);
      setDocTypes(types || []);
    });
    // reset state on open
    setEmployeeId("");
    setDocTypeId("");
    setFiles([]);
    setProgress({ done: 0, total: 0, errors: [] });
  }, [open]);

  const handleFiles = (fileList) => {
    setFiles(Array.from(fileList || []));
  };

  const handleUpload = async () => {
    if (!employeeId || !docTypeId || files.length === 0) return;
    setUploading(true);
    const emp = employees.find(e => e.id === employeeId);
    const dtype = docTypes.find(t => t.id === docTypeId);
    const errors = [];
    let done = 0;
    for (const file of files) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        await base44.entities.EmployeeDocument.create({
          employee_id: employeeId,
          employee_name: emp?.full_name || "",
          document_type_id: docTypeId,
          document_type_name: dtype?.name || "",
          file_url,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
        });
        done++;
        setProgress(prev => ({ ...prev, done }));
      } catch (e) {
        errors.push(`${file.name}: ${e.message || "upload failed"}`);
      }
    }
    setUploading(false);
    setProgress({ done, total: files.length, errors });
    if (done === files.length && errors.length === 0) {
      if (onSaved) onSaved();
      setTimeout(() => onClose(), 800);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!uploading) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Employee Documents</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Employee */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Employee</label>
            <Select value={employeeId} onValueChange={setEmployeeId} disabled={uploading}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Document Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Document Type</label>
            <Select value={docTypeId} onValueChange={setDocTypeId} disabled={uploading}>
              <SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger>
              <SelectContent>
                {docTypes.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* File picker */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Files</label>
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
            >
              <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {files.length > 0 ? `${files.length} file(s) selected` : "Click to select files"}
              </p>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
              />
            </div>
            {files.length > 0 && (
              <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
                    <FileText className="w-3 h-3 shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    {!uploading && (
                      <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Progress */}
          {progress.total > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                {progress.errors.length === 0 ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                )}
                <span className="text-muted-foreground">
                  {progress.done} / {progress.total} uploaded
                  {progress.errors.length > 0 && ` · ${progress.errors.length} failed`}
                </span>
              </div>
              {progress.errors.map((e, i) => (
                <p key={i} className="text-xs text-destructive">{e}</p>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || !employeeId || !docTypeId || files.length === 0}>
              {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</> : <><Upload className="w-4 h-4 mr-2" /> Import {files.length > 0 ? `(${files.length})` : ""}</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}