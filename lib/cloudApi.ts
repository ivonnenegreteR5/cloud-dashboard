// app/lib/cloudApi.ts

import "server-only";
import { cookies } from "next/headers";


const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

// API key global de tu proyecto (la misma que usas en REST para el Gateway)
const API_KEY =
  process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

// ✅ Firebase Web API key (IdentityToolkit) — mejor como variable server
// (mantenemos fallback a NEXT_PUBLIC para compatibilidad, pero NO usamos API_KEY como fallback)
const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "";

if (!API_KEY) {
  console.warn("[cloudApi] Falta CLOUD_API_API_KEY en .env.local");
}
if (!FIREBASE_WEB_API_KEY) {
  console.warn(
    "[cloudApi] Falta FIREBASE_WEB_API_KEY (o NEXT_PUBLIC_FIREBASE_API_KEY) en .env.local"
  );
}

/**
 * Extrae el tenant a partir del email.
 * Ej: "hach.admin@hach.local" → "hach"
 */
export function extractTenantFromEmail(email: string): string {
  const [, domain] = email.split("@");
  if (!domain) return "demo";

  const tenant = domain.split(".")[0];
  return tenant || "demo";
}

/** ✅ Helper: arma headers SIN perder x-api-key aunque mandes Authorization */


function mergeHeaders(base: Record<string, string>, extra?: HeadersInit) {
  const out: Record<string, string> = { ...base };

  if (!extra) return out;

  // HeadersInit puede ser objeto, array o Headers
  if (extra instanceof Headers) {
    extra.forEach((v, k) => (out[k] = v));
    return out;
  }

  if (Array.isArray(extra)) {
    for (const [k, v] of extra) out[k] = v;
    return out;
  }

  return { ...out, ...(extra as Record<string, string>) };
}

/** ✅ Helper: parse robusto (si no es JSON, regresa texto) */
async function readBodySmart(resp: Response) {
  const text = await resp.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * ✅ SUPERADMIN: Adjunta x-tenant-id si viene en options (o si lo pasas explícito)
 * - En server (Next) NO uses localStorage.
 * - Para llamadas desde API routes / server actions, pásalo como "tenantIdHint".
 */
function withTenantHeader(
  headers: Record<string, string>,
  tenantIdHint?: string
) {
  if (!tenantIdHint) return headers;
  // Header que tu server acepta para resolver tenant cuando es superadmin
  return { ...headers, "x-tenant-id": tenantIdHint };
}



/**
 * ✅ fetchJson con soporte de:
 * - x-api-key
 * - Authorization (si lo pasas)
 * - x-tenant-id (si pasas tenantIdHint)
 */
async function fetchJson(
  url: string,
  options: RequestInit = {},
  tenantIdHint?: string
) {
  const baseHeaders = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
  };

  const merged = mergeHeaders(baseHeaders, options.headers);
  const headers = withTenantHeader(merged, tenantIdHint);

  const resp = await fetch(url, {
    ...options,
    headers,
  });

  if (resp.status === 204) return null;

  const data = await readBodySmart(resp);

  if (!resp.ok) {
    const msg =
      (data as any)?.message ||
      (data as any)?.error ||
      (data as any)?.details ||
      (data as any)?.raw ||
      resp.statusText ||
      "Request failed";

    throw new Error(`Error HTTP ${resp.status} en ${url} → ${msg}`);
  }

  return data;
}

/**
 * 🔐 Paso 1: signInWithPassword en IdentityToolkit (Firebase)
 * POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={{api_key}}
 *
 * ⚠️ Nota: lo dejamos porque ya lo usabas, pero para el dashboard
 * preferimos usar el idToken que viene del login del cliente
 * (ver createSessionTokenWithFirebaseIdToken).
 */
