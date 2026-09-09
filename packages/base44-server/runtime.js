/**
 * Runtime shims that let the exported Base44 backend functions run unmodified on
 * Vercel's Node runtime:
 *
 *   - `Deno.serve(handler)` / `Deno.env.get(...)` are emulated.
 *   - `fetch()` calls to Base44 hosts are served in-process by this deployment,
 *     so the platform-API fallbacks inside those functions hit Supabase data
 *     instead of the old Base44 project.
 *
 * Importing this module installs the shims; it must be imported before any
 * bundled function module is loaded.
 */
import { env } from "./env.js";
import { handleEntityRequest } from "./rest.js";

const BASE44_HOST_PATTERN = /(^|\.)base44\.(app|com)$/i;

let capturedHandler = null;

function installDenoShim() {
  if (globalThis.Deno?.__operappShim) return;

  globalThis.Deno = {
    __operappShim: true,
    env: {
      get: (key) => process.env[key],
      set: (key, value) => {
        process.env[key] = value;
      },
      has: (key) => key in process.env,
      toObject: () => ({ ...process.env }),
    },
    serve(optionsOrHandler, maybeHandler) {
      capturedHandler =
        typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler;
      return {
        finished: Promise.resolve(),
        shutdown: async () => {},
        ref() {},
        unref() {},
      };
    },
    exit() {},
  };
}

export function takeCapturedHandler() {
  const handler = capturedHandler;
  capturedHandler = null;
  return handler;
}

function installFetchShim() {
  if (globalThis.fetch?.__operappShim) return;
  const originalFetch = globalThis.fetch.bind(globalThis);

  const patched = async (input, init) => {
    const request = input instanceof Request && !init ? input : new Request(input, init);
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return originalFetch(input, init);
    }

    if (!BASE44_HOST_PATTERN.test(url.hostname) || env("BASE44_PASSTHROUGH") === "1") {
      return originalFetch(input, init);
    }

    const local = await routeApiRequest(request);
    return (
      local ||
      new Response(JSON.stringify({ error: `Not handled locally: ${url.pathname}` }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );
  };

  patched.__operappShim = true;
  globalThis.fetch = patched;
}

installDenoShim();
installFetchShim();

/** Lazily loaded so a cold start only compiles the function being called. */
async function loadFunctionHandler(name) {
  const { functionModules } = await import("./generated/index.js");
  const loader = functionModules[name];
  if (!loader) return null;

  const module = await loader();
  if (typeof module.default === "function") return module.default;
  return takeCapturedHandler();
}

const handlerCache = new Map();
let loadChain = Promise.resolve();

function getFunctionHandler(name) {
  if (handlerCache.has(name)) return handlerCache.get(name);
  // Serialised: `Deno.serve` capture is global state, so one load at a time.
  const pending = loadChain.then(() => loadFunctionHandler(name));
  loadChain = pending.catch(() => {});
  handlerCache.set(name, pending);
  return pending;
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Routes a Base44-shaped API request. Returns null when the path is unknown.
 * Shared by the public /api route and the fetch shim.
 */
export async function routeApiRequest(request) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");

  // api / apps / <appId> / (entities|functions) / ...
  if (parts[0] !== "api" || parts[1] !== "apps") return null;

  if (parts[2] === "auth") {
    const { handleAuthRequest } = await import("./oauth.js");
    return handleAuthRequest(request, parts.slice(3));
  }

  const kind = parts[3];
  const rest = parts.slice(4);

  if (kind === "entities") {
    return handleEntityRequest(request, rest);
  }

  if (kind === "functions") {
    const name = rest[0];
    if (!name) return jsonResponse({ error: "Missing function name" }, 404);
    // Action only — the query string can carry access tokens.
    console.log("[api] function", name, url.searchParams.get("action") || "");
    const handler = await getFunctionHandler(name);
    if (!handler) {
      handlerCache.delete(name);
      return jsonResponse({ error: `Unknown function: ${name}` }, 404);
    }
    return handler(request);
  }

  return null;
}
