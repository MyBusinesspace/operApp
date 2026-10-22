import React from "react";
import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatWhen } from "@/components/settings/driveMirror/mirrorFormat";

export default function MirrorErrorsCard({ status, liveErrors }) {
  const errors = (liveErrors && liveErrors.length ? liveErrors : status?.errors) || [];
  const failed = status?.last_failed;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className={`w-4 h-4 ${errors.length || failed ? "text-destructive" : "text-muted-foreground"}`} />
          <h3 className="text-xs font-semibold text-foreground">Errors</h3>
        </div>

        {errors.length === 0 && !failed ? (
          <p className="text-xs text-muted-foreground">No errors recorded in the latest run.</p>
        ) : (
          <div className="space-y-2">
            {failed && (
              <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                <p className="font-medium">Last failed run · {formatWhen(failed.date)}</p>
                <p className="mt-0.5">{failed.error || "Unknown error"}</p>
              </div>
            )}
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {errors.map((message, i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs text-foreground/90">
                  {message}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}