async function signInWithPassword(email: string, password: string) {
  if (!FIREBASE_WEB_API_KEY) {
    throw new Error(
      "Falta FIREBASE_WEB_API_KEY (o NEXT_PUBLIC_FIREBASE_API_KEY) en .env.local"
    );
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(
      `Error al hacer signInWithPassword → ${resp.status} ${
        (data as any)?.error?.message || JSON.stringify(data)
      }`
    );
  }

  const idToken = (data as any)?.idToken as string | undefined;

  if (!idToken) {
    throw new Error(
      `No se obtuvo idToken de IdentityToolkit: ${JSON.stringify(data)}`
    );
  }

  return {
    idToken,
    raw: data,
  };
}


/**
 * ✅ NUEVO (recomendado para tu dashboard):
 * Crea SessionToken usando el Firebase ID token que ya generaste en el login (cliente).
 *
 * POST {{BASE_URL}}/api/v1/SessionToken
 * Authorization: Bearer {{id_token_del_cliente}}
 * {
 *   "email": "...",
 *   "password": "...",
 *   "apiKey": "{{FIREBASE_WEB_API_KEY}}"
 * }
 */
export async function createSessionTokenWithFirebaseIdToken(params: {
  email: string;
  password: string;
  idToken: string; // Firebase ID token REAL (aud=rfid-6ce85)
}) {
  const { email, password, idToken } = params;

  if (!email || !password) throw new Error("Email y password requeridos");
  if (!idToken) throw new Error("idToken requerido");

  const url = `${BASE_URL}/api/v1/SessionToken`;

  const body = {
    email,
    password,
    apiKey: FIREBASE_WEB_API_KEY, // igual que tu REST
  };

  const data: any = await fetchJson(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    },
    undefined
  );

  const token =
    data?.auth?.token || data?.token || data?.sessionToken || data?.authToken;

  if (!token) {
    throw new Error(`La API no devolvió sessionToken: ${JSON.stringify(data)}`);
  }

  const tenantId =
    data?.tenantId || data?.user?.tenantId || extractTenantFromEmail(email);

  return {
    sessionToken: token as string,
    idToken, // ✅ reusa el MISMO token del cliente
    expiresAt: data?.expiresAt,
    user: {
      uid: data?.uid ?? data?.user?.uid,
      email: data?.email ?? data?.user?.email ?? email,
      tenantId,
      role: data?.role ?? data?.user?.role,
      isSuperAdmin: !!(data?.isSuperAdmin ?? data?.user?.isSuperAdmin),
      locationId: data?.locationId ?? data?.user?.locationId,
      personnelId: data?.personnelId ?? data?.user?.personnelId,
      active: data?.active ?? data?.user?.active,
    },
  };
}

/**
 * 💡 (Se conserva para compatibilidad)
 * Crear SessionToken usando email/password (server hace signInWithPassword).
 */
export async function createSessionTokenWithCredentials(
  email: string,
  password: string
) {
  if (!email || !password) {
    throw new Error("Email y password requeridos");
  }

  // 1) Login con IdentityToolkit (Firebase)
  const { idToken } = await signInWithPassword(email, password);

  // 2) Crear SessionToken en Cloud API
  const url = `${BASE_URL}/api/v1/SessionToken`;

  const body = {
    email,
    password,
    apiKey: FIREBASE_WEB_API_KEY,
  };

  const data: any = await fetchJson(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    },
    undefined
  );

  const token =
    data?.auth?.token || data?.token || data?.sessionToken || data?.authToken;

  if (!token) {
    throw new Error(`La API no devolvió sessionToken: ${JSON.stringify(data)}`);
  }

  const tenantId =
    data?.tenantId || data?.user?.tenantId || extractTenantFromEmail(email);

  return {
    sessionToken: token as string,
    idToken,
    expiresAt: data?.expiresAt,
    user: {
      uid: data?.uid ?? data?.user?.uid,
      email: data?.email ?? data?.user?.email ?? email,
      tenantId,
      role: data?.role ?? data?.user?.role,
      isSuperAdmin: !!(data?.isSuperAdmin ?? data?.user?.isSuperAdmin),
      locationId: data?.locationId ?? data?.user?.locationId,
      personnelId: data?.personnelId ?? data?.user?.personnelId,
      active: data?.active ?? data?.user?.active,
    },
  };
}

