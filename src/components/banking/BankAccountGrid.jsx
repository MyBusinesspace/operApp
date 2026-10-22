import { useState, useEffect, useMemo } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, GripVertical, Maximize2, Minus, Expand } from "lucide-react";
import BankBalanceSparkline from "@/components/banking/BankBalanceSparkline";
import { base44 } from "@/api/base44Client";

const SIZES = ["normal", "wide", "large"];
const SIZE_ICONS = { normal: Expand, wide: Maximize2, large: Maximize2 };

export default function BankAccountGrid({ bankAccounts, can, onSelect, onEdit, onDelete }) {
  const [layout, setLayout] = useState({});
  const [layoutRecordId, setLayoutRecordId] = useState(null);

  // Load per-user layout on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await base44.entities.UserBankLayout.filter({}, { limit: 1, sort: "-created_date" });
        const record = res?.items?.[0] || res?.[0];
        if (record) {
          setLayout(record.layout || {});
          setLayoutRecordId(record.id);
        } else {
          const created = await base44.entities.UserBankLayout.create({ layout: {} });
          setLayoutRecordId(created.id);
        }
      } catch (err) {
        console.error("Failed to load bank layout", err);
      }
    })();
  }, []);

  // Sort bank accounts by per-user layout order
  const sortedAccounts = useMemo(() => {
    return [...bankAccounts].sort((a, b) => {
      const aOrder = layout[a.id]?.order ?? 999999;
      const bOrder = layout[b.id]?.order ?? 999999;
      return aOrder - bOrder;
    });
  }, [bankAccounts, layout]);

  const persistLayout = (next) => {
    setLayout(next);
    if (layoutRecordId) {
      base44.entities.UserBankLayout.update(layoutRecordId, { layout: next }).catch(err => console.error("Failed to save bank layout", err));
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const reordered = [...sortedAccounts];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    const next = { ...layout };
    reordered.forEach((b, i) => { next[b.id] = { ...next[b.id], order: i }; });
    persistLayout(next);
  };

  const cycleSize = (bankId) => {
    const current = layout[bankId]?.size || "normal";
    const nextSize = SIZES[(SIZES.indexOf(current) + 1) % SIZES.length];
    persistLayout({ ...layout, [bankId]: { ...layout[bankId], size: nextSize } });
  };

  const toggleMinimize = (bankId) => {
    persistLayout({ ...layout, [bankId]: { ...layout[bankId], minimized: !layout[bankId]?.minimized } });
  };

  const getColSpan = (bankId) => {
    const w = layout[bankId];
    if (w?.minimized) return 1;
    if (w?.size === "wide" || w?.size === "large") return 2;
    return 1;
  };

  const getRowSpan = (bankId) => {
    const w = layout[bankId];
    if (w?.minimized) return 1;
    return w?.size === "large" ? 2 : 1;
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="bank-grid" direction="horizontal">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))" }}
          >
            {sortedAccounts.map((bank, index) => {
              const w = layout[bank.id] || {};
              const colSpan = getColSpan(bank.id);
              const rowSpan = getRowSpan(bank.id);
              const minimized = !!w.minimized;
              const size = w.size || "normal";
              const SizeIcon = SIZE_ICONS[size];
              return (
                <Draggable key={bank.id} draggableId={bank.id} index={index}>
                  {(dragProvided, snapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={snapshot.isDragging ? "z-50" : ""}
                      style={{
                        ...dragProvided.draggableProps.style,
                        gridColumn: `span ${colSpan}`,
                        gridRow: `span ${rowSpan}`,
                      }}
                    >
                      <div
                        className={`bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all cursor-pointer group relative h-full flex flex-col ${snapshot.isDragging ? "shadow-xl rotate-1" : ""}`}
                        onClick={() => onSelect(bank)}
                      >
                        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ backgroundColor: bank.color || "#6367f2" }} />

                        {/* Header row */}
                        <div className="flex items-start justify-between mt-1 gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div {...dragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground transition-colors shrink-0 pt-1" onClick={e => e.stopPropagation()}>
                              <GripVertical className="w-4 h-4" />
                            </div>
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: bank.color || "#6367f2" }}>
                              {bank.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-foreground truncate">{bank.name}</p>
                              {bank.bank_name && <p className="text-xs text-muted-foreground truncate">{bank.bank_name}{bank.account_number ? ` ···${bank.account_number}` : ""}</p>}
                            </div>
                          </div>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleMinimize(bank.id)} title={minimized ? "Expand" : "Minimize"}>
                              {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                            </Button>
                            {!minimized && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => cycleSize(bank.id)} title={`Size: ${size} (click to cycle)`}>
                                <SizeIcon className={`w-3.5 h-3.5 ${size === "large" ? "scale-110" : ""}`} />
                              </Button>
                            )}
                            {can("bank_accounts", "can_edit") && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(bank)}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {can("bank_accounts", "can_delete") && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => onDelete(bank)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Body — hidden when minimized */}
                        {!minimized && (
                          <div className="mt-4 flex-1 flex flex-col">
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">{bank.account_type} · {bank.currency}</p>
                              <Badge variant="outline" className={`text-xs ${bank.status === "Active" ? "text-green-600 border-green-200" : "text-muted-foreground"}`}>
                                {bank.status}
                              </Badge>
                            </div>
                            <div className="mt-2 flex-1">
                              <BankBalanceSparkline bank={bank} height={size === "large" ? 260 : 120} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}