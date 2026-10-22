import { Clock, Hash, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ColorDot({ color }) {
  return (
    <span
      className="w-3 h-3 rounded-full shrink-0 inline-block"
      style={{ backgroundColor: color || "#6366f1" }}
    />
  );
}

const noop = (e) => e?.preventDefault?.();

/** Read-only label list matching Business/Operations settings rows. */
export function DemoLabelItemList({ title, items = [] }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-primary hover:text-primary h-7"
          title="Demo — view only"
          onClick={noop}
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No {title.toLowerCase()} yet.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors"
            >
              <ColorDot color={item.color} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {item.description}
                  </p>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Demo — view only"
                  onClick={noop}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                  title="Demo — view only"
                  onClick={noop}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DemoShiftList({ shifts = [] }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Shifts
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-primary hover:text-primary h-7"
          title="Demo — view only"
          onClick={noop}
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      {shifts.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No shifts yet.</div>
      ) : (
        <div className="divide-y divide-border">
          {shifts.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors"
            >
              <ColorDot color={item.color} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.time_in} – {item.time_out}
                </p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Demo — view only"
                  onClick={noop}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                  title="Demo — view only"
                  onClick={noop}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Static mirror of ReferenceNumberingSection (no API). */
export function DemoNumberingSection({ label, prefix, nextNumber = 1 }) {
  const year = new Date().getFullYear();
  const preview = `${prefix}-${year}-${nextNumber}`;

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <Hash className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          {label} Reference Numbering
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          Preview:{" "}
          <span className="font-mono text-foreground">{preview}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Prefix</Label>
          <Input className="h-8 text-sm" value={prefix} readOnly title="Demo — view only" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Format</Label>
          <div className="flex items-center gap-2 h-8">
            <span className="text-sm text-muted-foreground">
              e.g. {prefix}-{year}-1
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" title="Demo — view only" onClick={noop}>
          Save
        </Button>
      </div>
    </div>
  );
}

export function DemoAssetFieldsSection({ fields = [] }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden mb-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground">Custom Asset Fields</h3>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-primary h-7"
          title="Demo — view only"
          onClick={noop}
        >
          <Plus className="w-3.5 h-3.5" /> Add field
        </Button>
      </div>
      <div className="divide-y divide-border">
        {fields.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{f.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{f.field_type}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirror of FileSettingsSection: file numbering + File Types list. */
export function DemoFileSettingsSection({
  label,
  prefix = "FILE",
  nextNumber = 1,
  fileTypes = [],
}) {
  const year = new Date().getFullYear();
  const preview = fileTypes.some((t) => t.reference_prefix)
    ? `${prefix}-TYPE-${year}-${nextNumber}`
    : `${prefix}-${year}-${nextNumber}`;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
          <Hash className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {label} Reference Numbering
          </h3>
          <span className="ml-auto text-xs text-muted-foreground">
            Preview: <span className="font-mono text-foreground">{preview}</span>
          </span>
        </div>

        <div className="flex gap-1 mb-4 border-b border-border">
          <span className="px-3 py-1.5 text-xs font-medium border-b-2 border-primary text-primary">
            {label} Prefix
          </span>
          <span className="px-3 py-1.5 text-xs font-medium border-b-2 border-transparent text-muted-foreground">
            Prefix Type
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Prefix</Label>
            <Input className="h-8 text-sm" value={prefix} readOnly title="Demo — view only" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Format</Label>
            <div className="flex items-center gap-2 h-8">
              <span className="text-sm text-muted-foreground">
                e.g. {prefix}-TYPE-{year}-1
              </span>
            </div>
          </div>
        </div>

        {fileTypes.length > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium text-foreground mb-2">
              Type Reference Prefixes
            </p>
            <div className="flex flex-wrap gap-2">
              {fileTypes.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-1.5 bg-card border border-border rounded-md px-2 py-1"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: t.color || "#6366f1" }}
                  />
                  <span className="text-xs text-muted-foreground">{t.name}</span>
                  {t.reference_prefix ? (
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      {t.reference_prefix}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/60 italic">
                      no prefix
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Each file type&apos;s prefix is included in the reference code:{" "}
              <span className="font-mono text-foreground">PREFIX-TYPE-YEAR-NUMBER</span>
            </p>
          </div>
        )}

        <div className="mt-3 flex justify-end">
          <Button size="sm" title="Demo — view only" onClick={noop}>
            Save
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" /> File Types
          </h3>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-primary hover:text-primary h-7"
            title="Demo — view only"
            onClick={noop}
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
        {fileTypes.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No file types yet. Add the first one.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {fileTypes.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 inline-block"
                  style={{ backgroundColor: item.color || "#6366f1" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    {item.reference_prefix && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        {item.reference_prefix}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Demo — view only"
                    onClick={noop}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                    title="Demo — view only"
                    onClick={noop}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