/* ============================
 * 🧠 SUPERADMIN: TENANTS
 * ============================
 */

/**
 * ✅ Listar tenants (solo superadmin en tu server)
 * GET {{BASE_URL}}/api/v1/Tenants
 *
 * Pasa idToken (Firebase) como Bearer.
 */
export async function listTenants(params: { idToken: string }) {
  const { idToken } = params;
  if (!idToken) throw new Error("idToken requerido");

  const url = `${BASE_URL}/api/v1/Tenants`;

  const data: any = await fetchJson(
    url,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    },
    undefined
  );

  // tu server puede devolver {items:[...]} o array
  if (Array.isArray(data)) return { items: data };
  if (data?.items && Array.isArray(data.items)) return { items: data.items };
  return { items: [] as any[] };
}

/**
 * 🔹 Listar assets usando SessionToken
 * POST {{BASE_URL}}/api/v1/Assets
 *
 * ✅ SUPERADMIN: si pasas tenantIdHint, se manda x-tenant-id
 */
export async function listAssetsWithSession(
  sessionToken: string,
  limit = 100,
  skip = 0,
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!sessionToken) throw new Error("sessionToken requerido");

  const url = `${BASE_URL}/api/v1/Assets`;

  const body: any = {
    auth: { token: sessionToken },
    limit,
    skip,
  };

  const data: any = await fetchJson(
    url,
    {
      method: "POST",
      headers: authHeader ? { Authorization: authHeader } : undefined,
      body: JSON.stringify(body),
    },
    tenantIdHint
  );

  let items: any[] = [];
  let total = 0;

  if (Array.isArray(data)) {
    items = data;
    total = data.length;
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.items)) items = data.items;
    else if (Array.isArray(data.assets)) items = data.assets;

    if (typeof data.total === "number") total = data.total;
    else total = items.length;
  }

  return { items, total };
}

/**
 * 🔍 Búsqueda avanzada de assets con filtros reales en el servidor
 * POST {{BASE_URL}}/api/cloud/assets/search
 * 
 * ✅ Esta función es la CLAVE para que los filtros funcionen correctamente
 */
