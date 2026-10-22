/**
 * Single entry point for the Base44-compatible API, so the whole surface
 * (entities, backend functions, OAuth) costs one serverless function.
 *
 * Handles:
 *   /api/apps/:appId/entities/...
 *   /api/apps/:appId/functions/:name
 *   /api/apps/auth/login | /api/apps/auth/callback
 */
import { sendWebResponse, toWebRequest } from "../packages/base44-server/node-adapter.js";
import { routeApiRequest } from "../packages/base44-server/runtime.js";

export default async function handler(req, res) {
  try {
    const request = await toWebRequest(req);
    const response = await routeApiRequest(request);

    if (!response) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `No route for ${req.url}` }));
      return;
    }

    await sendWebResponse(res, response);
  } catch (error) {
    console.error("[api] Unhandled error", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error?.message || "Internal error" }));
  }
}
