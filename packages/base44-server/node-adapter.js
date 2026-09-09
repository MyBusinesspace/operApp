/**
 * Bridges Vercel's Node request/response objects to the Web `Request`/`Response`
 * objects the Base44 functions are written against.
 */

async function rawBody(req) {
  // Vercel may have already parsed the body; rebuild it when it has.
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === "string") return Buffer.from(req.body);
    return Buffer.from(JSON.stringify(req.body));
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function requestOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${String(proto).split(",")[0]}://${String(host).split(",")[0]}`;
}

export async function toWebRequest(req) {
  const url = new URL(req.url, requestOrigin(req));
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value !== undefined) headers.set(key, String(value));
  }

  const method = (req.method || "GET").toUpperCase();
  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    const body = await rawBody(req);
    if (body !== undefined) {
      init.body = body;
      init.duplex = "half";
    }
  }

  return new Request(url, init);
}

export async function sendWebResponse(res, response) {
  res.statusCode = response.status;

  const setCookies = response.headers.getSetCookie?.() || [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });
  if (setCookies.length) res.setHeader("Set-Cookie", setCookies);

  if (!response.body) {
    res.end();
    return;
  }

  res.end(Buffer.from(await response.arrayBuffer()));
}