export async function searchAssetsWithSession(
  sessionToken: string,
  filters: Record<string, string>,
  limit = 100,
  skip = 0,
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!sessionToken) throw new Error("sessionToken requerido");

  const url = `${BASE_URL}/api/cloud/assets/search?limit=${limit}&skip=${skip}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-session-token': sessionToken,
  };
  
  if (authHeader) headers['Authorization'] = authHeader;
  if (tenantIdHint) headers['x-tenant-id'] = tenantIdHint;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ filters }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Error en búsqueda: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  return {
    assets: data.assets || [],
    total: data.total || 0,
    limit: data.limit || limit,
    skip: data.skip || skip,
    hasMore: data.hasMore || false
  };
}

/**
 * 🗑️ Borrar assets por ids usando SessionToken + tenant
 * POST {{BASE_URL}}/api/v1/{tenant}/Assets/Delete
 *
 * ✅ SUPERADMIN: también mandamos x-tenant-id (tenantIdHint)
 */
export async function deleteAssetsWithSession(
  tenantId: string,
  sessionToken: string,
  ids: string[],
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!ids || ids.length === 0) throw new Error("Lista de ids vacía");

  // ✅ endpoint global
  const url = `${BASE_URL}/api/v1/Assets/Delete`;

  const body = {
    auth: { token: sessionToken },
    items: ids.map((id) => ({ _id: id })),
  };

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  return fetchJson(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    tenantIdHint || tenantId
  );
}


/**
 * ✏️ Actualizar assets usando SessionToken + tenant
 * POST {{BASE_URL}}/api/v1/{tenant}/Assets/Update
 *
 * ✅ SUPERADMIN: también mandamos x-tenant-id (tenantIdHint)
 */
export async function updateAssetsWithSession(
  tenantId: string,
  sessionToken: string,
  items: any[],
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!items || items.length === 0) throw new Error("items[] requerido");

  // ✅ CAMBIO CLAVE: endpoint global (sin tenant en path)
  const url = `${BASE_URL}/api/v1/Assets/Update`;

  const body = {
    auth: { token: sessionToken },
    items,
  };

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  // ✅ tenant SIEMPRE por header (superadmin o normal)
  return fetchJson(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    tenantIdHint || tenantId
  );
}


/**
 * 📍 Listar locations usando SessionToken + tenant
 * GET {{BASE_URL}}/api/v1/{tenantId}/locations?sessionToken=...
 *
 * ✅ SUPERADMIN: también mandamos x-tenant-id (tenantIdHint)
 */
export async function listLocationsWithSession(
  tenantId: string,
  sessionToken: string,
  limit = 100,
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");

  const url = new URL(`${BASE_URL}/api/v1/${tenantId}/locations`);
  url.searchParams.set("sessionToken", sessionToken);
  url.searchParams.set("limit", String(limit));

  const baseHeaders: Record<string, string> = {
    "x-api-key": API_KEY,
  };
  if (authHeader) baseHeaders.Authorization = authHeader;

  const headers = withTenantHeader(baseHeaders, tenantIdHint || tenantId);

  const resp = await fetch(url.toString(), { method: "GET", headers });
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error((data as any).message || "Error obteniendo locations");
  }

  return data as any[];
}

/**
 * ➕ Crear / actualizar (UPSERT) una location usando SessionToken + tenant
 * POST {{BASE_URL}}/api/v1/{tenantId}/Locations   (nota la L mayúscula)
 *
 * ✅ SUPERADMIN: también mandamos x-tenant-id (tenantIdHint)
 */
export async function upsertLocationWithSession(
  tenantId: string,
  sessionToken: string,
  item: any,
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!item || typeof item !== "object") {
    throw new Error("item requerido para crear/actualizar location");
  }

  // Validación mínima
  const id = String(item?.id ?? item?.code ?? "").trim();
  const name = String(item?.name ?? item?.Name ?? "").trim();

  if (!id && !name) {
    throw new Error(
      "item.id (o item.name) requerido para crear/actualizar location"
    );
  }

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    item,
  };

  // ✅ 1) Intento principal: /Locations (L mayúscula)
  try {
    const urlUpper = `${BASE_URL}/api/v1/${tenantId}/Locations`;
    const data: any = await fetchJson(
      urlUpper,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      tenantIdHint || tenantId
    );
    return data;
  } catch {
    // ✅ 2) Fallback: /locations (minúscula) por compat
    const urlLower = `${BASE_URL}/api/v1/${tenantId}/locations`;
    const data: any = await fetchJson(
      urlLower,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      tenantIdHint || tenantId
    );
    return data;
  }
}

/**
 * 🗑️ BORRAR / DESACTIVAR LOCATION (para el botón de borrar)
 *
 * Intentos:
 * 1) POST /api/v1/{tenantId}/Locations/Delete  (si existe)
 * 2) SOFT DELETE: upsert active:false en /Locations
 * 3) SOFT DELETE fallback: upsert active:false en /locations
 *
 * ✅ SUPERADMIN: también mandamos x-tenant-id (tenantIdHint)
 */
export async function deleteLocationWithSession(
  tenantId: string,
  sessionToken: string,
  locationId: string,
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!locationId) throw new Error("locationId requerido");

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const hint = tenantIdHint || tenantId;

  // 1) Hard delete si existe
  try {
    const urlDelete = `${BASE_URL}/api/v1/${tenantId}/Locations/Delete`;
    const bodyDelete = {
      auth: { token: sessionToken },
      item: { id: locationId },
    };

    const data: any = await fetchJson(
      urlDelete,
      {
        method: "POST",
        headers,
        body: JSON.stringify(bodyDelete),
      },
      hint
    );

    return data;
  } catch {
    // 2) Soft delete: active=false por /Locations
    const softItem = { id: locationId, active: false };

    try {
      const urlUpper = `${BASE_URL}/api/v1/${tenantId}/Locations`;
      const bodyUpper = { auth: { token: sessionToken }, item: softItem };
      const dataUpper: any = await fetchJson(
        urlUpper,
        {
          method: "POST",
          headers,
          body: JSON.stringify(bodyUpper),
        },
        hint
      );
      return dataUpper;
    } catch {
      // 3) Soft delete fallback: /locations
      const urlLower = `${BASE_URL}/api/v1/${tenantId}/locations`;
      const bodyLower = { auth: { token: sessionToken }, item: softItem };
      const dataLower: any = await fetchJson(
        urlLower,
        {
          method: "POST",
          headers,
          body: JSON.stringify(bodyLower),
        },
        hint
      );
      return dataLower;
    }
  }
}

/* ============================
 * 🧩 CAMPOS PERSONALIZADOS
 * ============================
 */

export type CustomFieldType = "text" | "number" | "date" | "boolean";

export interface CustomFieldUpsertInput {
  label: string;
  key: string;
  type?: CustomFieldType;
  readOnly?: boolean;
  scope?: string;
}

/**
 * 🔧 Crear / actualizar un campo personalizado de assets
 * POST {{BASE_URL}}/api/v1/{tenantId}/CustomFields
 *
 * ✅ SUPERADMIN: también mandamos x-tenant-id (tenantIdHint)
 */
export async function upsertCustomFieldWithSession(
  tenantId: string,
  sessionToken: string,
  field: CustomFieldUpsertInput,
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!field?.label || !field?.key) {
    throw new Error("label y key son requeridos");
  }

  const url = `${BASE_URL}/api/v1/${tenantId}/CustomFields`;

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    tenantId,
    label: field.label.trim(),
    key: field.key.trim(),
    type: field.type || "text",
    readOnly: field.readOnly ?? false,
    scope: field.scope || "asset",
  };

  return fetchJson(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    tenantIdHint || tenantId
  );
}

/**
 * 📋 Listar campos personalizados de assets
 *
 * ✅ SUPERADMIN: también mandamos x-tenant-id (tenantIdHint)
 */
export async function listCustomFieldsWithSession(
  tenantId: string,
  sessionToken: string,
  scope = "asset",
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");

  const url = new URL(`${BASE_URL}/api/v1/${tenantId}/CustomFields`);
  url.searchParams.set("sessionToken", sessionToken);
  url.searchParams.set("scope", scope);

  const baseHeaders: Record<string, string> = {
    "x-api-key": API_KEY,
  };
  if (authHeader) baseHeaders.Authorization = authHeader;

  const headers = withTenantHeader(baseHeaders, tenantIdHint || tenantId);

  const resp = await fetch(url.toString(), { method: "GET", headers });
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(
      (data as any)?.message ||
        (data as any)?.error ||
        "Error obteniendo campos personalizados"
    );
  }

  const items =
    (data as any)?.items ||
    (data as any)?.data?.items ||
    (data as any)?.data ||
    [];

  return {
    status: (data as any)?.status ?? resp.status,
    tenantId,
    scope,
    items: Array.isArray(items) ? items : [],
  };
}

/* ============================
 * 👥 PERSONNEL (USUARIOS)
 * ============================
 */

export async function listPersonnelWithSession(
  tenantId: string,
  sessionToken: string,
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");

  const url = new URL(`${BASE_URL}/api/v1/${tenantId}/Personnel`);
  url.searchParams.set("sessionToken", sessionToken);

  const baseHeaders: Record<string, string> = {
    "x-api-key": API_KEY,
  };
  if (authHeader) baseHeaders.Authorization = authHeader;

  const headers = withTenantHeader(baseHeaders, tenantIdHint || tenantId);

  const resp = await fetch(url.toString(), { method: "GET", headers });
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error((data as any).message || "Error obteniendo empleados");
  }

  return data as {
    status: number;
    data: any[];
  };
}

export async function upsertPersonnelWithSession(
  sessionToken: string,
  item: {
    _id: string;
    Name: string;
    Email?: string;
    Location?: string;
    role?: string;
    password?: string;
    active?: boolean;
  },
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!item?._id || !item?.Name) {
    throw new Error("_id y Name son requeridos en item");
  }

  const url = `${BASE_URL}/api/v1/Personnel`;

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    item,
  };

  const data = await fetchJson(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    tenantIdHint
  );

  return data as any;
}

export async function deletePersonnelWithSession(
  tenantId: string,
  sessionToken: string,
  id: string,
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!id) throw new Error("id requerido");

  const url = `${BASE_URL}/api/v1/${tenantId}/Personnel/${encodeURIComponent(
    id
  )}`;

  const body = {
    auth: { token: sessionToken },
  };

  const baseHeaders: Record<string, string> = {
    "x-api-key": API_KEY,
  };
  if (authHeader) baseHeaders.Authorization = authHeader;

  const headers = withTenantHeader(baseHeaders, tenantIdHint || tenantId);

  const data = await fetchJson(
    url,
    {
      method: "DELETE",
      headers,
      body: JSON.stringify(body),
    },
    tenantIdHint || tenantId
  );

  return data as any;
}

/**
 * 🔁 Helpers con nombres "cloud*" para usarlos desde /api/cloud/...
 */
export const cloudListPersonnel = listPersonnelWithSession;
export const cloudListLocations = listLocationsWithSession;
export const cloudUpsertLocation = upsertLocationWithSession;

// ✅ opcional: export helper para borrar ubicaciones desde /api/cloud/...
export const cloudDeleteLocation = deleteLocationWithSession;

export async function cloudDeletePersonnel(
  tenantId: string,
  sessionToken: string,
  id: string,
  authHeader?: string,
  tenantIdHint?: string
) {
  return deletePersonnelWithSession(tenantId, sessionToken, id, authHeader, tenantIdHint);
}

export async function cloudCreatePersonnelUser(params: {
  tenantId: string;
  sessionToken: string;
  email: string;
  password: string;
  id?: string;
  name: string;
  role?: string;
  location?: string;
  authHeader?: string;
  tenantIdHint?: string;
}) {
  const {
    tenantId,
    sessionToken,
    email,
    password,
    id,
    name,
    role,
    location,
    authHeader,
    tenantIdHint,
  } = params;

  return createPersonnelUserWithSession({
    tenantId,
    sessionToken,
    personnelId: id || email,
    name,
    email,
    password,
    role: role || "user",
    Location: location || "",
    authHeader,
    tenantIdHint,
  });
}

/* ============================
 * 👤 PERSONNEL (EMPLEADOS)
 * ============================
 */

export interface CreatePersonnelParams {
  tenantId: string;
  sessionToken: string;
  email: string;
  password: string; // compat
  id?: string;
  name: string;
  role?: string;
  location?: string;
  authHeader?: string;
  tenantIdHint?: string;
}

export async function createPersonnelWithSession(params: CreatePersonnelParams) {
  const {
    tenantId,
    sessionToken,
    email,
    password,
    id,
    name,
    role,
    location,
    authHeader,
    tenantIdHint,
  } = params;

  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!email) throw new Error("email requerido");
  if (!name) throw new Error("name requerido");

  const url = `${BASE_URL}/api/v1/${tenantId}/Personnel`;

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    item: {
      _id: id || email,
      Name: name,
      Email: email,
      Location: location || "",
      role: role || "",
      password,
    },
  };

  const data = await fetchJson(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    tenantIdHint || tenantId
  );

  return data as any;
}

/** ============================
 * 👥 PERSONNEL (Firebase Auth + Personnel)
 * ============================
 */

export interface CreatePersonnelUserParams {
  tenantId: string;
  sessionToken: string;
  personnelId: string;
  name: string;
  email: string;
  password: string;
  role?: string;
  Location?: string;
  authHeader?: string;
  tenantIdHint?: string;
}

export async function createPersonnelUserWithSession(
  params: CreatePersonnelUserParams
) {
  const {
    tenantId,
    sessionToken,
    personnelId,
    name,
    email,
    password,
    role = "user",
    Location = "",
    authHeader,
    tenantIdHint,
  } = params;

  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!personnelId) throw new Error("personnelId requerido");
  if (!name) throw new Error("name requerido");
  if (!email) throw new Error("email requerido");
  if (!password) throw new Error("password requerido");

  const url = `${BASE_URL}/api/v1/${tenantId}/Personnel/CreateUser`;

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    email,
    password,
    name,
    personnelId,
    role,
    Location,
  };

  return fetchJson(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    tenantIdHint || tenantId
  );
}

export async function setPersonnelActiveWithSession(params: {
  tenantId: string;
  sessionToken: string;
  ids: string[];
  active: boolean;
  authHeader?: string;
  tenantIdHint?: string;
}) {
  const { tenantId, sessionToken, ids, active, authHeader, tenantIdHint } =
    params;

  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!ids || ids.length === 0) throw new Error("ids[] requerido");

  const endpoint = active ? "Enable" : "Disable";
  const url = `${BASE_URL}/api/v1/${tenantId}/Personnel/${endpoint}`;

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    items: ids.map((id) => ({ id })),
  };

  return fetchJson(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    tenantIdHint || tenantId
  );
}

export async function deletePersonnelBulkWithSession(params: {
  tenantId: string;
  sessionToken: string;
  ids: string[];
  authHeader?: string;
  tenantIdHint?: string;
}) {
  const { tenantId, sessionToken, ids, authHeader, tenantIdHint } = params;

  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!ids || ids.length === 0) throw new Error("ids[] requerido");

  const url = `${BASE_URL}/api/v1/${tenantId}/Personnel/Delete`;

  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;

  const body = {
    auth: { token: sessionToken },
    items: ids.map((id) => ({ id })),
  };

  return fetchJson(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    tenantIdHint || tenantId
  );
}

// app/lib/cloudApi.ts
export async function cloudUpsertPersonnel(args: {
  tenantId: string;
  sessionToken: string;
  authHeader?: string; // "Bearer xxx"
  tenantIdHint?: string;
  item: {
    _id: string;
    Name: string;
    Email: string;
    role?: string;
    Location?: string;
  };
}) {
  const { tenantId, sessionToken, authHeader, item, tenantIdHint } = args;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-session-token": sessionToken,
    "x-tenant-id": tenantId, // mantenemos por compat
  };

  // OJO: algunos endpoints tuyos ocupan JWT. Aquí lo re-enviamos si viene.
  if (authHeader) headers["Authorization"] = authHeader;

  // Este endpoint es el que ya tienes en server.js:
  // POST /api/v1/:tenantId/Personnel  (upsertPersonnelHandler)
  const res = await fetch(
    `${BASE_URL}/api/v1/${encodeURIComponent(tenantId)}/Personnel`,
    {
      method: "POST",
      headers: withTenantHeader(headers, tenantIdHint || tenantId),
      body: JSON.stringify({
        auth: { token: sessionToken },
        item,
      }),
    }
  );

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  // tu API suele usar status:0 ok
  if (!res.ok || (data?.status !== undefined && data.status !== 0)) {
    const msg =
      data?.error ||
      data?.message ||
      data?.raw ||
      `Error HTTP ${res.status} en upsertPersonnel`;
    throw new Error(msg);
  }

  return data;
}

// app/lib/cloudApi.ts
export async function deleteCustomFields(params: {
  baseUrl: string;
  tenantId: string;
  firebaseIdToken: string; // Bearer
  sessionToken: string; // auth.token
  keys: string[];
  scope?: "asset" | "personnel";
  tenantIdHint?: string;
}) {
  const {
    baseUrl,
    tenantId,
    firebaseIdToken,
    sessionToken,
    keys,
    scope = "asset",
    tenantIdHint,
  } = params;

  const resp = await fetch(`${baseUrl}/api/v1/${tenantId}/CustomFields/Delete`, {
    method: "POST",
    headers: withTenantHeader(
      {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firebaseIdToken}`,
      },
      tenantIdHint || tenantId
    ),
    body: JSON.stringify({
      auth: { token: sessionToken },
      keys,
      scope, // "asset" usa assetCustomFields; "personnel" usa customFields
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`deleteCustomFields failed (${resp.status}): ${txt}`);
  }

  return resp.json();
}

