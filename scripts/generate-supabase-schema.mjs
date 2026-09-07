/**
 * Generates supabase/migrations/00001_init.sql from base44/entities/*.jsonc
 * Preserves entity field names; maps PascalCase entity → snake_case table.
 *
 * Usage: node scripts/generate-supabase-schema.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const entitiesDir = path.join(root, "base44", "entities");
const outDir = path.join(root, "supabase", "migrations");
const outFile = path.join(outDir, "00001_init.sql");

function parseJsonc(raw) {
  // Strip // and /* */ comments, then trailing commas
  const noComments = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(noComments.replace(/,\s*([}\]])/g, "$1"));
}

function entityToTable(entityName) {
  if (entityName === "User") return "users";
  return entityName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function sqlType(prop) {
  if (!prop) return "text";
  if (prop.type === "number") return "double precision";
  if (prop.type === "boolean") return "boolean";
  if (prop.type === "array" || prop.type === "object") return "jsonb";
  if (prop.type === "string" && prop.format === "date") return "date";
  if (prop.type === "string" && prop.format === "date-time") return "timestamptz";
  return "text";
}

function defaultClause(prop, colType) {
  if (prop?.default === undefined) return "";
  const d = prop.default;
  if (d === null) return " DEFAULT NULL";
  if (colType === "boolean") return ` DEFAULT ${d ? "true" : "false"}`;
  if (colType === "double precision") return ` DEFAULT ${Number(d)}`;
  if (colType === "jsonb") return ` DEFAULT '${JSON.stringify(d)}'::jsonb`;
  return ` DEFAULT '${String(d).replace(/'/g, "''")}'`;
}

const files = fs
  .readdirSync(entitiesDir)
  .filter((f) => f.endsWith(".jsonc"))
  .sort();

const lines = [];
lines.push(`-- Auto-generated from base44/entities — do not edit by hand`);
lines.push(`-- Regenerated: ${new Date().toISOString()}`);
lines.push(`-- Tables mirror Base44 entity schemas (field names preserved)`);
lines.push(``);
lines.push(`create extension if not exists "pgcrypto";`);
lines.push(``);
lines.push(`-- Shared updated_date trigger`);
lines.push(`create or replace function public.set_updated_date()`);
lines.push(`returns trigger as $$`);
lines.push(`begin`);
lines.push(`  new.updated_date = now();`);
lines.push(`  return new;`);
lines.push(`end;`);
lines.push(`$$ language plpgsql;`);
lines.push(``);

const tableNames = [];

for (const file of files) {
  const schema = parseJsonc(fs.readFileSync(path.join(entitiesDir, file), "utf8"));
  const entityName = schema.name || path.basename(file, ".jsonc");
  const table = entityToTable(entityName);
  tableNames.push({ entityName, table });

  lines.push(`-- Entity: ${entityName}`);
  lines.push(`create table if not exists public.${table} (`);
  lines.push(`  id text primary key,`);
  lines.push(`  created_date timestamptz not null default now(),`);
  lines.push(`  updated_date timestamptz not null default now(),`);
  lines.push(`  created_by text,`);
  lines.push(`  created_by_id text,`);
  lines.push(`  is_sample boolean default false,`);

  const props = schema.properties || {};
  const cols = Object.entries(props);
  cols.forEach(([name, prop]) => {
    // Avoid duplicating system columns if an entity redefined them
    if (["id", "created_date", "updated_date", "created_by", "created_by_id", "is_sample"].includes(name)) {
      return;
    }
    const colType = sqlType(prop);
    // Soften NOT NULL for migration flexibility except keep semantic defaults
    let propForDefault = prop;
    if (table === "users" && name === "role" && prop.default === undefined) {
      propForDefault = { ...prop, default: "user" };
    }
    const required =
      Array.isArray(schema.required) &&
      schema.required.includes(name) &&
      propForDefault.default === undefined;
    const nullability = required ? " not null" : "";
    const def = defaultClause(propForDefault, colType);
    lines.push(`  ${name} ${colType}${nullability}${def},`);
  });

  // Extra profile helpers on users (auth.me mapping) — additive, not removing schema fields
  if (table === "users") {
    if (!props.email) lines.push(`  email text,`);
    if (!props.full_name) lines.push(`  full_name text,`);
  }

  // Remove trailing comma from last column line
  // Find last property line and strip comma — simpler: close with system note
  // Fix: rewrite last column without trailing issues by post-process
  lines.push(`  unused_compat_placeholder boolean`); // will remove
  lines.push(`);`);
  lines.push(``);
}

// Post-process: remove unused_compat_placeholder lines and fix commas
let sql = lines.join("\n");
sql = sql.replace(/,\n  unused_compat_placeholder boolean\n\);/g, "\n);");

const footer = [];
footer.push(``);
footer.push(`-- updated_date triggers`);
for (const { table } of tableNames) {
  footer.push(`drop trigger if exists ${table}_set_updated_date on public.${table};`);
  footer.push(`create trigger ${table}_set_updated_date before update on public.${table}`);
  footer.push(`for each row execute function public.set_updated_date();`);
}
footer.push(``);
footer.push(`-- Basic indexes on common foreign-key style fields`);
for (const { table } of tableNames) {
  footer.push(`create index if not exists ${table}_created_date_idx on public.${table} (created_date desc);`);
  footer.push(`create index if not exists ${table}_created_by_id_idx on public.${table} (created_by_id);`);
}
footer.push(``);
footer.push(`-- Enable RLS (policies: authenticated full access for migration phase)`);
for (const { table } of tableNames) {
  footer.push(`alter table public.${table} enable row level security;`);
  footer.push(`drop policy if exists ${table}_authenticated_all on public.${table};`);
  footer.push(`create policy ${table}_authenticated_all on public.${table}`);
  footer.push(`  for all to authenticated using (true) with check (true);`);
}
footer.push(``);
footer.push(`-- Storage bucket for UploadFile compat`);
footer.push(`insert into storage.buckets (id, name, public)`);
footer.push(`values ('uploads', 'uploads', true)`);
footer.push(`on conflict (id) do nothing;`);
footer.push(``);
footer.push(`drop policy if exists uploads_public_read on storage.objects;`);
footer.push(`create policy uploads_public_read on storage.objects`);
footer.push(`  for select using (bucket_id = 'uploads');`);
footer.push(``);
footer.push(`drop policy if exists uploads_authenticated_write on storage.objects;`);
footer.push(`create policy uploads_authenticated_write on storage.objects`);
footer.push(`  for insert to authenticated with check (bucket_id = 'uploads');`);
footer.push(``);
footer.push(`drop policy if exists uploads_authenticated_update on storage.objects;`);
footer.push(`create policy uploads_authenticated_update on storage.objects`);
footer.push(`  for update to authenticated using (bucket_id = 'uploads');`);
footer.push(``);

// Entity → table map as SQL comment for reference
footer.push(`-- Entity to table map:`);
for (const { entityName, table } of tableNames) {
  footer.push(`--   ${entityName} -> ${table}`);
}
footer.push(``);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, sql + footer.join("\n"), "utf8");

// Also write JSON map for the compat layer / docs
const mapFile = path.join(root, "packages", "base44-compat", "entity-table-map.json");
const map = Object.fromEntries(tableNames.map(({ entityName, table }) => [entityName, table]));
fs.writeFileSync(mapFile, JSON.stringify(map, null, 2) + "\n", "utf8");

console.log(`Wrote ${outFile}`);
console.log(`Wrote ${mapFile}`);
console.log(`Tables: ${tableNames.length}`);
