import React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MirrorProgress({ progress }) {
  if (!progress) return null;
  const running = progress.status === "running";
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
      {running ? (
        <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0 mt-0.5" />
      ) : (
        <RefreshCw className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">
          {running ? progress.phaseLabel || "Mirroring…" : `Run ${progress.status}`}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {progress.uploaded} uploaded · {progress.skipped} already up to date
        </p>
      </div>
    </div>
  );
}

export function MirrorSyncButton({ syncing, connected, onSync }) {
  return (
    <Button onClick={onSync} disabled={syncing || !connected} className="w-full gap-2 h-11" size="lg">
      {syncing ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Syncing…</>
      ) : (
        <><RefreshCw className="w-4 h-4" /> Sync now</>
      )}
    </Button>
  );
}