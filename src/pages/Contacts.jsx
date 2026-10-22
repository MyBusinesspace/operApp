import React, { useState, useEffect, useRef } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Users, Mail, Phone,
  Pencil, Trash2, FolderPlus, ChevronDown, ChevronRight,
  Upload, Download, Square, CheckSquare, Merge, Eye, Paperclip, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BackToOverviewButton from "@/components/shared/BackToOverviewButton";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import GroupModal from "@/components/contacts/GroupModal";
import MergeContactsModal from "@/components/contacts/MergeContactsModal";
import ContactSplitDetail from "@/components/contacts/ContactSplitDetail";
import ContactFilesViewer from "@/components/contacts/ContactFilesViewer";
import { syncPrimaryContactPerson } from "@/lib/syncPrimaryContact";
import { listAll } from "@/lib/apiHelpers";
import { useSortable } from "@/hooks/useSortable";
import { SortableTh } from "@/components/shared/SortIcon";
import { visibleKeys } from "@/lib/visibleColumns";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";

const TYPE_TEXT = {
  Customer: "text-indigo-600 dark:text-indigo-400",
  Provider: "text-violet-600 dark:text-violet-400",
  Both: "text-emerald-600 dark:text-emerald-400",
  Contact: "text-zinc-500 dark:text-zinc-400",
};

const STATUS_TEXT = {
  Active: "text-emerald-600 dark:text-emerald-400",
  Inactive: "text-amber-600 dark:text-amber-400",
  Archived: "text-zinc-500 dark:text-zinc-500",
};

