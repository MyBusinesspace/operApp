// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const MOBILE_AUTH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function json(data, status = 200) {
  return Response.json(data, { status });
}

const MOBILE_OAUTH_DEEP_LINK = 'operapp360://auth/callback';

/** Cached public HTML bridge URL (UploadPublicFile). Valid Base44 from_url — not /functions/. */
let cachedMobileOAuthBridgeUrl = '';

function mobileOAuthBridgeHtml() {
  // Runs on media.base44.com after Google → reads token → deep-links into the Auth Tab.
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Signing in…</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0b1020;color:#e8eef9}p{opacity:.8}</style>
</head><body><p>Completing sign-in…</p>
<script>
(function () {
  try {
    var hash = (location.hash || '').replace(/^#/, '');
    var q = (location.search || '').replace(/^\\?/, '');
    var params = new URLSearchParams(hash || q);
    var token = params.get('access_token') || params.get('token');
    var err = params.get('error') || params.get('error_description');
    var target;
    if (token) {
      target = 'operapp360://auth/callback?access_token=' + encodeURIComponent(token);
    } else {
      target = 'operapp360://auth/callback?error=' + encodeURIComponent(err || 'Missing access token after Google sign-in.');
    }
    location.replace(target);
  } catch (e) {
    location.replace('operapp360://auth/callback?error=' + encodeURIComponent(String(e && e.message || e)));
  }
})();
</script>
</body></html>`;
}

async function ensureMobileOAuthBridgeUrl(base44) {
  if (cachedMobileOAuthBridgeUrl) return cachedMobileOAuthBridgeUrl;

  const bytes = new TextEncoder().encode(mobileOAuthBridgeHtml());
  const file = new File([bytes], 'operapp360-mobile-oauth-bridge.html', {
    type: 'text/html;charset=utf-8',
  });
  const uploaded = await base44.asServiceRole.integrations.Core.UploadPublicFile({ file });
  const url = String(uploaded?.file_url || uploaded?.url || '').trim();
  if (!url) throw new Error('Could not publish mobile OAuth bridge HTML.');
  cachedMobileOAuthBridgeUrl = url;
  return url;
}

function mobileOAuthCallbackResponse(accessToken, oauthError) {
  // Auth Tab on Android cannot use HTTPS callbacks without Digital Asset Links
  // (RESULT_VERIFICATION_FAILED / code 2). Redirect to the app custom scheme instead.
  if (!accessToken) {
    const message = oauthError
      || 'Missing access token. Please sign in again from the mobile app.';
    const target = `${MOBILE_OAUTH_DEEP_LINK}?error=${encodeURIComponent(message)}`;
    return Response.redirect(target, 302);
  }
  const target = `${MOBILE_OAUTH_DEEP_LINK}?access_token=${encodeURIComponent(accessToken)}`;
  return Response.redirect(target, 302);
}

async function readJsonBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

const DEFAULT_APP_ID = '6a201f5ce89c0f167dbe847d';
const DEFAULT_API_KEY = 'ee5f1c81442c47568b95570e76b54da5';

function getAppId(req) {
  return req.headers.get('x-app-id')
    || req.headers.get('X-App-Id')
    || Deno.env.get('BASE44_APP_ID')
    || DEFAULT_APP_ID;
}

function getApiKey(req) {
  return req.headers.get('api_key')
    || req.headers.get('api-key')
    || Deno.env.get('BASE44_API_KEY')
    || DEFAULT_API_KEY;
}

function getSessionSecret(req) {
  return Deno.env.get('OTP_SECRET') || getAppId(req) || 'operapp360-mobile-session';
}

const DEFAULT_PLATFORM_OWNER_USER_ID = '6a201f5ce89c0f167dbe847e';

function getPlatformOwnerUserId() {
  return (Deno.env.get('PLATFORM_OWNER_USER_ID') || DEFAULT_PLATFORM_OWNER_USER_ID).trim();
}

function requirePlatformOwnerUserId() {
  const ownerId = getPlatformOwnerUserId();
  if (!ownerId) {
    throw new Error('PLATFORM_OWNER_USER_ID secret is required on apiAuth.');
  }
  return ownerId;
}

function base64UrlEncode(input) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : input;
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  const pad = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + pad).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function createSignedToken(req, payload) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(await hmacSign(body, getSessionSecret(req)));
  return `${body}.${signature}`;
}

async function verifySignedToken(req, token, { expiredMessage } = {}) {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid session token');

  const [body, signature] = parts;
  const expected = base64UrlEncode(await hmacSign(body, getSessionSecret(req)));
  if (signature !== expected) throw new Error('Invalid session token');

  const payload = JSON.parse(base64UrlDecode(body));
  if (!payload?.exp || Date.now() > payload.exp) {
    throw new Error(expiredMessage || 'Session has expired. Please sign in again.');
  }
  return payload;
}

async function hashOtp(otp, secret) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${otp}:${secret}`),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

async function createOtpSessionToken(req, payload) {
  return createSignedToken(req, payload);
}

async function verifyOtpSessionToken(req, token) {
  const payload = await verifySignedToken(req, token, {
    expiredMessage: 'OTP has expired. Please request a new code.',
  });
  if (payload.type !== 'otp' || !payload.employee_id) {
    throw new Error('Invalid OTP session.');
  }
  return payload;
}

function otpEmailBody(fullName, otp) {
  return `Hello ${fullName || 'there'},\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
}

async function sendOtpEmail(base44, { to, fullName, otp }) {
  const subject = 'Your verification code';
  const body = otpEmailBody(fullName, otp);
  try {
    await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body });
  } catch (err1) {
    try {
      await base44.integrations.Core.SendEmail({ to, subject, body });
    } catch (err2) {
      throw new Error(String(err2?.message || err1?.message || err2));
    }
  }
}

async function createMobileAuthToken(req, { employee_id, email }) {
  return createSignedToken(req, {
    type: 'mobile_auth',
    employee_id,
    email: normalizeEmail(email),
    owner_user_id: requirePlatformOwnerUserId(),
    exp: Date.now() + MOBILE_AUTH_TTL_MS,
  });
}

async function verifyMobileAuthToken(req, token) {
  const payload = await verifySignedToken(req, token, {
    expiredMessage: 'Session has expired. Please sign in again.',
  });
  if (payload.type !== 'mobile_auth' || !payload.employee_id) {
    throw new Error('Invalid mobile session');
  }
  const ownerId = requirePlatformOwnerUserId();
  if (payload.owner_user_id && payload.owner_user_id !== ownerId) {
    throw new Error('Session owner mismatch. Please sign in again.');
  }
  return payload;
}

function getMobileAuthToken(req, body) {
  return req.headers.get('x-mobile-auth')
    || req.headers.get('X-Mobile-Auth')
    || body?.mobile_token
    || null;
}

function getEmployeeIdHeader(req) {
  return req.headers.get('X-Employee-ID') || req.headers.get('x-employee-id') || '';
}

function employeeEmailMatches(employee, normalizedEmail) {
  const work = normalizeEmail(employee?.email || '');
  const linked = normalizeEmail(employee?.user_email || '');
  return work === normalizedEmail || linked === normalizedEmail;
}

async function filterEmployeesViaApi(req, query, limit = 1) {
  const appId = getAppId(req);
  const apiKey = getApiKey(req);
  if (!appId || !apiKey) return [];

  const hosts = [
    'https://base44.app',
    'https://oper-core-flow.base44.app',
  ];

  for (const host of hosts) {
    try {
      const url = new URL(`${host}/api/apps/${appId}/entities/Employee`);
      url.searchParams.set('q', JSON.stringify(query));
      url.searchParams.set('limit', String(limit));

      const res = await fetch(url, {
        headers: {
          api_key: apiKey,
          'X-App-Id': appId,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length) return data;
    } catch {
      // Try next host.
    }
  }

  return [];
}

async function listEmployeesViaApi(req, limit = 1000) {
  return filterEmployeesViaApi(req, {}, limit);
}

async function listEmployeesViaServiceRole(base44, limit = 1000) {
  try {
    const rows = await base44.asServiceRole.entities.Employee.list('-created_date', limit);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function findEmployeeByEmailScan(base44, req, email) {
  const normalized = normalizeEmail(email);
  const pools = [
    await listEmployeesViaServiceRole(base44),
    await listEmployeesViaApi(req),
  ];

  for (const pool of pools) {
    const match = pool.find((employee) => employeeEmailMatches(employee, normalized));
    if (match) return match;
  }

  return null;
}

async function findEmployeeByEmail(base44, req, email) {
  const normalized = normalizeEmail(email);
  const queries = [
    { email: normalized },
    { email: email.trim() },
    { user_email: normalized },
    { user_email: email.trim() },
  ];

  for (const query of queries) {
    try {
      const viaServiceRole = await base44.asServiceRole.entities.Employee.filter(query);
      if (viaServiceRole?.length) return viaServiceRole[0];
    } catch {
      // Fall through.
    }

    try {
      const viaEntities = await base44.entities.Employee.filter(query);
      if (viaEntities?.length) return viaEntities[0];
    } catch {
      // Fall through.
    }

    const viaApi = await filterEmployeesViaApi(req, query);
    if (viaApi.length) return viaApi[0];
  }

  return findEmployeeByEmailScan(base44, req, email);
}

async function findEmployeeById(base44, req, employeeId) {
  if (!employeeId) return null;

  try {
    const viaServiceRole = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
    if (viaServiceRole?.[0]) return viaServiceRole[0];
  } catch {
    // Fall through.
  }

  try {
    const viaEntities = await base44.entities.Employee.filter({ id: employeeId });
    if (viaEntities?.[0]) return viaEntities[0];
  } catch {
    // Fall through.
  }

  const viaApi = await filterEmployeesViaApi(req, { id: employeeId });
  if (viaApi[0]) return viaApi[0];

  // Last resort: list pools (same resilience as email login).
  const pools = [
    await listEmployeesViaServiceRole(base44),
    await listEmployeesViaApi(req),
  ];
  for (const pool of pools) {
    const match = (pool || []).find((employee) => employee?.id === employeeId);
    if (match) return match;
  }

  return null;
}

function assertEmployeeActive(employee) {
  if (employee.status === 'Inactive' || employee.status === 'Terminated') {
    throw new Error('This employee account is not active.');
  }
}

async function authenticateMobileRequest(req, body, base44) {
  const mobileToken = getMobileAuthToken(req, body);
  if (!mobileToken) {
    return { error: json({ error: 'Missing X-Mobile-Auth header.' }, 401) };
  }

  let payload;
  try {
    payload = await verifyMobileAuthToken(req, mobileToken);
  } catch (error) {
    return { error: json({ error: error.message }, 401) };
  }

  const headerEmployeeId = getEmployeeIdHeader(req);
  if (headerEmployeeId && headerEmployeeId !== payload.employee_id) {
    return { error: json({ error: 'Employee ID mismatch.' }, 403) };
  }

  const employee = await findEmployeeById(base44, req, payload.employee_id);
  if (!employee) {
    return { error: json({ error: 'Employee not found.' }, 404) };
  }

  try {
    assertEmployeeActive(employee);
  } catch (error) {
    return { error: json({ error: error.message }, 403) };
  }

  const ownerUserId = requirePlatformOwnerUserId();
  return {
    employee,
    employeeId: employee.id,
    actingUserId: ownerUserId,
  };
}

const ENTITY_QUERY_ALLOWLIST = new Set([
  'Asset', 'AssetCategory', 'AssetFile', 'AssetGroup', 'AssetNote', 'AssetStatus',
  'Bill',
  'Contact', 'ContactCategory', 'ContactFile', 'ContactGroup', 'ContactNote',
  'ContactPerson', 'ContactStatus',
  'DocumentFile',
  'Employee', 'EmployeeDocument', 'EmployeeDocumentType', 'EmployeeGroup', 'EmployeeRole',
  'EmployeeStatus',
  'FileType',
  'Invoice',
  'OperationsSettings', 'Organization', 'OrganizationFile', 'Project', 'ProjectCategory', 'ProjectFile',
  'ProjectNote', 'ProjectStatus',
  'RolePermission', 'Task', 'TaskSubtask', 'Team', 'TimeEntry', 'TimeEntryPhoto',
  'PettyCashEntry', 'LeaveRequest',
  'WorkOrder', 'WorkOrderFile', 'WorkOrderStatus',
]);

async function checkAppVersion(base44, req) {
  const clientVersion = req.headers.get('x-app-version') || null;
  try {
    const apps = await base44.asServiceRole.entities.MobileApp.list('-updated_date', 1);
    if (!apps || apps.length === 0) return null;
    const app = apps[0];
    if (!clientVersion || clientVersion === app.app_version) return null;
    return {
      update_required: true,
      latest_version: app.app_version,
      version_description: app.version_description || '',
      android_path: app.android_path || '',
      ios_path: app.ios_path || '',
    };
  } catch {
    return null;
  }
}

function withVersionInfo(data, versionAlert) {
  if (!versionAlert) return data;
  return { ...data, ...versionAlert };
}

async function fetchUserProfileWithAccessToken(req, accessToken) {
  const appId = getAppId(req);
  const apiKey = getApiKey(req);
  const hosts = [
    'https://base44.app',
    'https://oper-core-flow.base44.app',
  ];

  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/api/apps/${appId}/entities/User/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          api_key: apiKey,
          'X-App-Id': appId,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) continue;
      const profile = await res.json();
      if (profile && typeof profile === 'object') return profile;
    } catch {
      // Try next host.
    }
  }

  return null;
}

function sanitizeEmployeeForClient(employee) {
  if (!employee || typeof employee !== 'object') return employee;
  const safe = { ...employee };
  delete safe.mobile_pin;
  return safe;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function findEmployeeRoleRow(employeeRoles, employee) {
  const label = String(employee?.role || '').trim();
  if (!label) return null;
  const needle = label.toLowerCase();
  return (employeeRoles || []).find((r) =>
    r.name === label
    || r.key === label
    || String(r.name || '').toLowerCase() === needle
    || String(r.key || '').toLowerCase() === needle
  ) || null;
}

function filterPermsForRole(rolePermissions, roleRow, employee) {
  const keys = new Set();
  if (roleRow?.key) keys.add(String(roleRow.key).trim());
  if (roleRow?.name) keys.add(String(roleRow.name).trim());
  if (employee?.role) keys.add(String(employee.role).trim());
  const lower = new Set([...keys].map((k) => k.toLowerCase()));
  return (rolePermissions || []).filter((p) => {
    const role = String(p.role || '').trim();
    return keys.has(role) || lower.has(role.toLowerCase());
  });
}

async function buildPermissionsRevisionHash(employee, roleRow, perms, allPerms, allRoles) {
  const permStamp = (perms || [])
    .map((p) => [
      p.module,
      p.updated_date,
      p.can_view,
      p.can_create,
      p.can_edit,
      p.can_delete,
      p.can_approve,
      p.can_create_on_behalf,
    ].join(':'))
    .sort()
    .join('|');

  const maxDate = (rows) => (rows || [])
    .map((r) => String(r?.updated_date || ''))
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || '';

  // Catalog stamp: any RolePermission / EmployeeRole edit bumps revision
  // even if this employee's filtered rows were missed by a key/name mismatch.
  const catalogStamp = [
    String((allPerms || []).length),
    maxDate(allPerms),
    String((allRoles || []).length),
    maxDate(allRoles),
  ].join('|');

  const raw = [
    String(employee?.id || ''),
    String(employee?.role || ''),
    String(employee?.updated_date || ''),
    String(roleRow?.key || ''),
    String(roleRow?.name || ''),
    String(roleRow?.updated_date || ''),
    roleRow?.can_view_all_leave === true ? '1' : '0',
    roleRow?.can_view_all_payroll === true ? '1' : '0',
    roleRow?.can_view_all_employees === true ? '1' : '0',
    roleRow?.can_view_all_petty_cash === true ? '1' : '0',
    String((perms || []).length),
    permStamp,
    catalogStamp,
  ].join('#');

  return sha256Hex(raw);
}

async function buildPermissionsRevisionFromLoaded(employee, rolePermissions, employeeRoles) {
  const roleRow = findEmployeeRoleRow(employeeRoles, employee);
  const perms = filterPermsForRole(rolePermissions, roleRow, employee);
  return buildPermissionsRevisionHash(
    employee,
    roleRow,
    perms,
    rolePermissions,
    employeeRoles,
  );
}

async function issueEmployeeMobileLogin(req, employee, email, versionAlert) {
  const ownerUserId = requirePlatformOwnerUserId();
  const key = normalizeEmail(email);
  const mobile_token = await createMobileAuthToken(req, {
    employee_id: employee.id,
    email: key,
  });

  return json(withVersionInfo({
    success: true,
    employee_id: employee.id,
    employee_name: employee.full_name || '',
    employee: sanitizeEmployeeForClient(employee),
    mobile_token,
    acting_user_id: ownerUserId,
    platform_owner_user_id: ownerUserId,
  }, versionAlert));
}

function assertEmployeePin(employee, pin) {
  const expected = String(employee?.mobile_pin || '').trim();
  const provided = String(pin || '').trim();
  if (!expected) {
    throw new Error('Mobile PIN is not set for this employee. Ask your administrator.');
  }
  if (!provided) {
    throw new Error('PIN is required.');
  }
  if (provided !== expected) {
    throw new Error('Invalid PIN.');
  }
}

async function loadEmployeeSessionData(base44, employee) {
  const ownerUserId = requirePlatformOwnerUserId();
  const [rolePermissions, employeeRoles, operationsSettingsList] = await Promise.all([
    base44.asServiceRole.entities.RolePermission.filter({}, null, 500).catch(() => []),
    base44.asServiceRole.entities.EmployeeRole.filter({}, null, 500).catch(() => []),
    base44.asServiceRole.entities.OperationsSettings.list('-updated_date', 1).catch(() => []),
  ]);

  const permissions_revision = await buildPermissionsRevisionFromLoaded(
    employee,
    rolePermissions || [],
    employeeRoles || [],
  );

  // Compute can_create_on_behalf from can_create + the matching data-scope flag,
  // so mobile clients keep working after the On Behalf column was removed from
  // the web permissions grid.
  const scopeByModule = {
    leave: 'can_view_all_leave',
    petty_cash: 'can_view_all_petty_cash',
    timesheets: 'can_view_all_employees',
  };
  const roleScopeMap = {};
  for (const r of (employeeRoles || [])) {
    if (r.key) roleScopeMap[r.key] = r;
  }
  const derivedRolePermissions = (rolePermissions || []).map((p) => {
    const scopeField = scopeByModule[p.module];
    const hasScope = !scopeField || !!roleScopeMap[p.role]?.[scopeField];
    return { ...p, can_create_on_behalf: !!(p.can_create && hasScope) };
  });

  return {
    employee: sanitizeEmployeeForClient(employee),
    employee_id: employee.id,
    acting_user_id: ownerUserId,
    platform_owner_user_id: ownerUserId,
    role_permissions: derivedRolePermissions,
    employee_roles: employeeRoles || [],
    operations_settings: operationsSettingsList?.[0] ?? null,
    permissions_revision,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body = await readJsonBody(req);
    const action = url.searchParams.get('action') || body.action;

    // Google OAuth redirect — Base44 may put the token in the query OR the
    // URL hash. Hash is never sent to the server, so return a tiny HTML bridge
    // that reads location.hash and 302s to operapp360:// for the Auth Tab.
    if (action === 'oauthCallback') {
      const accessToken = url.searchParams.get('access_token')
        || url.searchParams.get('token');
      const oauthError = url.searchParams.get('error')
        || url.searchParams.get('error_description');

      if (accessToken || oauthError) {
        return mobileOAuthCallbackResponse(
          accessToken,
          oauthError || 'Missing access token. Please sign in again from the mobile app.',
        );
      }

      // No query token — likely delivered in the fragment after Google login.
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Signing in…</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0b1020;color:#e8eef9}p{opacity:.8}</style>
</head><body><p>Completing sign-in…</p>
<script>
(function () {
  try {
    var hash = (location.hash || '').replace(/^#/, '');
    var q = location.search || '';
    var params = new URLSearchParams(hash || q.replace(/^\\?/, ''));
    var token = params.get('access_token') || params.get('token');
    var err = params.get('error') || params.get('error_description');
    var target;
    if (token) {
      target = 'operapp360://auth/callback?access_token=' + encodeURIComponent(token);
    } else {
      target = 'operapp360://auth/callback?error=' + encodeURIComponent(err || 'Missing access token after Google sign-in.');
    }
    location.replace(target);
  } catch (e) {
    location.replace('operapp360://auth/callback?error=' + encodeURIComponent(String(e && e.message || e)));
  }
})();
</script>
</body></html>`;
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    const versionAlert = await checkAppVersion(base44, req);

    if (action === 'sendOtp') {
      const email = body.email;
      if (!email) return json({ error: 'email is required' }, 400);

      try {
        requirePlatformOwnerUserId();
      } catch (error) {
        return json({ error: error.message }, 500);
      }

      const employee = await findEmployeeByEmail(base44, req, email);
      if (!employee) {
        return json({ error: 'No employee found with this email address.' }, 404);
      }

      try {
        assertEmployeeActive(employee);
      } catch (error) {
        return json({ error: error.message }, 403);
      }

      const key = normalizeEmail(email);
      const otp = generateOtp();
      const sessionToken = await createOtpSessionToken(req, {
        type: 'otp',
        email: key,
        otp_hash: await hashOtp(otp, getSessionSecret(req)),
        employee_id: employee.id,
        employee_name: employee.full_name || '',
        exp: Date.now() + OTP_TTL_MS,
      });

      try {
        await sendOtpEmail(base44, {
          to: key,
          fullName: employee.full_name,
          otp,
        });
      } catch (err) {
        return json({ error: `Could not send OTP email: ${err?.message || err}` }, 502);
      }

      return json(withVersionInfo({
        success: true,
        message: 'OTP sent to employee email.',
        session_token: sessionToken,
      }, versionAlert));
    }

    if (action === 'verifyOtp') {
      const email = body.email;
      const otp = body.otp;
      const session_token = body.session_token;
      if (!email || !otp || !session_token) {
        return json({ error: 'email, otp and session_token are required' }, 400);
      }

      const key = normalizeEmail(email);
      let payload;
      try {
        payload = await verifyOtpSessionToken(req, session_token);
      } catch (error) {
        return json({ error: error.message }, 400);
      }

      if (payload.email !== key) {
        return json({ error: 'Invalid OTP code.' }, 400);
      }

      const otpHash = await hashOtp(otp.toString().trim(), getSessionSecret(req));
      if (payload.otp_hash !== otpHash) {
        return json({ error: 'Invalid OTP code.' }, 400);
      }

      const employee = await findEmployeeById(base44, req, payload.employee_id);
      if (!employee) {
        return json({ error: 'Employee record not found.' }, 404);
      }

      try {
        assertEmployeeActive(employee);
      } catch (error) {
        return json({ error: error.message }, 403);
      }

      const ownerUserId = requirePlatformOwnerUserId();
      return issueEmployeeMobileLogin(req, employee, key, versionAlert);
    }

    if (action === 'loginWithGoogle') {
      const access_token = body.access_token;
      if (!access_token) {
        return json({ error: 'access_token is required' }, 400);
      }

      try {
        requirePlatformOwnerUserId();
      } catch (error) {
        return json({ error: error.message }, 500);
      }

      const profile = await fetchUserProfileWithAccessToken(req, access_token);
      if (!profile) {
        return json({
          error: 'Could not validate Base44 access token.',
          hint: 'Sign in on the web first, or ensure this Google account is registered on oper-core-flow.base44.app.',
        }, 401);
      }

      const profileEmail = normalizeEmail(
        profile?.email || profile?.user_email || profile?.primary_email || '',
      );
      if (!profileEmail) {
        return json({
          error: 'Could not read platform account email from access token.',
          hint: 'Check that User/me returns an email for this account.',
        }, 401);
      }

      const employee = await findEmployeeByEmail(base44, req, profileEmail);
      if (!employee) {
        return json({
          error: 'No employee record matches this Google account.',
          hint: `Add an Employee with email "${profileEmail}" in OperApp360.`,
          email: profileEmail,
        }, 404);
      }

      try {
        assertEmployeeActive(employee);
      } catch (error) {
        return json({ error: error.message }, 403);
      }

      return issueEmployeeMobileLogin(req, employee, profileEmail, versionAlert);
    }

    if (action === 'login') {
      const email = body.email;
      const pin = body.pin;
      if (!email) return json({ error: 'email is required' }, 400);

      try {
        requirePlatformOwnerUserId();
      } catch (error) {
        return json({ error: error.message }, 500);
      }

      const employee = await findEmployeeByEmail(base44, req, email);
      if (!employee) {
        return json({ error: 'No employee found with this email address.' }, 404);
      }

      try {
        assertEmployeeActive(employee);
        assertEmployeePin(employee, pin);
      } catch (error) {
        const status = error.message.includes('Invalid PIN') ? 401 : 403;
        return json({ error: error.message }, status);
      }

      return issueEmployeeMobileLogin(req, employee, normalizeEmail(email), versionAlert);
    }

    if (action === 'getSession') {
      const mobileToken = getMobileAuthToken(req, body);
      if (!mobileToken) {
        return json({ error: 'Missing mobile session. Send X-Mobile-Auth header.' }, 401);
      }

      let payload;
      try {
        payload = await verifyMobileAuthToken(req, mobileToken);
      } catch (error) {
        return json({ error: error.message }, 401);
      }

      const employee = await findEmployeeById(base44, req, payload.employee_id);
      if (!employee) {
        return json({ error: 'Employee record not found.' }, 404);
      }

      try {
        assertEmployeeActive(employee);
      } catch (error) {
        return json({ error: error.message }, 403);
      }

      const session = await loadEmployeeSessionData(base44, employee);
      return json(withVersionInfo({ success: true, ...session }, versionAlert));
    }

    if (action === 'entityQuery') {
      const auth = await authenticateMobileRequest(req, body, base44);
      if (auth.error) return auth.error;

      const entity = body.entity;
      const operation = body.operation || 'filter';
      if (!entity || !ENTITY_QUERY_ALLOWLIST.has(entity)) {
        return json({ error: 'Entity not allowed.' }, 403);
      }

      const entityApi = base44.asServiceRole.entities[entity];
      if (!entityApi) {
        return json({ error: `Unknown entity: ${entity}` }, 400);
      }

      const sort = body.sort || '-created_date';
      const requestedLimit = body.limit ?? 500;
      const limit = Math.min(Math.max(1, requestedLimit), 500);
      const skip = body.skip ?? null;
      const filter = body.filter || body.query || {};

      let rows = [];
      if (operation === 'list') {
        rows = await entityApi.list(sort, limit);
      } else if (operation === 'get') {
        const id = body.id;
        if (!id) return json({ error: 'id is required for get' }, 400);
        const found = await entityApi.filter({ id });
        rows = found?.length ? [found[0]] : [];
      } else {
        rows = await entityApi.filter(filter, sort, limit, skip);
      }

      return json(withVersionInfo({
        success: true,
        data: rows,
        acting_user_id: auth.actingUserId,
        employee_id: auth.employeeId,
      }, versionAlert));
    }

    if (action === 'getMobileApp') {
      try {
        const apps = await base44.asServiceRole.entities.MobileApp.list('-updated_date', 1);
        const app = apps && apps.length > 0 ? apps[0] : null;
        // Public HTML on media.base44.com — valid Google from_url (not /functions/, not Vercel).
        let oauth_bridge_url = null;
        let oauth_bridge_error = null;
        try {
          oauth_bridge_url = await ensureMobileOAuthBridgeUrl(base44);
        } catch (bridgeErr) {
          oauth_bridge_error = bridgeErr?.message || String(bridgeErr);
        }
        // Public (no login) — still include force-update flags for login screen.
        return json(withVersionInfo({
          success: true,
          app,
          oauth_bridge_url,
          oauth_bridge_error,
          // Lets us verify the published function revision from the device/logs.
          api_auth_build: 'oauth-bridge-2',
        }, versionAlert));
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // Same bridge as getMobileApp (kept for direct mobile calls after publish).
    if (action === 'getMobileOAuthBridge') {
      try {
        const url = await ensureMobileOAuthBridgeUrl(base44);
        return json({ success: true, url, api_auth_build: 'oauth-bridge-2' });
      } catch (err) {
        return json({ error: err?.message || String(err) }, 500);
      }
    }

    return json({
      error: 'Unknown action. Use ?action=loginWithGoogle, ?action=sendOtp, ?action=verifyOtp, ?action=getSession, ?action=entityQuery, ?action=getMobileApp or ?action=getMobileOAuthBridge',
      api_auth_build: 'oauth-bridge-2',
    }, 400);
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});