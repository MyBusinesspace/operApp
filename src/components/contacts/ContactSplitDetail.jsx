import React from "react";
import { X, ChevronUp, ChevronDown, Pencil, Paperclip, Mail, Phone, MapPin, Globe, Building2, Tag, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const TYPE_STYLES = {
  Customer: "bg-indigo-100 text-indigo-700",
  Provider: "bg-violet-100 text-violet-700",
  Both: "bg-emerald-100 text-emerald-700",
  Contact: "bg-zinc-100 text-zinc-600",
};

const STATUS_STYLES = {
  Active: "bg-emerald-100 text-emerald-700",
  Inactive: "bg-amber-100 text-amber-700",
  Archived: "bg-zinc-100 text-zinc-500",
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

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function ContactSplitDetail({ contact, group, fileCount = 0, onClose, onEdit, onPrev, onNext }) {
  if (!contact) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Select a company to preview
      </div>
    );
  }

  const displayName = contact.company || contact.full_name;

  return (
    <div className="flex flex-col h-full bg-card border-l border-border min-w-0">
      {/* Action bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Files ({fileCount})
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onEdit?.(contact)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrev} title="Previous">
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext} title="Next">
            <ChevronDown className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3 mb-1">
            <Avatar className="w-14 h-14 shrink-0">
              {contact.avatar_url
                ? <img src={contact.avatar_url} alt={displayName} className="object-cover" />
                : <AvatarFallback className={`${avatarColor(displayName)} text-white font-semibold`}>{initials(displayName)}</AvatarFallback>}
            </Avatar>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground truncate">{displayName}</h2>
              {contact.company && contact.full_name && (
                <p className="text-sm text-muted-foreground truncate">{contact.full_name}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${TYPE_STYLES[contact.type] || TYPE_STYLES.Contact}`}>
                  {contact.type || "Contact"}
                </span>
                <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[contact.status] || STATUS_STYLES.Active}`}>
                  {contact.status || "Active"}
                </span>
                {group && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: (group.color || "#6366f1") + "22", color: group.color || "#6366f1" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: group.color || "#6366f1" }} />
                    {group.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div className="px-6 py-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm border-b border-border">
          <InfoRow icon={Tag} label="Reference" value={contact.reference} />
          <InfoRow icon={Building2} label="Company" value={contact.company} />
          <InfoRow icon={Mail} label="Email" value={contact.email} />
          <InfoRow icon={Phone} label="Phone" value={contact.phone} />
          <InfoRow icon={MapPin} label="City" value={contact.city} />
          <InfoRow icon={MapPin} label="Country" value={contact.country} />
          <InfoRow icon={Globe} label="Website" value={contact.website} />
          <InfoRow icon={Users} label="Contact persons" value={(contact.contact_persons || []).length} />
        </div>

        {/* Address */}
        {contact.address && (
          <div className="px-6 py-3 border-b border-border">
            <p className="text-xs text-muted-foreground mb-1">Address</p>
            <p className="text-sm text-foreground">{contact.address}</p>
          </div>
        )}

        {/* Notes */}
        {contact.notes && (
          <div className="px-6 py-3">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}