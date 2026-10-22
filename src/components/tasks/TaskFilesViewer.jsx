import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { formatDateValue } from "@/lib/dateOnly";
import { X, Loader2, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import SignedImage from "@/components/shared/SignedImage";
import FilePreviewModal from "@/components/shared/FilePreviewModal";

function fmtDate(d) {
  if (!d) return "";
  return formatDateValue(d);
}

export default function TaskFilesViewer({ task, onClose }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!task?.id) { setFiles([]); return; }
    let active = true;
    setLoading(true);
    base44.entities.TimeEntry.filter({ task_id: task.id }, "-clock_in_time")
      .then(entries => {
        if (!active) return;
        const collected = [];
        (entries || []).forEach((e, idx) => {
          if (e.clock_in_photo_url) {
            collected.push({
              id: `${e.id}-in`,
              file_url: e.clock_in_photo_url,
              file_name: `Clock-in ${e.employee_name || ""} ${fmtDate(e.clock_in_time)}`.trim() + ".jpg",
              file_type: "image/jpeg",
              reference: "Clock-in photo",
            });
          }
          if (e.clock_out_photo_url) {
            collected.push({
              id: `${e.id}-out`,
              file_url: e.clock_out_photo_url,
              file_name: `Clock-out ${e.employee_name || ""} ${fmtDate(e.clock_out_time)}`.trim() + ".jpg",
              file_type: "image/jpeg",
              reference: "Clock-out photo",
            });
          }
        });
        setFiles(collected);
      })
      .catch(() => { if (active) setFiles([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [task?.id]);

  return (
    <div className="flex flex-col h-full bg-card border-r border-border min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{task?.title || "Task files"}</p>
          <p className="text-xs text-muted-foreground">{files.length} file(s)</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Camera className="w-10 h-10 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No clock-in/out photos for this task.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {files.map(file => (
              <button key={file.id} type="button" onClick={() => setViewing(file)}
                className="rounded-lg border border-border bg-card overflow-hidden text-left hover:border-primary/50 hover:shadow-sm transition-all">
                <div className="aspect-video bg-muted/40 flex items-center justify-center overflow-hidden">
                  <SignedImage src={file.file_url} alt={file.file_name} className="w-full h-full object-cover" />
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-xs font-medium text-foreground truncate">{file.file_name}</p>
                  {file.reference && <p className="text-[11px] text-muted-foreground truncate">{file.reference}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {viewing && <FilePreviewModal file={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}