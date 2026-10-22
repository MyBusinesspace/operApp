import React, { useState, useEffect, useRef } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { base44 } from "@/api/base44Client";
import { useNavigate, Link } from "react-router-dom";
import { Plus, Search, Mail, Phone, Users, Download, ChevronRight, Eye, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import ContactSplitDetail from "@/components/contacts/ContactSplitDetail";
import ContactFilesViewer from "@/components/contacts/ContactFilesViewer";

function initials(name) {
  return (name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}
function avatarColor(str) {
  const palette = ["bg-indigo-200","bg-sky-200","bg-emerald-200","bg-amber-200","bg-rose-200","bg-purple-200","bg-teal-200"];
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = (h * 31 + str.charCodeAt(i)) % palette.length;
  return palette[h];
}

export default function Suppliers() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const { can } = usePermissionsMatrix();
  const [groups, setGroups] = useState([]);
  const [fileCounts, setFileCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedSearch("suppliers");
  const [filterStatus, setFilterStatus] = useState("all");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const [splitMode, setSplitMode] = useState(null);
  const [filesPct, setFilesPct] = useState(() => { const v = Number(localStorage.getItem("suppliers_files_pct")); return v >= 20 && v <= 50 ? v : 35; });
  const [detailPct, setDetailPct] = useState(() => { const v = Number(localStorage.getItem("suppliers_detail_pct")); return v >= 30 && v <= 60 ? v : 55; });
  const splitWrapRef = useRef(null);
  const startResize = (mode) => (e) => {
    e.preventDefault();
    const box = splitWrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const move = (ev) => {
      const x = ((ev.clientX - box.left) / box.width) * 100;
      if (mode === "files") setFilesPct(Math.min(50, Math.max(20, x)));
      else setDetailPct(Math.min(60, Math.max(30, 100 - x)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
      if (mode === "files") setFilesPct(p => { localStorage.setItem("suppliers_files_pct", String(Math.round(p))); return p; });
      else setDetailPct(p => { localStorage.setItem("suppliers_detail_pct", String(Math.round(p))); return p; });
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const [splitId, setSplitId] = useState(null);
  const [filesId, setFilesId] = useState(null);

  const COLUMN_DEFS = [
    { key: "reference", label: "Reference", required: false },
    { key: "contact_info", label: "Contact Info", required: false },
    { key: "location", label: "Location", required: false },
    { key: "tax_id", label: "Tax ID", required: false },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("suppliers_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { reference: true, contact_info: true, location: true, tax_id: true };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("suppliers_visible_cols", JSON.stringify(next));
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    const [page, g, cf] = await Promise.all([
      base44.entities.Contact.filter({ type: { $in: ["Provider", "Both"] } }, { sort: "-created_date", limit: 5000 }),
      base44.entities.ContactGroup.list("name", 200),
      base44.entities.ContactFile.list("created_date", 5000).catch(() => []),
    ]);
    setContacts(page.items || []);
    setGroups(g);
    const counts = {};
    (cf || []).forEach(f => { counts[f.contact_id] = (counts[f.contact_id] || 0) + 1; });
    setFileCounts(counts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = contacts.filter(c => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      c.full_name?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.company?.toLowerCase().includes(s) ||
      c.phone?.includes(s);
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const pagination = useTablePagination(filtered);

  const handleSave = async (form) => {
    const data = editing ? form : { ...form, type: form.type || "Provider" };
    if (editing) await base44.entities.Contact.update(editing.id, data);
    else await base44.entities.Contact.create(data);
    setModal(false); setEditing(null); load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this supplier?")) return;
    await base44.entities.Contact.delete(id);
    load();
  };

  const openAdd = () => { setEditing(null); setModal(true); };
  const openEdit = (c) => { setEditing(c); setModal(true); };

  const handleExport = () => {
    const headers = ["full_name","email","phone","company","status","city","country","tax_id","notes"];
    const rows = filtered.map(c => headers.map(h => `"${(c[h] || "").toString().replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "suppliers.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const fileCountFor = (c) => fileCounts[c.id] || 0;

  const [expandedSup, setExpandedSup] = useState({});
  const toggleExpand = async (c) => {
    const cur = expandedSup[c.id];
    if (cur?.open) { setExpandedSup(p => ({ ...p, [c.id]: { ...cur, open: false } })); return; }
    setExpandedSup(p => ({ ...p, [c.id]: { open: true, loading: !cur?.bills, bills: cur?.bills } }));
    if (!cur?.bills) {
      let bills = [];
      try { const r = await base44.entities.Bill.filter({ contact_id: c.id }, "-issue_date", 5); bills = Array.isArray(r) ? r : (r?.items || r?.data || []); } catch { bills = []; }
      setExpandedSup(p => ({ ...p, [c.id]: { open: p[c.id]?.open ?? true, loading: false, bills } }));
    }
  };
  const openSplitDetail = (c) => { setSplitMode("detail"); setSplitId(c.id); setFilesId(null); };
  const openSplitFiles = (c) => { setSplitMode("files"); setFilesId(c.id); setSplitId(null); };
  const closeSplit = () => { setSplitMode(null); setSplitId(null); setFilesId(null); };
  const splitDoc = contacts.find(c => c.id === splitId) || null;
  const filesDoc = contacts.find(c => c.id === filesId) || null;
  const splitIndex = splitId ? filtered.findIndex(c => c.id === splitId) : -1;
  const navSplit = (dir) => {
    if (splitIndex < 0) return;
    const next = filtered[splitIndex + dir];
    if (next) setSplitId(next.id);
  };

  const renderTable = (compact) => (
    <div className="min-w-0 max-w-full">
      <div className="overflow-x-auto max-w-full">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Loading suppliers...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No suppliers found</h3>
            <p className="text-xs text-muted-foreground mb-6">
              {search || filterStatus !== "all" ? "Try adjusting your filters." : "Add your first supplier to get started."}
            </p>
            {!search && filterStatus === "all" && can("suppliers", "can_create") && (
              <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Supplier</Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-slate-100 dark:bg-slate-800">
                <th className="px-3 py-3 w-10 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">View</th>
                {visibleCols.reference && <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell w-28">Reference</th>}
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</th>
                {visibleCols.contact_info && <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact Info</th>}
                {visibleCols.location && <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Location</th>}
                {visibleCols.tax_id && <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Tax ID</th>}
                <th className="px-3 py-3 w-16 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((c, idx) => {
                const fc = fileCountFor(c);
                const isActive = splitMode === "detail" && c.id === splitId;
                const stripe = idx % 2 === 1 ? "bg-slate-50/60 dark:bg-slate-800/30" : "";
                return (
                  <React.Fragment key={c.id}>
                  <tr className={`border-b border-border hover:bg-primary/[0.06] transition-colors group ${isActive ? "bg-primary/10" : stripe}`}>
                    <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button type="button" title="Show details" onClick={() => toggleExpand(c)}
                        className="inline-flex h-7 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10">
                        <ChevronRight className={`w-4 h-4 transition-transform ${expandedSup[c.id]?.open ? "rotate-90" : ""}`} />
                      </button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Split preview" onClick={() => openSplitDetail(c)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                    {visibleCols.reference && (
                      <td className="px-3 py-3 hidden sm:table-cell cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                        {c.reference
                          ? <span className="font-mono text-xs text-primary font-medium">{c.reference}</span>
                          : <span className="text-xs text-muted-foreground/30">—</span>}
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                        <Avatar className="w-9 h-9 shrink-0">
                          {c.avatar_url
                            ? <img src={c.avatar_url} alt={c.company || c.full_name} className="object-cover" />
                            : <AvatarFallback className={`${avatarColor(c.company || c.full_name)} text-slate-700 dark:text-slate-200 font-semibold text-xs`}>{initials(c.company || c.full_name)}</AvatarFallback>}
                        </Avatar>
                        <div>
                          <p className="text-xs font-semibold hover:text-primary transition-colors">{c.company || c.full_name}</p>
                          {c.company && c.full_name !== c.company && <p className="text-xs text-muted-foreground">{c.full_name}</p>}
                        </div>
                      </div>
                    </td>
                    {visibleCols.contact_info && (
                      <td className="px-3 py-3">
                        <div className="space-y-0.5">
                          {c.email && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3 h-3 shrink-0" /><span className="truncate max-w-[160px]">{c.email}</span></div>}
                          {c.phone && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="w-3 h-3 shrink-0" /><span>{c.phone}</span></div>}
                        </div>
                      </td>
                    )}
                    {visibleCols.location && <td className="px-3 py-3 hidden lg:table-cell text-xs text-muted-foreground">{c.city}{c.city && c.country ? ", " : ""}{c.country}</td>}
                    {visibleCols.tax_id && <td className="px-3 py-3 hidden xl:table-cell text-xs text-muted-foreground">{c.tax_id || "—"}</td>}
                    <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button type="button" onClick={() => openSplitFiles(c)}
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${fc > 0 ? "text-primary hover:bg-primary/10" : "text-muted-foreground/50"}`}
                        title="View files">
                        <Paperclip className="w-3.5 h-3.5" />
                        {fc > 0 && <span className="tabular-nums">{fc}</span>}
                      </button>
                    </td>
                  </tr>
                  {expandedSup[c.id]?.open && (() => { const ex = expandedSup[c.id]; const cc = 3 + (visibleCols.reference ? 1 : 0) + (visibleCols.contact_info ? 1 : 0) + (visibleCols.location ? 1 : 0) + (visibleCols.tax_id ? 1 : 0); const addr = [c.address, c.city, c.country].filter(Boolean).join(", "); return (
                    <tr className="border-b border-border bg-muted/20">
                      <td colSpan={cc} className="px-6 py-3">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 text-xs mb-3">
                          <div><p className="text-muted-foreground">Address</p><p className="font-medium">{addr || "—"}</p></div>
                          <div><p className="text-muted-foreground">Tax ID</p><p className="font-medium">{c.tax_id || "—"}</p></div>
                          <div><p className="text-muted-foreground">Email</p><p className="font-medium break-all">{c.email || "—"}</p></div>
                          <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{c.phone || "—"}</p></div>
                        </div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Latest bills</p>
                        {ex.loading ? <p className="text-xs text-muted-foreground">Loading...</p> : (Array.isArray(ex.bills) ? ex.bills : []).length === 0 ? <p className="text-xs text-muted-foreground">No bills</p> : (
                          <table className="w-full text-xs">
                            <thead><tr className="text-muted-foreground">
                              <th className="text-left font-semibold py-1 pr-3">Date</th>
                              <th className="text-left font-semibold py-1 pr-3">Number</th>
                              <th className="text-left font-semibold py-1 pr-3">Reference</th>
                              <th className="text-left font-semibold py-1 pr-3">Status</th>
                              <th className="text-right font-semibold py-1 pl-3">Total</th>
                            </tr></thead>
                            <tbody>{(Array.isArray(ex.bills) ? ex.bills : []).map(b => (
                              <tr key={b.id} className="border-t border-border/60">
                                <td className="py-1.5 pr-3">{b.issue_date || "—"}</td>
                                <td className="py-1.5 pr-3">{b.number || "—"}</td>
                                <td className="py-1.5 pr-3">{b.reference || "—"}</td>
                                <td className="py-1.5 pr-3">{b.status}</td>
                                <td className="py-1.5 pl-3 text-right font-medium tabular-nums">{Number(b.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {b.currency || "AED"}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  ); })()}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <div className="bg-card px-6 pt-4 pb-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Link to="/purchasing-overview" className="hover:text-primary transition-colors">Purchasing overview</Link>
          <ChevronRight className="w-3 h-3" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-3">Suppliers</h1>
        <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-border">
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          {can("suppliers", "can_create") && (
            <Button className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-8 text-xs px-3" onClick={openAdd}>
              <Plus className="w-3.5 h-3.5" /> Add Supplier
            </Button>
          )}
        </div>
        <div className="flex items-stretch gap-0 overflow-x-auto -mb-px">
          {[
            { key: "all", label: "All", count: contacts.length },
            { key: "Active", label: "Active", count: contacts.filter(c => c.status === "Active" || !c.status).length },
            { key: "Inactive", label: "Inactive", count: contacts.filter(c => c.status === "Inactive").length },
            { key: "Archived", label: "Archived", count: contacts.filter(c => c.status === "Archived").length },
          ].map(tab => {
            const active = filterStatus === tab.key;
            return (
              <button key={tab.key} onClick={() => setFilterStatus(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border border-b-0 border-slate-300 dark:border-slate-600 transition-colors ${
                  active
                    ? "bg-white dark:bg-slate-900 text-black dark:text-white border-t-2 border-t-primary shadow-sm"
                    : "bg-slate-50 dark:bg-slate-800/60 text-primary dark:text-primary/80 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}>
                {tab.label}
                <span className={`text-xs font-bold ${active ? "text-black dark:text-white" : "text-primary dark:text-primary/70"}`}>{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border-b border-border px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search name, email, company..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
      </div>

      {/* Main: split or full */}
      <div className="flex bg-card" ref={splitWrapRef}>
        {splitMode === "files" && filesDoc && (
          <>
<div style={{ width: `${filesPct}%`, minWidth: 260, maxWidth: "55%" }} className="min-w-0 flex flex-col shrink-0">
            <ContactFilesViewer contact={filesDoc} onClose={closeSplit} />
          </div>
<div onMouseDown={startResize("files")} title="Drag to resize" className="w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors" />
</>
        )}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {renderTable(splitMode !== null)}
        </div>
        {splitMode === "detail" && (
<>
<div onMouseDown={startResize("detail")} title="Drag to resize" className="w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors" />
<div style={{ width: `${detailPct}%`, minWidth: 340, maxWidth: "65%" }} className="min-w-0 flex flex-col shrink-0">
            <ContactSplitDetail
              contact={splitDoc}
              fileCount={splitDoc ? fileCountFor(splitDoc) : 0}
              onClose={closeSplit}
              onEdit={(c) => openEdit(c)}
              onOpen={(c) => navigate(`/contacts/${c.id}`)}
              onPrev={() => navSplit(-1)}
              onNext={() => navSplit(1)}
            />
          </div>
</>
        )}
      </div>

      <PaginationFooter pagination={pagination} />

      <ContactFormModal open={modal} onClose={() => { setModal(false); setEditing(null); }} onSave={handleSave} contact={editing} groups={groups} />
    </div>
  );
}