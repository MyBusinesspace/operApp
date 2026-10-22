import React from "react";
import { CheckCircle2, CloudOff, HardDrive, Clock, FileText, FolderTree } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { base44 } from "@/api/base44Client";
import { formatWhen, modeLabel } from "@/components/settings/driveMirror/mirrorFormat";
import { MirrorProgress, MirrorSyncButton } from "@/components/settings/driveMirror/MirrorProgress";

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {Icon && <Icon className="w-3 h-3" />}
        <p className="text-[11px] uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-lg font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function MirrorToggle({ enabled }) {
  const [on, setOn] = React.useState(Boolean(enabled));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  React.useEffect(() => { setOn(Boolean(enabled)); }, [enabled]);

  const toggle = async (checked) => {
    setBusy(true); setErr("");
    try {
      const rows = await base44.entities.AccountingSettings.list("-created_date", 1);
      const row = Array.isArray(rows) ? rows[0] : (rows?.items || [])[0];
      if (row) await base44.entities.AccountingSettings.update(row.id, { drive_mirror_enabled: checked });
      else await base44.entities.AccountingSettings.create({ drive_mirror_enabled: checked });
      setOn(checked);
    } catch (e) {
      setErr(e?.message || "Could not save the setting");
    }
    setBusy(false);
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
      <div>
        <p className="text-xs font-semibold text-foreground">Drive mirror (opt-in)</p>
        <p className="text-[11px] text-muted-foreground">
          Off by default. When on, app files sync hourly into this app's connected Google Drive.
        </p>
        {err && <p className="text-[11px] text-destructive mt-1">{err}</p>}
      </div>
      <Switch checked={on} disabled={busy} onCheckedChange={toggle} />
    </div>
  );
}

export default function MirrorStatusPanel({ status, syncing, progress, actionError, onSync }) {
  const connected = Boolean(status?.connected);
  const enabled = Boolean(status?.enabled);

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <MirrorToggle enabled={enabled} />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${connected ? "bg-emerald-50" : "bg-destructive/10"}`}>
              {connected
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                : <CloudOff className="w-5 h-5 text-destructive" />}
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Google Drive</p>
              <p className={`text-xs ${connected ? "text-emerald-600" : "text-destructive"}`}>
                {connected ? "Connected" : "Not connected"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mirror root</p>
            <p className="text-xs font-medium text-foreground">{status?.root_folder_name || "Redcrane LLC"}</p>
          </div>
        </div>

        {!connected && status?.connection_error && (
          <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{status.connection_error}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Files mirrored" value={status?.files_mirrored ?? "—"} icon={FileText} />
          <Stat label="Folders" value={status?.folders_mirrored ?? "—"} icon={FolderTree} />
          <Stat label="Last sync" value={status?.last ? formatWhen(status.last.date) : "Never"} icon={Clock} />
          <Stat label="Mode" value={status?.last ? modeLabel(status.last.mode) : "—"} icon={HardDrive} />
        </div>

        {status?.last && (
          <p className="text-xs text-muted-foreground tabular-nums">
            Last run: {status.last.uploaded} uploaded · {status.last.restored || 0} restored · {status.last.deleted || 0} removed
          </p>
        )}

        <MirrorProgress progress={progress} />

        {enabled ? (
          <MirrorSyncButton syncing={syncing} connected={connected} onSync={onSync} />
        ) : (
          <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            The mirror is off. Turn it on above to start syncing.
          </p>
        )}

        <p className="text-[11px] text-muted-foreground">
          When enabled, files are mirrored automatically every hour and continue in the background after you leave this page.
        </p>

        {actionError && (
          <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{actionError}</p>
        )}
      </CardContent>
    </Card>
  );
}