function initials(name) {
  return (name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}

function avatarColor(str) {
  const palette = ["bg-indigo-500/20","bg-sky-500/20","bg-emerald-500/20","bg-amber-500/20","bg-rose-500/20","bg-purple-500/20","bg-teal-500/20"];
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = (h * 31 + str.charCodeAt(i)) % palette.length;
  return palette[h];
}

export default function Contacts() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedSearch("contacts");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [contactModal, setContactModal] = useState(false);
  const [groupModal, setGroupModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [fileCounts, setFileCounts] = useState({});
  const { can } = usePermissionsMatrix();

  // Split view
  const [splitMode, setSplitMode] = useState(null); // null | 'detail' | 'files'
  const [filesPct, setFilesPct] = useState(() => { const v = Number(localStorage.getItem("contacts_files_pct")); return v >= 20 && v <= 50 ? v : 35; });
  const [detailPct, setDetailPct] = useState(() => { const v = Number(localStorage.getItem("contacts_detail_pct")); return v >= 30 && v <= 60 ? v : 55; });
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
      if (mode === "files") setFilesPct(p => { localStorage.setItem("contacts_files_pct", String(Math.round(p))); return p; });
      else setDetailPct(p => { localStorage.setItem("contacts_detail_pct", String(Math.round(p))); return p; });
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const [splitContactId, setSplitContactId] = useState(null);
  const [filesContactId, setFilesContactId] = useState(null);

  const withRetry = async (fn, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try { return await fn(); }
      catch (e) {
        if (i === retries - 1 || !String(e?.message || e).match(/rate limit/i)) throw e;
        await new Promise(r => setTimeout(r, 800 * (i + 1)));
      }
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [c, g, cf] = await Promise.all([
        withRetry(() => listAll(base44.entities.Contact, "-created_date", 500)),
        withRetry(() => base44.entities.ContactGroup.list("name", 200)),
        withRetry(() => base44.entities.ContactFile.list("created_date", 5000).catch(() => [])),
      ]);
      setContacts(c);
      setGroups(g);
      const counts = {};
      (cf || []).forEach(f => { counts[f.contact_id] = (counts[f.contact_id] || 0) + 1; });
      setFileCounts(counts);
    } catch (e) {
      console.error("Failed to load contacts:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "true") { openAdd(); window.history.replaceState({}, "", "/contacts"); }
  }, []);

  const filtered = contacts.filter(c => {
    const s = search.toLowerCase();
    const matchSearch = !search || (() => {
      const hay = [
        c.full_name, c.company, c.email, c.phone, c.reference, c.code, c.legacy_reference, c.address,
        c.city, c.country, c.tax_id, c.website, c.notes, c.maps_link,
        c.fiscal_legal_name, c.fiscal_address, c.fiscal_city, c.fiscal_country,
        c.fiscal_zip, c.fiscal_currency, c.fiscal_payment_terms, c.fiscal_bank_name,
        c.fiscal_iban, c.fiscal_swift, c.avatar_url, c.status, c.type,
      ].filter(Boolean).join(" ").toLowerCase();
      if (hay.includes(s)) return true;
      if (Array.isArray(c.contact_persons)) {
        return c.contact_persons.some(p => p && Object.values(p).some(v =>
          v != null && typeof v === "string" && v.toLowerCase().includes(s)
        ));
      }
      return false;
    })();
    const matchType = filterType === "all"
      || (filterType === "Customer" && (c.type === "Customer" || c.type === "Both"))
      || (filterType === "Provider" && (c.type === "Provider" || c.type === "Both"))
      || c.type === filterType;
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const matchGroup = filterGroup === "all"
      ? true
      : filterGroup === "__none__"
        ? !c.group_id
        : c.group_id === filterGroup;
    return matchSearch && matchType && matchStatus && matchGroup;
  });

  const toggleGroup = (id) => setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));

  const handleSaveContact = async (form) => {
    let contactId = editing?.id;
    if (editing) await base44.entities.Contact.update(editing.id, form);
    else {
      const created = await base44.entities.Contact.create(form);
      contactId = created?.id;
      try { if (contactId) await base44.functions.invoke("assignContactCode", { contact_id: contactId }); } catch (e) { console.error("assignContactCode", e); }
    }
    await syncPrimaryContactPerson(contactId, {
      full_name: form.contact_person,
      phone: form.phone,
      email: form.email,
    });
    setContactModal(false);
    setEditing(null);
    load();
  };

  const handleDeleteContact = async (id) => {
    if (!confirm("Delete this company?")) return;
    await base44.entities.Contact.delete(id);
    load();
  };

  const handleSaveGroup = async (form) => {
    if (editingGroup) await base44.entities.ContactGroup.update(editingGroup.id, form);
    else await base44.entities.ContactGroup.create(form);
    setGroupModal(false);
    setEditingGroup(null);
    load();
  };

  const handleDeleteGroup = async (id) => {
    if (!confirm("Delete this group? Companies will remain but be ungrouped.")) return;
    await base44.entities.ContactGroup.delete(id);
    load();
  };

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [mergeModal, setMergeModal] = useState(false);
  const { sortKey, sortDir, handleSort, applySorting } = useSortable();
  const sorted = applySorting(filtered);
  const pagination = useTablePagination(sorted);
  const vis = visibleKeys(sorted, {
    reference: c => c.code || c.reference,
    email: c => c.email || c.phone,
    type: c => c.type,
    status: c => c.status,
    group_id: c => c.group_id,
    city: c => c.city || c.country,
    contact_persons: c => (c.contact_persons || []).length,
  });

  const COLUMN_DEFS = [
    { key: "reference", label: "Reference", required: false },
    { key: "full_name", label: "Company", required: true },
    { key: "email", label: "Contact Info", required: false },
    { key: "type", label: "Category", required: false },
    { key: "status", label: "Status", required: false },
    { key: "group_id", label: "Group", required: false },
    { key: "city", label: "Location", required: false },
    { key: "contact_persons", label: "Persons", required: false },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("contacts_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { reference: true, full_name: true, email: true, type: true, status: true, group_id: true, city: true, contact_persons: true };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("contacts_visible_cols", JSON.stringify(next));
      return next;
    });
  };
  const colVis = {
    reference: visibleCols.reference && vis.has("reference"),
    email: visibleCols.email && vis.has("email"),
    type: visibleCols.type && vis.has("type"),
    status: visibleCols.status && vis.has("status"),
    group_id: visibleCols.group_id && vis.has("group_id"),
    city: visibleCols.city && vis.has("city"),
    contact_persons: visibleCols.contact_persons && vis.has("contact_persons"),
  };

  const groupIds = new Set(groups.map(g => g.id));
  const sortedGrouped = {
    noGroup: pagination.pageItems.filter(c => !c.group_id || !groupIds.has(c.group_id)),
    byGroup: groups.map(g => ({ group: g, contacts: pagination.pageItems.filter(c => c.group_id === g.id) })).filter(r => r.contacts.length > 0),
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === sorted.length ? new Set() : new Set(sorted.map(c => c.id)));
  };
  const handleDeleteSelected = async () => {
    setDeleting(true);
    await Promise.all([...selectedIds].map(id => base44.entities.Contact.delete(id).catch(err => console.error(err))));
    setSelectedIds(new Set());
    setDeleting(false);
    load();
  };

  const openEdit = (c) => { setEditing(c); setContactModal(true); };
  const openAdd = () => { setEditing(null); setContactModal(true); };

  // Split view helpers
  const openSplitDetail = (c) => { setSplitMode("detail"); setSplitContactId(c.id); setFilesContactId(null); };
  const openSplitFiles = (c) => { setSplitMode("files"); setFilesContactId(c.id); setSplitContactId(null); };
  const closeSplit = () => { setSplitMode(null); setSplitContactId(null); setFilesContactId(null); };
  const splitContact = contacts.find(c => c.id === splitContactId) || null;
  const filesContact = contacts.find(c => c.id === filesContactId) || null;
  const splitGroup = splitContact ? groups.find(g => g.id === splitContact.group_id) : null;
  const splitIndex = splitContactId ? sorted.findIndex(c => c.id === splitContactId) : -1;
  const navSplit = (dir) => {
    if (splitIndex < 0) return;
    const next = sorted[splitIndex + dir];
    if (next) setSplitContactId(next.id);
  };
  const fileCountFor = (c) => fileCounts[c.id] || 0;

  // Export CSV
  const handleExport = () => {
    const headers = ["full_name","email","phone","company","type","status","city","country","tax_id","website","notes"];
    const rows = filtered.map(c => headers.map(h => `"${(c[h] || "").toString().replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contacts.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // Import CSV
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const lines = evt.target.result.split("\n").filter(Boolean);
      const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
      const records = lines.slice(1).map(line => {
        const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,))/g) || [];
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
        return obj;
      }).filter(r => r.full_name);
      for (const r of records) await base44.entities.Contact.create(r);
      load();
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const renderRow = (c) => (
    <motion.tr
      key={c.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`border-b border-border hover:bg-primary/[0.06] transition-colors group ${selectedIds.has(c.id) ? "bg-primary/10" : ""} ${splitMode === "detail" && c.id === splitContactId ? "bg-primary/10" : sorted.findIndex(s => s.id === c.id) % 2 === 1 ? "bg-slate-50/60 dark:bg-slate-800/30" : ""}`}
    >
      <td className="px-3 py-3 w-10" onClick={e => toggleSelect(c.id, e)}>
        {selectedIds.has(c.id)
          ? <CheckSquare className="w-4 h-4 text-primary" />
          : <Square className="w-4 h-4 text-muted-foreground" />}
      </td>
      <td className="px-3 py-3 w-10" onClick={e => e.stopPropagation()}>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Split preview"
          onClick={() => openSplitDetail(c)}>
          <Eye className="w-4 h-4" />
        </Button>
      </td>
      {colVis.reference && (
      <td className="px-4 py-3 hidden sm:table-cell cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
        {(c.code || c.reference)
          ? <span className="font-mono text-xs text-primary font-medium">{c.code || c.reference}</span>
          : <span className="text-xs text-muted-foreground/30">—</span>}
      </td>
      )}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
          <Avatar className="w-9 h-9 shrink-0">
            {c.avatar_url
              ? <img src={c.avatar_url} alt={c.company || c.full_name} className="object-cover" />
              : <AvatarFallback className={`${avatarColor(c.company || c.full_name)} text-white font-semibold text-xs`}>
                  {initials(c.company || c.full_name)}
                </AvatarFallback>
            }
          </Avatar>
          <div>
            <p className="text-xs font-semibold text-foreground leading-tight hover:text-primary transition-colors">
              {c.company || c.full_name}
            </p>
            {c.company && c.full_name && (
              <p className="text-xs text-muted-foreground">{c.full_name}</p>
            )}
          </div>
        </div>
      </td>
      {colVis.email && (
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          {c.email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[160px]">{c.email}</span>
            </div>
          )}
          {c.phone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="w-3 h-3 shrink-0" />
              <span>{c.phone}</span>
            </div>
          )}
        </div>
      </td>
      )}
      {colVis.type && (
      <td className="px-4 py-3 hidden md:table-cell">
        <span className={`text-xs font-medium ${TYPE_TEXT[c.type] || TYPE_TEXT.Contact}`}>
          {c.type || "Contact"}
        </span>
      </td>
      )}
      {colVis.status && (
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className={`text-xs font-medium ${STATUS_TEXT[c.status] || STATUS_TEXT.Active}`}>
          {c.status || "Active"}
        </span>
      </td>
      )}
      {colVis.group_id && (
      <td className="px-4 py-3 hidden xl:table-cell">
        {c.group_id && (() => {
          const g = groups.find(gr => gr.id === c.group_id);
          return g ? (
            <span className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: g.color }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
              {g.name}
            </span>
          ) : null;
        })()}
      </td>
      )}
      {colVis.city && (
      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
        {c.city}{c.city && c.country ? ", " : ""}{c.country}
      </td>
      )}
      {colVis.contact_persons && (
      <td className="px-4 py-3 hidden xl:table-cell">
        {(c.contact_persons || []).length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3 h-3 shrink-0" />
            <span>{c.contact_persons.length}</span>
          </div>
        )}
      </td>
      )}
      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={() => openSplitFiles(c)}
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${fileCountFor(c) > 0 ? "text-primary hover:bg-primary/10" : "text-muted-foreground/50"}`}
          title="View contact files">
          <Paperclip className="w-3.5 h-3.5" />
          {fileCountFor(c) > 0 && <span className="tabular-nums">{fileCountFor(c)}</span>}
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
          {can("contacts", "can_edit") && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {can("contacts", "can_delete") && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteContact(c.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </td>
    </motion.tr>
  );

  const renderTable = (compact) => (
    <div>
      <div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Loading companies...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No companies found</h3>
            <p className="text-xs text-muted-foreground mb-6">
              {search || filterType !== "all" || filterStatus !== "all" || filterGroup !== "all"
                ? "Try adjusting your filters."
                : "Add your first company to get started."}
            </p>
            {!search && filterType === "all" && filterStatus === "all" && filterGroup === "all" && can("contacts", "can_create") && (
              <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Company</Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-3 py-3 cursor-pointer" onClick={toggleSelectAll}>
                  {filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))
                    ? <CheckSquare className="w-4 h-4 text-primary" />
                    : <Square className="w-4 h-4 text-muted-foreground" />}
                </th>
                <th className="px-3 py-3 w-10 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">View</th>
                {[
                  { key: "reference", label: "Reference", cls: "hidden sm:table-cell w-28" },
                  { key: "full_name", label: "Company", cls: "" },
                  { key: "email", label: "Contact Info", cls: "" },
                  { key: "type", label: "Category", cls: "hidden md:table-cell" },
                  { key: "status", label: "Status", cls: "hidden lg:table-cell" },
                  { key: "group_id", label: "Group", cls: "hidden xl:table-cell" },
                  { key: "city", label: "Location", cls: "hidden lg:table-cell" },
                  { key: "contact_persons", label: "Persons", cls: "hidden xl:table-cell" },
                ].filter(col => col.key === "full_name" || colVis[col.key]).map(col => (
                  <SortableTh key={col.key} colKey={col.key} label={col.label} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className={col.cls} />
                ))}
                <th className="px-3 py-3 w-16 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {/* Grouped rows */}
              {sortedGrouped.byGroup.map(({ group: g, contacts: gc }) => (
                <React.Fragment key={g.id}>
                  <tr
                    className="border-b border-border bg-muted/20 cursor-pointer hover:bg-primary/[0.06] transition-colors"
                    onClick={() => toggleGroup(g.id)}
                  >
                    <td colSpan={12} className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {expandedGroups[g.id] === false
                          ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        }
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                        <span className="text-xs font-semibold" style={{ color: g.color }}>{g.name}</span>
                        <span className="text-xs text-muted-foreground ml-1">({gc.length})</span>
                      </div>
                    </td>
                  </tr>
                  {expandedGroups[g.id] !== false && gc.map(c => renderRow(c))}
                </React.Fragment>
              ))}
              {/* Ungrouped rows */}
              {sortedGrouped.noGroup.length > 0 && sortedGrouped.byGroup.length > 0 && (
                <tr className="border-b border-border bg-muted/10">
                  <td colSpan={12} className="px-4 py-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ungrouped ({sortedGrouped.noGroup.length})</span>
                  </td>
                </tr>
              )}
              {sortedGrouped.noGroup.map(c => renderRow(c))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-6 pt-4 pb-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <BackToOverviewButton to="/business-overview" />
          <ChevronRight className="w-3 h-3" />
        </div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Companies</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Customers, providers & company groups</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="cursor-pointer">
              <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-accent transition-colors">
                <Upload className="w-3.5 h-3.5" /> Import
              </span>
            </label>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
            {can("contacts", "can_create") && (
              <Button variant="outline" size="sm" className="gap-2"
                onClick={() => { setEditingGroup(null); setGroupModal(true); }}>
                <FolderPlus className="w-4 h-4" /> New Group
              </Button>
            )}
            {can("contacts", "can_create") && (
              <Button className="gap-2 shadow-sm" onClick={openAdd}>
                <Plus className="w-4 h-4" /> Add Company
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-stretch gap-0 overflow-x-auto -mb-px">
          {[
            { key: "all",      label: "All",       count: contacts.length },
            { key: "Customer", label: "Customers", count: contacts.filter(c => c.type === "Customer" || c.type === "Both").length },
            { key: "Provider", label: "Providers", count: contacts.filter(c => c.type === "Provider" || c.type === "Both").length },
            { key: "Contact",  label: "Contacts",  count: contacts.filter(c => c.type === "Contact").length },
          ].map(tab => {
            const active = filterType === tab.key;
            return (
            <button key={tab.key} onClick={() => setFilterType(tab.key)}
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

      {/* Search bar */}
      <div className="bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search name, email, company..."
            className="pl-9 bg-muted/40 border-muted" value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["Active","Inactive","Archived"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterGroup} onValueChange={setFilterGroup}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Groups" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            <SelectItem value="__none__">No group</SelectItem>
            {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-card border-b border-border px-6 py-2 flex items-center gap-3">
          <span className="text-xs font-medium text-foreground">{selectedIds.size} company{selectedIds.size > 1 ? "s" : ""} selected</span>
          {selectedIds.size === 2 && (
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs border-primary/40 text-primary hover:bg-primary/5" onClick={() => setMergeModal(true)}>
              <Merge className="w-3.5 h-3.5" /> Merge Duplicates
            </Button>
          )}
          {can("contacts", "can_delete") && (
            <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs ml-auto" disabled={deleting} onClick={handleDeleteSelected}>
              <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Deleting..." : "Delete Selected"}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>Cancel</Button>
        </div>
      )}

      {/* Groups management row */}
      {groups.length > 0 && (
        <div className="bg-card border-b border-border px-6 py-2 flex flex-wrap gap-2">
          {groups.map(g => (
            <div key={g.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer hover:shadow-sm transition-all group/g"
              style={{ borderColor: g.color + "60", backgroundColor: g.color + "15", color: g.color }}
              onClick={() => setFilterGroup(filterGroup === g.id ? "all" : g.id)}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
              {g.name}
              <span className="ml-1 opacity-60">({contacts.filter(c => c.group_id === g.id).length})</span>
              <span className="ml-1 opacity-0 group-hover/g:opacity-60 flex gap-0.5" onClick={e => e.stopPropagation()}>
                {can("contacts", "can_edit") && (
                  <Pencil className="w-3 h-3 cursor-pointer hover:opacity-100"
                    onClick={() => { setEditingGroup(g); setGroupModal(true); }} />
                )}
                {can("contacts", "can_delete") && (
                  <Trash2 className="w-3 h-3 cursor-pointer hover:text-red-500"
                    onClick={() => handleDeleteGroup(g.id)} />
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="bg-card border-b border-border px-6 py-2 flex items-center justify-between min-h-[40px]">
        <span className="text-xs font-medium text-foreground tabular-nums">{`${filtered.length} items`}</span>
      </div>

      {/* Main: split or full */}
      <div className="flex bg-card" ref={splitWrapRef}>
        {splitMode === "files" && filesContact && (
          <>
            <div style={{ width: `${filesPct}%`, minWidth: 260, maxWidth: "55%" }} className="min-w-0 flex flex-col shrink-0">
              <ContactFilesViewer contact={filesContact} onClose={closeSplit} />
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
              contact={splitContact}
              group={splitGroup}
              fileCount={splitContact ? fileCountFor(splitContact) : 0}
              onClose={closeSplit}
              onEdit={(c) => openEdit(c)}
              onPrev={() => navSplit(-1)}
              onNext={() => navSplit(1)}
            />
          </div>
          </>
        )}
      </div>

      <PaginationFooter pagination={pagination} />

      {mergeModal && selectedIds.size === 2 && (() => {
        const [idA, idB] = [...selectedIds];
        const cA = contacts.find(c => c.id === idA);
        const cB = contacts.find(c => c.id === idB);
        if (!cA || !cB) return null;
        return (
          <MergeContactsModal
            open={mergeModal}
            contacts={[cA, cB]}
            onClose={() => setMergeModal(false)}
            onDone={(survivingId) => {
              setMergeModal(false);
              setSelectedIds(new Set());
              load();
              navigate(`/contacts/${survivingId}`);
            }}
          />
        );
      })()}

      <ContactFormModal
        open={contactModal}
        onClose={() => { setContactModal(false); setEditing(null); }}
        onSave={handleSaveContact}
        contact={editing}
        groups={groups}
      />
      <GroupModal
        open={groupModal}
        onClose={() => { setGroupModal(false); setEditingGroup(null); }}
        onSave={handleSaveGroup}
        group={editingGroup}
      />
    </div>
  );
}