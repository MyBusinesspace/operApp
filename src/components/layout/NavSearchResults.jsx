import React from "react";
import { Link } from "react-router-dom";

export default function NavSearchResults({ groups, searching, query, onSelect }) {
  const hasResults = groups.some(group => group.items.length > 0 || group.error);
  return (
    <div className="mt-2 max-h-[320px] overflow-y-auto bg-card rounded-xl border border-border shadow-lg" aria-live="polite">
      {searching && <p className="px-4 py-4 text-sm text-muted-foreground">Searching…</p>}
      {!searching && !hasResults && (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No results found for "{query}"</p>
      )}
      {groups.map(group => group.items.length > 0 || group.error ? (
        <div key={group.type}>
          <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
          {group.error && <p role="alert" className="px-4 py-2 text-sm text-destructive">Could not search {group.label.toLowerCase()}. Please try again.</p>}
          {group.items.map(item => (
            <Link key={item.id} to={item.path} onClick={onSelect} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/60 transition-colors">
              <div className="p-1.5 rounded-md text-primary bg-primary/10"><item.icon className="w-3.5 h-3.5" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                {item.sub && <p className="text-xs text-muted-foreground truncate">{item.sub}</p>}
              </div>
              <span className="text-xs text-muted-foreground capitalize">{item.type === "workOrder" ? "WO" : item.type}</span>
            </Link>
          ))}
        </div>
      ) : null)}
    </div>
  );
}