import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import {
  ArrowLeft, Package, Pencil, Calendar,
  User, ClipboardList, CheckSquare, Clock, Paperclip,
  Hash, DollarSign, FolderKanban, Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AssetFormModal from "@/components/assets/AssetFormModal";
import AssetHistory from "@/components/assets/AssetHistory";
import SharedFilesPanel from "@/components/shared/SharedFilesPanel";

const STATUS_STYLES = {
  Available:           "bg-emerald-100 text-emerald-700",
  "In Use":            "bg-blue-100 text-blue-700",
  "Under Maintenance": "bg-amber-100 text-amber-700",
  Retired:             "bg-slate-100 text-slate-500",
};
const CATEGORY_STYLES = {
  Crane:     "bg-indigo-100 text-indigo-700",
  Hoist:     "bg-sky-100 text-sky-700",
  Platform:  "bg-teal-100 text-teal-700",
  Vehicle:   "bg-orange-100 text-orange-700",
  Tool:      "bg-purple-100 text-purple-700",
  Equipment: "bg-slate-100 text-slate-600",
  Other:     "bg-slate-100 text-slate-500",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtCurrency(amount, currency = "USD") {
  if (!amount) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

const TABS = [
  { id: "all",         label: "All" },
  { id: "work_orders", label: "Work Orders" },
  { id: "tasks",       label: "Tasks" },
  { id: "history",     label: "History & Notes" },
  { id: "files",       label: "Files" },
];

function EmptySection({ label, Icon }) {
  return (
    <div className="py-10 text-center">
      {Icon && <Icon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />}
      <p className="text-sm text-muted-foreground">No {label.toLowerCase()} found for this asset.</p>
    </div>
  );
}

const TH = ({ children }) => (
  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{children}</th>
);
const TD = ({ children, muted }) => (
  <td className={`px-3 py-2.5 text-sm ${muted ? "text-muted-foreground" : "text-foreground"}`}>{children}</td>
);

function normalizeRow(row) {
  if (row._section === "Work Order") {
    return {
      ref: row.reference || null,
      refLink: row.reference ? `/work-orders/${row.id}` : null,
      name: row.title,
      nameLink: `/work-orders/${row.id}`,
      type: row.type,
      date: fmtDate(row.scheduled_date),
      endDate: fmtDate(row.due_date),
      status: row.status,
    };
  }
  return {
    ref: row.reference || null,
    refLink: row.reference ? `/tasks?open=${row.id}` : null,
    name: row.title,
    nameLink: null,
    type: row.category || row.priority,
    date: fmtDate(row.planning_date),
    endDate: null,
    status: row.status,
  };
}

function UnifiedTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <TH>Reference</TH><TH>Name</TH><TH>Type</TH><TH>Date</TH><TH>End Date</TH><TH>Status</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const n = normalizeRow(row);
            return (
              <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <TD>
                  {n.refLink
                    ? <Link to={n.refLink} className="font-medium text-primary hover:underline">{n.ref}</Link>
                    : <span className="font-medium">{n.ref || "—"}</span>}
                </TD>
                <TD muted>
                  {n.nameLink
                    ? <Link to={n.nameLink} className="text-primary hover:underline">{n.name || "—"}</Link>
                    : n.name || "—"}
                </TD>
                <TD muted>{n.type || "—"}</TD>
                <TD muted>{n.date || "—"}</TD>
                <TD muted>{n.endDate || "—"}</TD>
                <TD>{n.status || "—"}</TD>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [editModal, setEditModal] = useState(false);

  const [workOrders, setWorkOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [assetFiles, setAssetFiles] = useState([]);
  const [allWorkOrders, setAllWorkOrders] = useState([]);
  const [assetFields, setAssetFields] = useState([]);

  const load = async () => {
    setLoading(true);
    const [assets, c, p, wos] = await Promise.all([
      base44.entities.Asset.filter({ id }),
      base44.entities.Contact.list("full_name", 200),
      base44.entities.Project.list("name", 200),
      base44.entities.WorkOrder.list("title", 200),
    ]);
    const found = Array.isArray(assets) ? assets[0] : assets;
    setAsset(found || null);
    setContacts(c);
    setProjects(p);
    setAllWorkOrders(wos);
    await refresh();
    setLoading(false);
  };

  const refresh = async () => {
    const results = await Promise.allSettled([
      base44.entities.WorkOrder?.filter({ asset_id: id }) || Promise.resolve([]),
      base44.entities.Task?.filter({ asset_id: id }) || Promise.resolve([]),
      base44.entities.AssetNote.filter({ asset_id: id }),
      base44.entities.SharedFile.filter({ asset_id: id }),
    ]);
    setWorkOrders(results[0].status === "fulfilled" ? results[0].value || [] : []);
    setTasks(results[1].status === "fulfilled" ? results[1].value || [] : []);
    setNotes(results[2].status === "fulfilled" ? results[2].value || [] : []);
    setAssetFiles(results[3].status === "fulfilled" ? results[3].value || [] : []);
    const [assets] = await Promise.all([
      base44.entities.Asset.filter({ id }),
    ]);
    const found = Array.isArray(assets) ? assets[0] : assets;
    if (found) setAsset(found);
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { base44.entities.AssetField.list("sort_order", 200).then(setAssetFields).catch(() => {}); }, []);

  const handleSave = async (form) => {
    await base44.entities.Asset.update(id, form);
    const newWOIds = Array.isArray(form.work_order_ids) ? form.work_order_ids : (form.work_order_id ? [form.work_order_id] : []);
    const prevWOIds = Array.isArray(asset?.work_order_ids) && asset.work_order_ids.length > 0
      ? asset.work_order_ids
      : asset?.work_order_id ? [asset.work_order_id] : [];
    const removed = prevWOIds.filter(wid => !newWOIds.includes(wid));
    const added = newWOIds.filter(wid => !prevWOIds.includes(wid));
    const kept = newWOIds.filter(wid => prevWOIds.includes(wid));
    for (const wid of removed) {
      await base44.entities.WorkOrder.update(wid, { asset_id: "", asset_name: "" });
    }
    for (const wid of added) {
      await base44.entities.WorkOrder.update(wid, { asset_id: id, asset_name: form.name });
    }

    // If the asset name changed, propagate to kept work orders + all linked tasks
    const nameChanged = (form.name || "") !== (asset?.name || "");
    if (nameChanged) {
      try {
        for (const wid of kept) {
          await base44.entities.WorkOrder.update(wid, { asset_name: form.name });
        }
        await base44.entities.Task.updateMany({ asset_id: id }, { $set: { asset_name: form.name } });
        for (const wid of newWOIds) {
          await base44.entities.Task.updateMany({ work_order_id: wid }, { $set: { asset_name: form.name } });
        }
      } catch (e) { console.error("Failed to sync asset name to tasks/work orders", e); }
    }

    setEditModal(false);
    refresh();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Loading asset...</div>;
  }

  if (!asset) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Asset not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/assets")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Assets
        </Button>
      </div>
    );
  }

  const tabCounts = {
    all: workOrders.length + tasks.length,
    work_orders: workOrders.length,
    tasks: tasks.length,
    history: notes.length,
    files: assetFiles.length,
  };

  const allItems = [
    ...workOrders.map(w => ({ ...w, _section: "Work Order" })),
    ...tasks.map(t => ({ ...t, _section: "Task" })),
  ];

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link to="/assets" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Assets
      </Link>

      {/* Header Card */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/10 shrink-0">
            <Package className="w-7 h-7 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-foreground">{asset.name}</h1>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${CATEGORY_STYLES[asset.category] || CATEGORY_STYLES.Other}`}>
                {asset.category || "Equipment"}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLES[asset.status] || STATUS_STYLES.Available}`}>
                {asset.status || "Available"}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground mt-2">
              {asset.reference && (
                <span className="flex items-center gap-1.5 font-mono">
                  <Hash className="w-3.5 h-3.5 shrink-0" /> {asset.reference}
                </span>
              )}
              {assetFields.map(f => {
                const val = asset.custom_fields?.[f.id];
                if (val === undefined || val === null || val === "") return null;
                return (
                  <span key={f.id} className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs text-muted-foreground">{f.name}:</span>
                    <span className="font-medium text-foreground">{String(val)}</span>
                  </span>
                );
              })}
              {asset.contact_name && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" /> {asset.contact_name}
                </span>
              )}
              {asset.project_name && (
                <Link to={`/projects/${asset.project_id}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                  <FolderKanban className="w-3.5 h-3.5 shrink-0" /> {asset.project_name}
                </Link>
              )}
              {(asset.work_order_names || (asset.work_order_name ? [asset.work_order_name] : [])).map((woName, i) => {
                const woIds = asset.work_order_ids || (asset.work_order_id ? [asset.work_order_id] : []);
                const woId = woIds[i];
                return woId ? (
                  <Link key={i} to={`/work-orders/${woId}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                    <ClipboardList className="w-3.5 h-3.5 shrink-0" /> {woName}
                  </Link>
                ) : (
                  <span key={i} className="flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5 shrink-0" /> {woName}
                  </span>
                );
              })}
              {asset.purchase_price && (
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <DollarSign className="w-3.5 h-3.5 shrink-0" />
                  {fmtCurrency(asset.purchase_price, asset.currency)}
                </span>
              )}
              {asset.purchase_date && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0" /> {fmtDate(asset.purchase_date)}
                </span>
              )}
              {/* Location is now managed as a custom field */}
            </div>

            {/* Manufacturer / Model / Year are now managed as custom fields */}
            {asset.notes && (
              <p className="mt-2 text-sm text-muted-foreground border-l-2 border-border pl-3">{asset.notes}</p>
            )}
          </div>

          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => setEditModal(true)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Work Orders", count: workOrders.length, Icon: ClipboardList, color: "text-orange-600" },
          { label: "Tasks",       count: tasks.length,      Icon: CheckSquare,   color: "text-indigo-600" },
          { label: "Notes",       count: notes.length,      Icon: Clock,         color: "text-blue-600" },
          { label: "Files",       count: assetFiles.length, Icon: Paperclip,     color: "text-emerald-600" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-3 text-center">
            <s.Icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
            <div className={`text-xl font-bold ${s.color}`}>{s.count}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="border-b border-border overflow-x-auto">
          <div className="flex min-w-max">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}>
                {t.label}
                {tabCounts[t.id] > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    tab === t.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {tabCounts[t.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {tab === "all" && (
            allItems.length === 0
              ? <EmptySection label="Activity" Icon={Package} />
              : <UnifiedTable rows={allItems} />
          )}
          {tab === "work_orders" && (
            workOrders.length === 0
              ? <EmptySection label="Work Orders" Icon={ClipboardList} />
              : <UnifiedTable rows={workOrders.map(r => ({ ...r, _section: "Work Order" }))} />
          )}
          {tab === "tasks" && (
            tasks.length === 0
              ? <EmptySection label="Tasks" Icon={CheckSquare} />
              : <UnifiedTable rows={tasks.map(r => ({ ...r, _section: "Task" }))} />
          )}
          {tab === "history" && (
            <AssetHistory assetId={id} notes={notes} onRefresh={refresh} />
          )}
          {tab === "files" && (
            <SharedFilesPanel context={{
              asset_id: id,
              asset_name: asset.name,
              contact_id: asset.contact_id || undefined,
              contact_name: asset.contact_name || undefined,
              project_id: asset.project_id || undefined,
              project_name: asset.project_name || undefined,
            }} files={assetFiles} onRefresh={refresh} />
          )}
        </div>
      </motion.div>

      <AssetFormModal
        open={editModal}
        onClose={() => setEditModal(false)}
        onSave={handleSave}
        asset={asset}
        contacts={contacts}
        projects={projects}
        workOrders={allWorkOrders}
        onFilesChange={refresh}
      />
    </div>
  );
}