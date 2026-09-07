/**
 * Translate Base44 / Mongo-style filter objects into Supabase PostgREST filters.
 * Supports: equality, arrays ($in shorthand), $eq/$ne/$gt/$gte/$lt/$lte/$in/$nin/$exists,
 * root $or / $and (best-effort). Nested $or on same table uses `.or()`.
 */

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOperatorKeys(obj) {
  return Object.keys(obj).some((k) => k.startsWith("$"));
}

function applyFieldOperator(query, field, op, value) {
  switch (op) {
    case "$eq":
      return value === null ? query.is(field, null) : query.eq(field, value);
    case "$ne":
      return value === null ? query.not(field, "is", null) : query.neq(field, value);
    case "$gt":
      return query.gt(field, value);
    case "$gte":
      return query.gte(field, value);
    case "$lt":
      return query.lt(field, value);
    case "$lte":
      return query.lte(field, value);
    case "$in":
      return query.in(field, value ?? []);
    case "$nin":
      if (!Array.isArray(value) || value.length === 0) return query;
      return query.not(field, "in", `(${value.map((v) => JSON.stringify(v)).join(",")})`);
    case "$exists":
      return value ? query.not(field, "is", null) : query.is(field, null);
    case "$regex":
      return query.ilike(
        field,
        `%${String(value).replace(/^\^/, "").replace(/\$$/, "").replace(/\.\*/g, "%")}%`
      );
    case "$not":
      if (isPlainObject(value)) {
        // Limited support: $not: { $eq: x } → neq
        if ("$eq" in value) {
          return value.$eq === null
            ? query.not(field, "is", null)
            : query.neq(field, value.$eq);
        }
      }
      console.warn(`[compat] Unsupported $not on ${field}`, value);
      return query;
    default:
      console.warn(`[compat] Unsupported operator ${op} on ${field}`);
      return query;
  }
}

function applyFieldFilter(query, field, value) {
  if (value === undefined) return query;
  if (Array.isArray(value)) {
    return query.in(field, value);
  }
  if (isPlainObject(value) && hasOperatorKeys(value)) {
    let q = query;
    for (const [op, opValue] of Object.entries(value)) {
      q = applyFieldOperator(q, field, op, opValue);
    }
    return q;
  }
  if (value === null) return query.is(field, null);
  return query.eq(field, value);
}

/**
 * Build a PostgREST `or` filter string from a list of simple equality filters.
 * Complex nested filters fall back to sequential client-side filtering.
 */
function simpleOrClause(filters) {
  const parts = [];
  for (const filter of filters) {
    const entries = Object.entries(filter || {}).filter(([k]) => !k.startsWith("$"));
    if (entries.length !== 1) return null;
    const [field, value] = entries[0];
    if (isPlainObject(value) || Array.isArray(value)) return null;
    if (value === null) parts.push(`${field}.is.null`);
    else parts.push(`${field}.eq.${value}`);
  }
  return parts.length ? parts.join(",") : null;
}

/**
 * Apply a Base44 filter query to a supabase-js query builder.
 * Returns { query, postFilter } where postFilter is an optional client-side fn.
 */
export function applyEntityFilter(query, filter = {}) {
  if (!filter || typeof filter !== "object") {
    return { query, postFilter: null };
  }

  let q = query;
  let postFilter = null;
  const pendingOr = filter.$or;
  const pendingAnd = filter.$and;
  const pendingNor = filter.$nor;

  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith("$")) continue;
    q = applyFieldFilter(q, key, value);
  }

  if (Array.isArray(pendingAnd) && pendingAnd.length) {
    for (const sub of pendingAnd) {
      const nested = applyEntityFilter(q, sub);
      q = nested.query;
      if (nested.postFilter) {
        const prev = postFilter;
        postFilter = (rows) => {
          const a = prev ? prev(rows) : rows;
          return nested.postFilter(a);
        };
      }
    }
  }

  if (Array.isArray(pendingOr) && pendingOr.length) {
    const clause = simpleOrClause(pendingOr);
    if (clause) {
      q = q.or(clause);
    } else {
      const prev = postFilter;
      postFilter = (rows) => {
        const base = prev ? prev(rows) : rows;
        return base.filter((row) =>
          pendingOr.some((sub) => rowMatchesFilter(row, sub))
        );
      };
    }
  }

  if (Array.isArray(pendingNor) && pendingNor.length) {
    const prev = postFilter;
    postFilter = (rows) => {
      const base = prev ? prev(rows) : rows;
      return base.filter((row) => !pendingNor.some((sub) => rowMatchesFilter(row, sub)));
    };
  }

  return { query: q, postFilter };
}

export function rowMatchesFilter(row, filter = {}) {
  if (!filter || typeof filter !== "object") return true;
  if (Array.isArray(filter.$and)) {
    if (!filter.$and.every((sub) => rowMatchesFilter(row, sub))) return false;
  }
  if (Array.isArray(filter.$or)) {
    if (!filter.$or.some((sub) => rowMatchesFilter(row, sub))) return false;
  }
  if (Array.isArray(filter.$nor)) {
    if (filter.$nor.some((sub) => rowMatchesFilter(row, sub))) return false;
  }

  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith("$")) continue;
    const cell = row[key];
    if (Array.isArray(value)) {
      if (!value.includes(cell)) return false;
      continue;
    }
    if (isPlainObject(value) && hasOperatorKeys(value)) {
      for (const [op, opValue] of Object.entries(value)) {
        switch (op) {
          case "$eq":
            if (cell !== opValue) return false;
            break;
          case "$ne":
            if (cell === opValue) return false;
            break;
          case "$gt":
            if (!(cell > opValue)) return false;
            break;
          case "$gte":
            if (!(cell >= opValue)) return false;
            break;
          case "$lt":
            if (!(cell < opValue)) return false;
            break;
          case "$lte":
            if (!(cell <= opValue)) return false;
            break;
          case "$in":
            if (!Array.isArray(opValue) || !opValue.includes(cell)) return false;
            break;
          case "$nin":
            if (Array.isArray(opValue) && opValue.includes(cell)) return false;
            break;
          case "$exists":
            if (opValue ? cell == null : cell != null) return false;
            break;
          default:
            break;
        }
      }
      continue;
    }
    if (cell !== value) return false;
  }
  return true;
}

export function applySort(query, sort) {
  if (!sort) return query;
  const desc = String(sort).startsWith("-");
  const field = String(sort).replace(/^[+-]/, "");
  if (!field) return query;
  return query.order(field, { ascending: !desc, nullsFirst: false });
}

export function unwrapUpdatePayload(payload = {}) {
  if (payload && typeof payload === "object" && payload.$set && isPlainObject(payload.$set)) {
    return { ...payload.$set };
  }
  const clean = { ...payload };
  delete clean.$set;
  delete clean.$unset;
  delete clean.$inc;
  return clean;
}

export function newEntityId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function stampCreate(data, user) {
  const now = new Date().toISOString();
  return {
    id: data.id || newEntityId(),
    ...data,
    created_date: data.created_date || now,
    updated_date: data.updated_date || now,
    created_by: data.created_by ?? user?.email ?? null,
    created_by_id: data.created_by_id ?? user?.id ?? null,
  };
}

export function stampUpdate(data) {
  return {
    ...data,
    updated_date: new Date().toISOString(),
  };
}
