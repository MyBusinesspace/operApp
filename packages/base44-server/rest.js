/**
 * Base44-compatible entity REST endpoints:
 *   GET    /api/apps/:appId/entities/:Entity?q=&sort=&limit=&skip=&fields=
 *   GET    /api/apps/:appId/entities/:Entity/:id
 *   GET    /api/apps/:appId/entities/User/me
 *   POST   /api/apps/:appId/entities/:Entity
 *   PUT|PATCH /api/apps/:appId/entities/:Entity/:id
 *   DELETE /api/apps/:appId/entities/:Entity/:id
 *
 * Same paths and payload shapes the Base44 platform serves, so existing clients
 * (mobile app, exported backend functions) only need a different host.
 */
import { resolveUser } from "./auth.js";
import { createEntitiesModule } from "./entities.js";
import { env } from "./env.js";
import { bearerToken } from "./sdk.js";
import { getServiceClient, getUserClient } from "./supabase.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function apiKeyIsValid(request) {
  const expected = env("API_KEY");
  if (!expected) return false;
  const provided =
    request.headers.get("api_key") || request.headers.get("api-key") || "";
  return provided === expected;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * @param segments path parts after `/entities`, e.g. ["Employee", "abc123"]
 */
export async function handleEntityRequest(request, segments) {
  const [entityName, ...rest] = segments;
  if (!entityName) return json({ error: "Missing entity name" }, 404);

  const token = bearerToken(request);
  const user = await resolveUser(token);
  const serviceAccess = apiKeyIsValid(request);
  if (!user && !serviceAccess) {
    return json({ error: "Unauthorized" }, 401);
  }

  const client = serviceAccess ? getServiceClient() : getUserClient(token);
  const entities = createEntitiesModule(client, user);
  const entity = entities[entityName];
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const id = rest[0];

  try {
    if (method === "GET" && entityName === "User" && id === "me") {
      if (!user) return json({ error: "Unauthorized" }, 401);
      return json(user);
    }

    if (method === "GET" && id) {
      return json(await entity.get(id));
    }

    if (method === "GET") {
      const filter = parseJson(url.searchParams.get("q"), null);
      const sort = url.searchParams.get("sort") || undefined;
      const limit = Number(url.searchParams.get("limit") || 100);
      const skip = Number(url.searchParams.get("skip") || 0);
      const fields = url.searchParams.get("fields")?.split(",").filter(Boolean);
      const rows = filter
        ? await entity.filter(filter, sort, limit, skip, fields)
        : await entity.list(sort, limit, skip, fields);
      return json(rows);
    }

    if (method === "POST") {
      const body = await readBody(request);
      if (Array.isArray(body)) return json(await entity.bulkCreate(body), 201);
      if (!body) return json({ error: "Missing request body" }, 400);
      return json(await entity.create(body), 201);
    }

    if ((method === "PUT" || method === "PATCH") && id) {
      const body = await readBody(request);
      if (!body) return json({ error: "Missing request body" }, 400);
      return json(await entity.update(id, body));
    }

    if (method === "DELETE" && id) {
      return json(await entity.delete(id));
    }

    return json({ error: `Unsupported ${method} on ${entityName}` }, 405);
  } catch (error) {
    return json({ error: error?.message || String(error) }, error?.status || 400);
  }
}
