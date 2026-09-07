import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Mail, Phone, Users, Pencil, Trash2, Download, Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";

const STATUS_STYLES = {
  Active: "bg-emerald-50 text-emerald-600",
  Inactive: "bg-amber-50 text-amber-600",
  Archived: "bg-slate-100 text-slate-400",
};

function initials(name) {
  return (name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}
function avatarColor(str) {
  const palette = ["bg-indigo-200","bg-sky-200","bg-emerald-200","bg-amber-200","bg-rose-200","bg-purple-200","bg-teal-200"];
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = (h * 31 + str.charCodeAt(i)) % palette.length;
  return palette[h];
}

export default function Customers() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    const [all, g] = await Promise.all([
      base44.entities.Contact.list("-created_date", 500),
      base44.entities.ContactGroup.list("name", 200),
    ]);
    // Only customers (type Customer or Both)
    setContacts(all.filter(c => c.type === "Customer" || c.type === "Both"));
    setGroups(g);
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
    // Force type to Customer if creating new
    const data = editing ? form : { ...form, type: form.type || "Customer" };
    if (editing) await base44.entities.Contact.update(editing.id, data);
    else await base44.entities.Contact.create(data);
    setModal(false);
    setEditing(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this customer?")) return;
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
    const a = document.createElement("a"); a.href = url; a.download = "customers.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Customers</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your customer accounts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button className="gap-2 shadow-sm" onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Customer
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Customers", value: contacts.length, color: "text-blue-600" },
          { label: "Active", value: contacts.filter(c => c.status === "Active" || !c.status).length, color: "text-emerald-600" },
          { label: "Inactive / Archived", value: contacts.filter(c => c.status === "Inactive" || c.status === "Archived").length, color: "text-amber-600" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}
        className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search name, email, company..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["Active","Inactive","Archived"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
        className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading customers...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No customers found</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search || filterStatus !== "all" ? "Try adjusting your filters." : "Add your first customer to get started."}
            </p>
            {!search && filterStatus === "all" && (
              <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Customer</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact Info</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Tax ID</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map(c => (
                  <tr key={c.id} className="border-b border-border hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                        <Avatar className="w-9 h-9 shrink-0">
                          {c.avatar_url
                            ? <img src={c.avatar_url} alt={c.company || c.full_name} className="object-cover" />
                            : <AvatarFallback className={`${avatarColor(c.company || c.full_name)} text-slate-700 font-semibold text-xs`}>
                                {initials(c.company || c.full_name)}
                              </AvatarFallback>
                          }
                        </Avatar>
                        <div>
                          <p className="text-sm font-semibold hover:text-primary transition-colors">
                            {c.company || c.full_name}
                          </p>
                          {c.company && c.full_name !== c.company && (
                            <p className="text-xs text-muted-foreground">{c.full_name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {c.email && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="w-3 h-3 shrink-0" /><span className="truncate max-w-[160px]">{c.email}</span>
                          </div>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="w-3 h-3 shrink-0" /><span>{c.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[c.status] || STATUS_STYLES.Active}`}>
                        {c.status || "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {c.city}{c.city && c.country ? ", " : ""}{c.country}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-xs text-muted-foreground">
                      {c.tax_id || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <PaginationFooter pagination={pagination} />

      <ContactFormModal
        open={modal}
        onClose={() => { setModal(false); setEditing(null); }}
        onSave={handleSave}
        contact={editing}
        groups={groups}
      />
    </div>
  );
}