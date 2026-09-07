import { getSupabase, entityToTable } from "../supabase.js";
import { toBase44Error } from "../utils/errors.js";
import {
  applyEntityFilter,
  applySort,
  unwrapUpdatePayload,
  stampCreate,
  stampUpdate,
  rowMatchesFilter,
} from "../query.js";

async function currentUserLite() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
    };
  } catch {
    return null;
  }
}

function throwIfError(error, fallbackMessage) {
  if (!error) return;
  throw toBase44Error(
    {
      message: error.message || fallbackMessage,
      status: error.code === "PGRST116" ? 404 : 400,
      code: error.code || "DB_ERROR",
      data: error,
    },
    400
  );
}

function createEntityHandler(entityName) {
  const table = entityToTable(entityName);

  return {
    async list(sort, limit = 100, skip = 0, fields) {
      const supabase = getSupabase();
      let query = supabase.from(table).select(fields?.length ? fields.join(",") : "*");
      query = applySort(query, sort);
      if (skip) query = query.range(skip, skip + limit - 1);
      else query = query.limit(limit);
      const { data, error } = await query;
      throwIfError(error, `Failed to list ${entityName}`);
      return data || [];
    },

    async filter(filterQuery = {}, sort, limit = 100, skip = 0, fields) {
      const supabase = getSupabase();
      let query = supabase.from(table).select(fields?.length ? fields.join(",") : "*");
      const applied = applyEntityFilter(query, filterQuery);
      query = applySort(applied.query, sort);

      // When client-side post-filter is needed, fetch a wider page then filter.
      const fetchLimit = applied.postFilter ? Math.max(limit * 5, 500) : limit;
      if (skip && !applied.postFilter) query = query.range(skip, skip + limit - 1);
      else query = query.limit(fetchLimit);

      const { data, error } = await query;
      throwIfError(error, `Failed to filter ${entityName}`);
      let rows = data || [];
      if (applied.postFilter) {
        rows = applied.postFilter(rows);
        rows = rows.slice(skip || 0, (skip || 0) + limit);
      }
      return rows;
    },

    async get(id) {
      const supabase = getSupabase();
      const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
      throwIfError(error, `Failed to get ${entityName}`);
      if (!data) {
        throw toBase44Error(
          { message: "Not found", status: 404, code: "NOT_FOUND", data: { id } },
          404
        );
      }
      return data;
    },

    async create(payload) {
      const supabase = getSupabase();
      const user = await currentUserLite();
      const row = stampCreate(payload || {}, user);
      const { data, error } = await supabase.from(table).insert(row).select("*").single();
      throwIfError(error, `Failed to create ${entityName}`);
      return data;
    },

    async update(id, payload) {
      const supabase = getSupabase();
      const row = stampUpdate(unwrapUpdatePayload(payload || {}));
      const { data, error } = await supabase
        .from(table)
        .update(row)
        .eq("id", id)
        .select("*")
        .single();
      throwIfError(error, `Failed to update ${entityName}`);
      return data;
    },

    async delete(id) {
      const supabase = getSupabase();
      const { error } = await supabase.from(table).delete().eq("id", id);
      throwIfError(error, `Failed to delete ${entityName}`);
      return { success: true };
    },

    async bulkCreate(items = []) {
      const supabase = getSupabase();
      const user = await currentUserLite();
      const rows = (items || []).map((item) => stampCreate(item, user));
      const { data, error } = await supabase.from(table).insert(rows).select("*");
      throwIfError(error, `Failed to bulkCreate ${entityName}`);
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
      const supabase = getSupabase();
      const patch = stampUpdate(unwrapUpdatePayload(updatePayload));

      // Prefer server-side update when filter is simple equality-only.
      const keys = Object.keys(filterQuery || {}).filter((k) => !k.startsWith("$"));
      const simple =
        keys.length > 0 &&
        !filterQuery.$or &&
        !filterQuery.$and &&
        !filterQuery.$nor &&
        keys.every((k) => {
          const v = filterQuery[k];
          return v === null || ["string", "number", "boolean"].includes(typeof v);
        });

      if (simple) {
        let query = supabase.from(table).update(patch).select("id");
        for (const k of keys) {
          query =
            filterQuery[k] === null ? query.is(k, null) : query.eq(k, filterQuery[k]);
        }
        const { data, error } = await query;
        throwIfError(error, `Failed to updateMany ${entityName}`);
        return { success: true, updated: data?.length || 0, has_more: false };
      }

      const matches = await this.filter(filterQuery, undefined, 5000, 0, ["id"]);
      let updated = 0;
      for (const row of matches) {
        await this.update(row.id, patch);
        updated += 1;
      }
      return { success: true, updated, has_more: matches.length >= 5000 };
    },

    async deleteMany(filterQuery = {}) {
      const matches = await this.filter(filterQuery, undefined, 5000, 0, ["id"]);
      const supabase = getSupabase();
      if (!matches.length) return { success: true, deleted: 0 };
      const ids = matches.map((m) => m.id);
      const { error } = await supabase.from(table).delete().in("id", ids);
      throwIfError(error, `Failed to deleteMany ${entityName}`);
      return { success: true, deleted: ids.length };
    },

    subscribe(callback) {
      const supabase = getSupabase();
      const channel = supabase
        .channel(`entity:${table}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          (payload) => {
            const type =
              payload.eventType === "INSERT"
                ? "create"
                : payload.eventType === "DELETE"
                  ? "delete"
                  : "update";
            const data = payload.new && Object.keys(payload.new).length
              ? payload.new
              : payload.old;
            callback?.({
              type,
              data,
              id: data?.id,
              timestamp: new Date().toISOString(),
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    },
  };
}

export function createEntitiesModule() {
  return new Proxy(
    {},
    {
      get(_target, entityName) {
        if (typeof entityName !== "string" || entityName === "then") return undefined;
        return createEntityHandler(entityName);
      },
    }
  );
}

// Re-export for tests / advanced use
export { rowMatchesFilter };
