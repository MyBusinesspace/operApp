import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * Resolves a Google Maps URL (including short links like maps.app.goo.gl / goo.gl)
 * into lat/lng coordinates by following HTTP redirects server-side, then parsing
 * the final expanded URL.
 *
 * Body: { url: string }
 * Returns: { lat, lng } | { error }
 */

const PATTERNS = [
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  /\/place\/[^/]+\/@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /%2C(-?\d+\.\d+)%2C(-?\d+\.\d+)/,
];

function parseCoords(text) {
  for (const re of PATTERNS) {
    const m = text.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body;
    try { body = await req.json(); }
    catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const url = (body?.url || '').trim();
    if (!url) return Response.json({ error: 'URL required' }, { status: 400 });

    // Try parsing directly first (handles full maps URLs without redirects)
    const direct = parseCoords(url);
    if (direct) return Response.json(direct);

    // Short link / redirect needed — resolve server-side
    let finalUrl = url;
    try {
      // Follow up to 10 redirects manually
      let current = url;
      for (let i = 0; i < 10; i++) {
        const res = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OperApp360/1.0)' },
        });
        const loc = res.headers.get('location');
        if (loc && (res.status === 301 || res.status === 302 || res.status === 303 || res.status === 307 || res.status === 308)) {
          finalUrl = loc.startsWith('http') ? loc : new URL(loc, current).href;
          current = finalUrl;
          continue;
        }
        // No more redirects — read body for embedded coords
        const text = await res.text();
        // Parse from URL and from body (Google embeds coords in page source)
        const fromBody = parseCoords(text) || parseCoords(finalUrl) || parseCoords(decodeURIComponent(text));
        if (fromBody) return Response.json(fromBody);
        break;
      }
    } catch (_) {
      // fall through
    }

    const fromFinal = parseCoords(finalUrl) || parseCoords(decodeURIComponent(finalUrl));
    if (fromFinal) return Response.json(fromFinal);

    return Response.json({ error: 'Could not extract coordinates' }, { status: 422 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});