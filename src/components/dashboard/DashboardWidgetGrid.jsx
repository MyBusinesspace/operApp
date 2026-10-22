import { useState, useMemo, useEffect, useRef } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { GripVertical, Maximize2, Minus, Expand } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SIZES = ["normal", "wide", "large"];

export default function DashboardWidgetGrid({ widgets }) {
  const [layout, setLayout] = useState({});
  const [layoutRecordId, setLayoutRecordId] = useState(null);
  const loadedRef = useRef(false);

  // Load layout from entity on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await base44.entities.UserDashboardLayout.filter({}, { limit: 1, sort: "-created_date" });
        const record = res?.items?.[0] || res?.[0];
        if (record) {
          setLayout(record.layout || {});
          setLayoutRecordId(record.id);
        } else {
          // Create initial record
          const created = await base44.entities.UserDashboardLayout.create({ layout: {} });
          setLayoutRecordId(created.id);
        }
      } catch (err) {
        console.error("Failed to load dashboard layout", err);
      } finally {
        loadedRef.current = true;
      }
    })();
  }, []);

  const widgetMap = useMemo(() => Object.fromEntries(widgets.map(w => [w.id, w])), [widgets]);

  const sortedWidgets = useMemo(() => {
    return [...widgets].sort((a, b) => {
      const aOrder = layout[a.id]?.order ?? 9999;
      const bOrder = layout[b.id]?.order ?? 9999;
      return aOrder - bOrder;
    });
  }, [widgets, layout]);

  const persistLayout = (next) => {
    setLayout(next);
    if (layoutRecordId) {
      base44.entities.UserDashboardLayout.update(layoutRecordId, { layout: next }).catch(err => console.error("Failed to save dashboard layout", err));
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const reordered = [...sortedWidgets];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    const next = { ...layout };
    reordered.forEach((w, i) => { next[w.id] = { ...next[w.id], order: i }; });
    persistLayout(next);
  };

  const updateWidget = (id, data) => {
    persistLayout({ ...layout, [id]: { ...layout[id], ...data } });
  };

  const cycleSize = (id) => {
    const current = layout[id]?.size || "normal";
    const next = SIZES[(SIZES.indexOf(current) + 1) % SIZES.length];
    updateWidget(id, { size: next });
  };

  const toggleMinimize = (id) => {
    updateWidget(id, { minimized: !layout[id]?.minimized });
  };

  const getColSpan = (id) => {
    const w = layout[id];
    if (w?.minimized) return 1;
    if (w?.size === "wide" || w?.size === "large") return 2;
    return 1;
  };

  const getRowSpan = (id) => {
    const w = layout[id];
    if (w?.minimized) return 1;
    return w?.size === "large" ? 2 : 1;
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="dashboard-widget-grid" direction="horizontal">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))" }}
          >
            {sortedWidgets.map((widget, index) => {
              const w = layout[widget.id] || {};
              const minimized = !!w.minimized;
              const colSpan = getColSpan(widget.id);
              const rowSpan = getRowSpan(widget.id);
              return (
                <Draggable key={widget.id} draggableId={widget.id} index={index}>
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
                      <div className={`relative group h-full ${snapshot.isDragging ? "shadow-xl rotate-1" : ""}`}>
                        {/* Floating controls */}
                        <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                          <div {...dragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground bg-card/80 backdrop-blur-sm rounded-md p-1 border border-border/50">
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>
                        </div>
                        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                          <button
                            onClick={() => toggleMinimize(widget.id)}
                            className="text-muted-foreground/60 hover:text-foreground bg-card/80 backdrop-blur-sm rounded-md p-1 border border-border/50 transition-colors"
                            title={minimized ? "Expand" : "Minimize"}
                          >
                            {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                          </button>
                          {!minimized && (
                            <button
                              onClick={() => cycleSize(widget.id)}
                              className="text-muted-foreground/60 hover:text-foreground bg-card/80 backdrop-blur-sm rounded-md p-1 border border-border/50 transition-colors"
                              title={`Size: ${w.size || "normal"} (click to cycle)`}
                            >
                              <Expand className={`w-3.5 h-3.5 ${w.size === "large" ? "scale-110" : ""}`} />
                            </button>
                          )}
                        </div>
                        {/* Widget content — clipped when minimized to show only the header */}
                        <div className={`h-full ${minimized ? "max-h-[52px] overflow-hidden" : ""}`}>
                          {widgetMap[widget.id]?.content}
                        </div>
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