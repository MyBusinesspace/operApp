/**
 * Entity CRUD with Base44 semantics, backed by Supabase.
 *
 * Shares the filter translation and value coercion used by the browser compat
 * layer so both surfaces behave identically.
 */
import {
  applyEntityFilter,
  applySort,
  stampCreate,
  stampUpdate,
  unwrapUpdatePayload,
} from "../base44-compat/query.js";
import { coerceRow } from "../base44-compat/coerce.js";
import { entityToTable } from "./supabase.js";

function fail(error, message) {
  if (!error) return;
  const err = new Error(`${message}: ${error.message || error}`);
  err.status = error.code === "PGRST116" ? 404 : 400;
  err.code = error.code;
  err.details = error.details;
  throw err;
}

function createEntityHandler(client, entityName, user) {
  const table = entityToTable(entityName);
  const select = (fields) => (fields?.length ? fields.join(",") : "*");
  // `user` may be a getter so that created_by picks up the caller once resolved.
  const caller = () => (typeof user === "function" ? user() : user);

  return {
    async list(sort, limit = 100, skip = 0, fields) {
      let query = client.from(table).select(select(fields));
      query = applySort(query, sort);
      if (skip) query = query.range(skip, skip + limit - 1);
      else query = query.limit(limit);
      const { data, error } = await query;
      fail(error, `Failed to list ${entityName}`);
      return data || [];
    },

    async filter(filterQuery = {}, sort, limit = 100, skip = 0, fields) {
      let query = client.from(table).select(select(fields));
      const applied = applyEntityFilter(query, filterQuery);
      query = applySort(applied.query, sort);

      const fetchLimit = applied.postFilter ? Math.max(limit * 5, 500) : limit;
      if (skip && !applied.postFilter) query = query.range(skip, skip + limit - 1);
      else query = query.limit(fetchLimit);

      const { data, error } = await query;
      fail(error, `Failed to filter ${entityName}`);
      let rows = data || [];
      if (applied.postFilter) {
        rows = applied.postFilter(rows).slice(skip || 0, (skip || 0) + limit);
      }
      return rows;
    },

    async get(id) {
      const { data, error } = await client.from(table).select("*").eq("id", id).maybeSingle();
      fail(error, `Failed to get ${entityName}`);
      if (!data) {
        const err = new Error(`${entityName} not found: ${id}`);
        err.status = 404;
        throw err;
      }
      return data;
    },

    async create(payload) {
      const row = coerceRow(entityName, stampCreate(payload || {}, caller()));
      const { data, error } = await client.from(table).insert(row).select("*").single();
      fail(error, `Failed to create ${entityName}`);
      return data;
    },

    async update(id, payload) {
      const row = coerceRow(entityName, stampUpdate(unwrapUpdatePayload(payload || {})));
      const { data, error } = await client
        .from(table)
        .update(row)
        .eq("id", id)
        .select("*")
        .single();
      fail(error, `Failed to update ${entityName}`);
      return data;
    },

    async delete(id) {
      const { error } = await client.from(table).delete().eq("id", id);
      fail(error, `Failed to delete ${entityName}`);
      return { success: true };
    },

    async bulkCreate(items = []) {
      const rows = (items || []).map((item) =>
        coerceRow(entityName, stampCreate(item, caller()))
      );
      if (!rows.length) return [];
      const { data, error } = await client.from(table).insert(rows).select("*");
      fail(error, `Failed to bulkCreate ${entityName}`);
      return data || [];
    },

    async bulkUpdate(items = []) {
      const results = [];
      for (const item of items || []) {
        const { id, ...rest } = item;
        if (!id) continue;
        results.push(await this.update(id, rest));
      }
      return results;
    },

    async updateMany(filterQuery = {}, updatePayload = {}) {
      const matches = await this.filter(filterQuery, undefined, 5000, 0, ["id"]);
      for (const row of matches) await this.update(row.id, updatePayload);
      return { success: true, updated: matches.length };
    },

    async deleteMany(filterQuery = {}) {
      const matches = await this.filter(filterQuery, undefined, 5000, 0, ["id"]);
      if (!matches.length) return { success: true, deleted: 0 };
      const { error } = await client
        .from(table)
        .delete()
        .in("id", matches.map((m) => m.id));
      fail(error, `Failed to deleteMany ${entityName}`);
      return { success: true, deleted: matches.length };
    },
  };
}

export function createEntitiesModule(client, user) {
  return new Proxy(
    {},
    {
      get(_target, entityName) {
        if (typeof entityName !== "string" || entityName === "then") return undefined;
        return createEntityHandler(client, entityName, user);
      },
    }
  );
}