export async function cleanupAssetsCustomKeys(params: {
  baseUrl: string;
  tenantId: string;
  firebaseIdToken: string;
  sessionToken: string;
  keys: string[];
  tenantIdHint?: string;
}) {
  const { baseUrl, tenantId, firebaseIdToken, sessionToken, keys, tenantIdHint } =
    params;

  const resp = await fetch(
    `${baseUrl}/api/v1/${tenantId}/Assets/Custom/Cleanup`,
    {
      method: "POST",
      headers: withTenantHeader(
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firebaseIdToken}`,
        },
        tenantIdHint || tenantId
      ),
      body: JSON.stringify({
        auth: { token: sessionToken },
        keys,
      }),
    }
  );

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`cleanupAssetsCustomKeys failed (${resp.status}): ${txt}`);
  }

  return resp.json();
}

export async function cloudListAppBlancos(
  tenantId: string,
  sessionToken: string,
  authHeader?: string,
  tenantIdHint?: string
) {
  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");

  const url = `${BASE_URL}/api/v1/AppBlancos`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-session-token": sessionToken,
    "x-tenant-id": tenantId,
  };

  if (authHeader) headers.Authorization = authHeader;

  const res = await fetch(url, {
    method: "GET",
    headers: withTenantHeader(headers, tenantIdHint || tenantId),
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || (data?.status !== undefined && data.status !== 0)) {
    throw new Error(
      data?.message ||
        data?.error ||
        data?.raw ||
        `Error HTTP ${res.status} en AppBlancos`
    );
  }

  return data;
}

export async function cloudUpsertAppBlancos(args: {
  tenantId: string;
  sessionToken: string;
  authHeader?: string;
  tenantIdHint?: string;
  items: Array<{ name: string }>;
}) {
  const { tenantId, sessionToken, authHeader, tenantIdHint, items } = args;

  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!items?.length) throw new Error("items[] requerido");

  const url = `${BASE_URL}/api/v1/AppBlancos/Update`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-session-token": sessionToken,
    "x-tenant-id": tenantId,
  };

  if (authHeader) headers.Authorization = authHeader;

  const res = await fetch(url, {
    method: "POST",
    headers: withTenantHeader(headers, tenantIdHint || tenantId),
    body: JSON.stringify({ items }),
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || (data?.status !== undefined && data.status !== 0)) {
    throw new Error(
      data?.message ||
        data?.error ||
        data?.raw ||
        `Error HTTP ${res.status} en AppBlancos/Update`
    );
  }

  return data;
}



export async function cloudDeleteAppBlancos(args: {
  tenantId: string;
  sessionToken: string;
  authHeader?: string;
  tenantIdHint?: string;
  items: Array<{ id?: string; name?: string }>;
}) {
  const { tenantId, sessionToken, authHeader, tenantIdHint, items } = args;

  if (!tenantId) throw new Error("tenantId requerido");
  if (!sessionToken) throw new Error("sessionToken requerido");
  if (!items?.length) throw new Error("items[] requerido");

  const url = `${BASE_URL}/api/v1/AppBlancos/Delete`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-session-token": sessionToken,
    "x-tenant-id": tenantId,
  };

  if (authHeader) headers.Authorization = authHeader;

  const res = await fetch(url, {
    method: "POST",
    headers: withTenantHeader(headers, tenantIdHint || tenantId),
    body: JSON.stringify({ items }),
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || (data?.status !== undefined && data.status !== 0)) {
    throw new Error(
      data?.message ||
        data?.error ||
        data?.raw ||
        `Error HTTP ${res.status} en AppBlancos/Delete`
    );
  }

  return data;
}
