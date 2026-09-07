import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Users, Mail, Phone, Building2, Tag,
  Pencil, Trash2, FolderPlus, ChevronDown, ChevronRight, SlidersHorizontal,
  Upload, Download, Square, CheckSquare, Merge
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import GroupModal from "@/components/contacts/GroupModal";
import MergeContactsModal from "@/components/contacts/MergeContactsModal";
import { syncPrimaryContactPerson } from "@/lib/syncPrimaryContact";
import { useSortable } from "@/hooks/useSortable";
import { SortableTh } from "@/components/shared/SortIcon";
import { visibleKeys } from "@/lib/visibleColumns";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";

const TYPE_STYLES = {
  Customer: "bg-indigo-500/10 text-indigo-400",
  Provider: "bg-violet-500/10 text-violet-400",
  Both: "bg-emerald-500/10 text-emerald-400",
  Contact: "bg-zinc-500/10 text-zinc-400",
};

const STATUS_STYLES = {
  Active: "bg-emerald-500/10 text-emerald-400",
  Inactive: "bg-amber-500/10 text-amber-400",
  Archived: "bg-zinc-500/10 text-zinc-500",
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
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [contactModal, setContactModal] = useState(false);
  const [groupModal, setGroupModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});

  const load = async () => {
    setLoading(true);
    const [c, g] = await Promise.all([
      base44.entities.Contact.list("-created_date", 500),
      base44.entities.ContactGroup.list("name", 200),
    ]);
    setContacts(c);
    setGroups(g);
    setLoading(false);
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
        c.full_name, c.company, c.email, c.phone, c.reference, c.address,
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
    const matchType = filterType === "all" || c.type === filterType;
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
    reference: c => c.reference,
    email: c => c.email || c.phone,
    type: c => c.type,
    status: c => c.status,
    group_id: c => c.group_id,
    city: c => c.city || c.country,
    contact_persons: c => (c.contact_persons || []).length,
  });

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
    await Promise.all([...selectedIds].map(id => base44.entities.Contact.delete(id).catch(() => {})));
    setSelectedIds(new Set());
    setDeleting(false);
    load();
  };

  const openEdit = (c) => { setEditing(c); setContactModal(true); };
  const openAdd = () => { setEditing(null); setContactModal(true); };



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

  // Stats
  const stats = [
    { label: "Total", value: contacts.length, color: "text-foreground" },
    { label: "Customers", value: contacts.filter(c => c.type === "Customer" || c.type === "Both").length, color: "text-blue-600" },
    { label: "Providers", value: contacts.filter(c => c.type === "Provider" || c.type === "Both").length, color: "text-violet-600" },
    { label: "Groups", value: groups.length, color: "text-indigo-600" },
  ];

  const renderRow = (c) => (
    <motion.tr
      key={c.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`border-b border-border hover:bg-muted/30 transition-colors group ${selectedIds.has(c.id) ? "bg-primary/5" : ""}`}
    >
      <td className="px-3 py-3 w-10" onClick={e => toggleSelect(c.id, e)}>
        {selectedIds.has(c.id)
          ? <CheckSquare className="w-4 h-4 text-primary" />
          : <Square className="w-4 h-4 text-muted-foreground" />}
      </td>
      {vis.has("reference") && (
      <td className="px-4 py-3 hidden sm:table-cell cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
        {c.reference
          ? <span className="font-mono text-xs text-primary font-medium">{c.reference}</span>
          : <span className="text-xs text-muted-foreground/30">—</span>}
      </td>
      )}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
          <Avatar className="w-9 h-9 shrink-0">
            {c.avatar_url
              ? <img src={c.avatar_url} alt={c.company || c.full_name} className="object-cover" />
              :               <AvatarFallback className={`${avatarColor(c.company || c.full_name)} text-white font-semibold text-xs`}>
                  {initials(c.company || c.full_name)}
                </AvatarFallback>
            }
          </Avatar>
          <div>
            <p className="text-sm font-semibold text-foreground leading-tight hover:text-primary transition-colors">
              {c.company || c.full_name}
            </p>
            {c.company && c.full_name && (
              <p className="text-xs text-muted-foreground">{c.full_name}</p>
            )}
          </div>
        </div>
      </td>
      {vis.has("email") && (
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
      {vis.has("type") && (
      <td className="px-4 py-3 hidden md:table-cell">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${TYPE_STYLES[c.type] || TYPE_STYLES.Contact}`}>
          {c.type || "Contact"}
        </span>
      </td>
      )}
      {vis.has("status") && (
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[c.status] || STATUS_STYLES.Active}`}>
          {c.status || "Active"}
        </span>
      </td>
      )}
      {vis.has("group_id") && (
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
      {vis.has("city") && (
      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
        {c.city}{c.city && c.country ? ", " : ""}{c.country}
      </td>
      )}
      {vis.has("contact_persons") && (
      <td className="px-4 py-3 hidden xl:table-cell">
        {(c.contact_persons || []).length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3 h-3 shrink-0" />
            <span>{c.contact_persons.length}</span>
          </div>
        )}
      </td>
      )}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteContact(c.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </td>
    </motion.tr>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="space-y-5 max-w-[1200px] mx-auto px-6 py-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground" style={{ letterSpacing: "-0.02em" }}>Companies</h1>
          <p className="text-sm text-muted-foreground mt-1">Customers, providers & company groups</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Import */}
          <label className="cursor-pointer">
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-border bg-card hover:bg-accent transition-colors">
              <Upload className="w-3.5 h-3.5" /> Import
            </span>
          </label>
          {/* Export */}
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button variant="outline" size="sm" className="gap-2"
            onClick={() => { setEditingGroup(null); setGroupModal(true); }}>
            <FolderPlus className="w-4 h-4" /> New Group
          </Button>
          <Button className="gap-2 shadow-sm" onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Company
          </Button>
        </div>
      </motion.div>

      {/* Status tab bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        className="flex flex-wrap gap-1 border-b border-border pb-0">
        {[
          { key: "all", label: "All", count: contacts.length },
          { key: "Active", label: "Active", count: contacts.filter(c => c.status === "Active").length },
          { key: "Inactive", label: "Inactive", count: contacts.filter(c => c.status === "Inactive").length },
          { key: "Archived", label: "Archived", count: contacts.filter(c => c.status === "Archived").length },
        ].filter(tab => tab.key === "all" || tab.count > 0).map(tab => (
          <button key={tab.key} onClick={() => setFilterStatus(tab.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
              filterStatus === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tab.label} <span className="ml-1 text-xs">{tab.count}</span>
          </button>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}
        className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search name, email, company..." className="pl-9 text-foreground placeholder:text-muted-foreground" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {["Customer","Provider","Both","Contact"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
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
      </motion.div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">{selectedIds.size} company{selectedIds.size > 1 ? "s" : ""} selected</span>
          {selectedIds.size === 2 && (
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs border-primary/40 text-primary hover:bg-primary/5" onClick={() => setMergeModal(true)}>
              <Merge className="w-3.5 h-3.5" /> Merge Duplicates
            </Button>
          )}
          <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs ml-auto" disabled={deleting} onClick={handleDeleteSelected}>
            <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Deleting..." : "Delete Selected"}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>Cancel</Button>
        </div>
      )}

      {/* Groups management row */}
      {groups.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          className="flex flex-wrap gap-2">
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
                <Pencil className="w-3 h-3 cursor-pointer hover:opacity-100"
                  onClick={() => { setEditingGroup(g); setGroupModal(true); }} />
                <Trash2 className="w-3 h-3 cursor-pointer hover:text-red-500"
                  onClick={() => handleDeleteGroup(g.id)} />
              </span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
        className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading companies...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No companies found</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search || filterType !== "all" || filterStatus !== "all" || filterGroup !== "all"
                ? "Try adjusting your filters."
                : "Add your first company to get started."}
            </p>
            {!search && filterType === "all" && filterStatus === "all" && filterGroup === "all" && (
              <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Company</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="w-10 px-3 py-3 cursor-pointer" onClick={toggleSelectAll}>
                    {filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))
                      ? <CheckSquare className="w-4 h-4 text-primary" />
                      : <Square className="w-4 h-4 text-muted-foreground" />}
                  </th>
                  {[
                    { key: "reference", label: "Reference", cls: "hidden sm:table-cell w-28" },
                    { key: "full_name", label: "Company", cls: "" },
                    { key: "email", label: "Contact Info", cls: "" },
                    { key: "type", label: "Category", cls: "hidden md:table-cell" },
                    { key: "status", label: "Status", cls: "hidden lg:table-cell" },
                    { key: "group_id", label: "Group", cls: "hidden xl:table-cell" },
                    { key: "city", label: "Location", cls: "hidden lg:table-cell" },
                    { key: "contact_persons", label: "Persons", cls: "hidden xl:table-cell" },
                  ].filter(col => col.key === "full_name" || vis.has(col.key)).map(col => (
                    <SortableTh key={col.key} colKey={col.key} label={col.label} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className={col.cls} />
                  ))}
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {/* Grouped rows */}
                {sortedGrouped.byGroup.map(({ group: g, contacts: gc }) => (
                  <React.Fragment key={g.id}>
                    <tr
                      className="border-b border-border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => toggleGroup(g.id)}
                    >
                      <td colSpan={10} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {expandedGroups[g.id] === false
                            ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          }
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                          <span className="text-sm font-semibold" style={{ color: g.color }}>{g.name}</span>
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
                    <td colSpan={10} className="px-4 py-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ungrouped ({sortedGrouped.noGroup.length})</span>
                    </td>
                  </tr>
                )}
                {sortedGrouped.noGroup.map(c => renderRow(c))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

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
    </div>
  );
}