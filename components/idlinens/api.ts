// components/idlinens/api.ts
export type EstadoKey = "circulacion" | "lavanderia" | "nuevos";

export type EstadoResumen = {
  estado: EstadoKey;
  label: string;
  count: number;
};

export type TipoResumen = {
  key: string; // ✅ canon (para agrupar/igualar)
  tipo: string; // ✅ display REAL (con ñ/acentos)
  count: number;
  rawTipo?: string; // ✅ tipo real para consultas (normalmente igual a tipo)
};

export type DetalleRow = {
  tipo: string;
  _id: string;
  tag?: string;
  estado?: string;
  vistoUltimaVez: string;
  creado: string;
  ciclosLavado: number;
  antiguedadDias: number;
  diasLavanderia: number;
  ubicacion?: string;
  empleado: string;
};

/** ===========================
 *  ✅ INACTIVOS 15+ DÍAS
 *  =========================== */
export type Inactivos15TipoResumen = {
  key: string; // canon
  tipo: string; // display con ñ/acentos
  count: number;
  rawTipo?: string; // para consultas
};

export type Inactivos15DetalleRow = {
  tipo: string;
  _id: string;
  tag?: string;
  estado?: string;
  vistoUltimaVez: string;
  creado: string;
  ciclosLavado: number;
  antiguedadDias: number;
  diasLavanderia: number;
  ubicacion?: string;
  empleado: string;

  // extras opcionales (si tu API los manda)
  daysInactive?: number;
  lastMovementAt?: string;
};

/** ===========================
 *  ✅ ANÁLISIS DE PRENDAS (rápido con routes)
 *  =========================== */
export type AnalysisCyclesByType = { tipo: string; totalCycles: number };
export type AnalysisAgeByWeek = { week: number; count: number };
export type AnalysisInactiveByType = { tipo: string; count: number };

export type AnalysisSummary = {
  cyclesByType: AnalysisCyclesByType[];
  ageByWeek: AnalysisAgeByWeek[];
  inactiveByType: AnalysisInactiveByType[];
  meta?: {
    scanned?: number;
    scannedRaw?: number;
    truncated?: boolean;
    cacheHit?: boolean;
    ttlSeconds?: number; 
    maxScan?: number;
    pageSize?: number;
  };
};

// ✅ AJUSTE: incluye ageTipo
export type AnalysisDetailMode = "cycles" | "age" | "inactive" | "ageTipo";

export type AnalysisDetailItem = {
  _id?: string;
  tag?: string;
  tipo?: string;
  status?: string;
  location?: string;
  createdAtMs?: number | null;
  ciclosLavado?: number;
};

export type AnalysisDetailResponse = {
  items: AnalysisDetailItem[];
  total: number;
  limit: number;
  skip: number;
  meta?: any;
};

export type RetiradosDetailResponse<TItem = any> = {
  items: TItem[];
  total: number;
  limit: number;
  skip: number;
  meta?: any;
};

/** ---------------------------
 *  🔐 TOKENS (de tu login)
 *  --------------------------*/
function getAuthTokens() {
  if (typeof window === "undefined") return { sessionToken: "", idToken: "" };

  const sessionToken = (localStorage.getItem("cloudSessionToken") || "").trim();

  // ✅ JWT Firebase (Gateway). Si lo guardas con otro key, agrega OR aquí.
  const idToken =
    (localStorage.getItem("cloudIdToken") || "").trim() ||
    (localStorage.getItem("firebaseIdToken") || "").trim() ||
    (localStorage.getItem("cloudFirebaseIdToken") || "").trim();

  return { sessionToken, idToken };
}

/** ---------------------------
 *  ✅ Headers estándar para TODOS los fetch
 *  (Authorization Bearer + x-tenant-id)
 *  --------------------------*/
function buildHeaders(tenantId: string) {
  const { idToken } = getAuthTokens();

  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "x-tenant-id": String(tenantId || "").trim(),
  };

  if (idToken) h["Authorization"] = `Bearer ${idToken}`;
  return h;
}

/** ---------------------------
 *  📦 RESPUESTA esperada del proxy
 *  --------------------------*/
type RawAsset = {
  _id?: string;
  id?: string;

  tag?: string;
  AssetTag?: string;

  tipo?: string;
  type?: string;
  AssetType?: string;

  ubicacion?: string;
  location?: string;
  Location?: string;

  status?: string;
  Status?: string;

  creado?: string | number;
  createdAt?: string | number;
  CreatedAt?: string | number;

  vistoUltimaVez?: string | number;
  lastSeen?: string | number;
  LastSeen?: string | number;

  ciclosLavado?: number;
  washCycles?: number;

  antiguedadDias?: number;
  diasLavanderia?: number;

  empleado?: string;
  employee?: string;

  // extras opcionales
  daysInactive?: number;
  lastMovementAt?: string | number;

    // ✅ tu data real (captura)
  Created?: string | number;   // epoch seconds

  [k: string]: any;
};

type AssetsProxyResponse = { items: RawAsset[]; total?: number } | RawAsset[];
type AssetsPage = { items: RawAsset[]; total?: number };

/** ---------------------------
 *  ⚡ Cache en memoria (cliente)
 *  --------------------------*/
const _assetsCacheByKey = new Map<string, { ts: number; items: RawAsset[] }>();
const _inflightByKey = new Map<string, Promise<RawAsset[]>>();

function makeCacheKey(tenantId: string, filter: Record<string, any>) {
  return JSON.stringify({
    tenantId: String(tenantId || "").trim(),
    filter: filter || {},
  });
}

async function getAllAssetsCached(tenantId: string, filter: Record<string, any> = {}) {
  const TTL_MS = 15_000;
  const now = Date.now();
  const key = makeCacheKey(tenantId, filter);

  const hit = _assetsCacheByKey.get(key);
  if (hit && now - hit.ts < TTL_MS) return hit.items;

  const inFlight = _inflightByKey.get(key);
  if (inFlight) return inFlight;

  const p = (async () => {
    const items = await postAssetsAll(tenantId, filter, 1000);
    _assetsCacheByKey.set(key, { ts: Date.now(), items });
    return items;
  })().finally(() => _inflightByKey.delete(key));

  _inflightByKey.set(key, p);
  return p;
}

function filterForEstado(estado?: EstadoKey): Record<string, any> {
  if (estado === "nuevos") return { Status: "created" };
  if (estado === "lavanderia") return { Location: "Almacen", Status: "out" };
  if (estado === "circulacion") return { Location: "Almacen", Status: "in" };
  return {};
}

/** ---------------------------
 *  🔌 Fetch a UNA página
 *  --------------------------*/
async function postAssetsPage(
  tenantId: string,
  filter: Record<string, any> = {},
  limit = 1000,
  skip = 0
): Promise<AssetsPage> {
  const { sessionToken, idToken } = getAuthTokens();
  if (!sessionToken) throw new Error("No hay sessionToken (cloudSessionToken) en localStorage");

  const headers = buildHeaders(tenantId);

  const resp = await fetch("/api/idlinens/assets", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ sessionToken, idToken, filter, limit, skip }),
    cache: "no-store",
  });

  const txt = await resp.text().catch(() => "");
  let data: AssetsProxyResponse;
  try {
    data = txt ? JSON.parse(txt) : [];
  } catch {
    data = [];
  }

  if (!resp.ok) throw new Error(`Assets proxy error (${resp.status}): ${txt || "sin detalle"}`);

  if (Array.isArray(data)) return { items: data, total: undefined };

  const items = Array.isArray((data as any).items) ? (data as any).items : [];
  const total = typeof (data as any).total === "number" ? (data as any).total : undefined;
  return { items, total };
}

/** ---------------------------
 *  🔁 Fetch de TODAS las páginas (robusto)
 *  --------------------------*/
async function postAssetsAll(
  tenantId: string,
  filter: Record<string, any> = {},
  pageSize = 1000
): Promise<RawAsset[]> {
  const all: RawAsset[] = [];
  let skip = 0;
  let lastFirstKey = "";
  const MAX_TOTAL = 300_000;

  while (true) {
    const { items, total } = await postAssetsPage(tenantId, filter, pageSize, skip);
    if (!items.length) break;

    const firstKey = String(items[0]?._id || items[0]?.id || "");
    if (firstKey && firstKey === lastFirstKey) break;
    lastFirstKey = firstKey;

    all.push(...items);
    skip += items.length;

    if (typeof total === "number" && all.length >= total) break;
    if (all.length >= MAX_TOTAL) break;
    if (skip >= MAX_TOTAL) break;
  }

  return all;
}

/** ---------------------------
 *  ⚡ Stats/Detalle (rápidos)
 *  --------------------------*/
async function postStats<T>(tenantId: string, path: string, body: any): Promise<T> {
  const { sessionToken, idToken } = getAuthTokens();
  if (!sessionToken) throw new Error("No hay sessionToken (cloudSessionToken) en localStorage");

  const headers = buildHeaders(tenantId);

  const resp = await fetch(path, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ sessionToken, idToken, ...body }),
    cache: "no-store",
  });

  const txt = await resp.text().catch(() => "");
  let data: any = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = txt;
  }

  if (!resp.ok) throw new Error(`Stats proxy error (${resp.status}): ${txt || "sin detalle"}`);
  return data as T;
}

/** ✅ unwrap para respuestas {ok:true}/{ok:false} */
function unwrapOk<T>(data: any): T {
  if (data && typeof data === "object" && "ok" in data) {
    if ((data as any).ok) return data as T;
    const msg = String((data as any).error || (data as any).message || "Error");
    throw new Error(msg);
  }
  return data as T;
}

/** ===========================
 *  ✅ ANÁLISIS DE PRENDAS (rápido)
 *  Usa:
 *   - POST /api/idlinens/analysis
 *   - POST /api/idlinens/analysis/detail
 *  =========================== */
export async function fetchAnalysisSummary(
  tenantId: string,
  opts?: { ttlSeconds?: number; maxScan?: number; pageSize?: number }
): Promise<AnalysisSummary> {
  const [analysisData, promedioData, nuevosCreatedData] = await Promise.all([
    postStats<any>(tenantId, "/api/idlinens/analysis", {
      ttlSeconds: opts?.ttlSeconds ?? 60,
      maxScan: opts?.maxScan ?? 50000,
      pageSize: opts?.pageSize ?? 1000,
    }),
    postStats<any>(tenantId, "/api/idlinens/promedio-ciclos-por-categoria", {}),
    postStats<any>(tenantId, "/api/idlinens/inactivos-nuevos-created/resumen", {
      days: 15,
    }),
  ]);

  const analysis = unwrapOk<any>(analysisData);

  const promedioItems = Array.isArray(promedioData?.items)
    ? promedioData.items
    : [];

  const nuevosCreatedItems = Array.isArray(nuevosCreatedData?.items)
    ? nuevosCreatedData.items
    : [];

  return {
    cyclesByType: promedioItems.map((x: any) => ({
      tipo: String(x?.tipo || ""),
      totalCycles: Number(x?.promedio || 0),
    })),

    ageByWeek: Array.isArray(analysis?.ageByWeek) ? analysis.ageByWeek : [],

    inactiveByType: nuevosCreatedItems.map((x: any) => ({
      tipo: String(x?.tipo || ""),
      count: Number(x?.count || 0),
    })),

    meta: {
      ...(analysis?.meta || {}),
      promedioCiclosUpdatedAt: promedioData?.updatedAt || null,
      nuevosCreatedUpdatedAt: nuevosCreatedData?.updatedAt || null,
    },
  };
}

export async function fetchAnalysisDetail(
  tenantId: string,
  params: {
    mode: AnalysisDetailMode;
    tipo?: string;
    week?: number;
    limit?: number;
    skip?: number;

    // ✅ opcionales: para que detail pueda “auto-hidratar” cache
    // si tu server los usa (no rompe si los ignora)
    ttlSeconds?: number;
    maxScan?: number;
    pageSize?: number;
  }
): Promise<AnalysisDetailResponse> {
  const data = await postStats<any>(tenantId, "/api/idlinens/analysis/detail", {
    mode: params.mode,
    tipo: params.tipo,
    week: params.week,
    limit: params.limit ?? 100,
    skip: params.skip ?? 0,

    ttlSeconds: params.ttlSeconds,
    maxScan: params.maxScan,
    pageSize: params.pageSize,
  });

  const unwrapped = unwrapOk<any>(data);

  return {
    items: Array.isArray(unwrapped?.items) ? unwrapped.items : [],
    total: Number(unwrapped?.total ?? 0),
    limit: Number(unwrapped?.limit ?? params.limit ?? 100),
    skip: Number(unwrapped?.skip ?? params.skip ?? 0),
    meta: unwrapped?.meta,
  };
}

// ===========================
// ✅ RETIRADOS (Blancos Retirados)
// ===========================
export type RetiradosSummary = {
  totalesByType: Array<{ tipo: string; count: number }>;
  avgAgeWeeksByType: Array<{ tipo: string; avgWeeks: number; count: number }>;
  avgCyclesByType: Array<{ tipo: string; avgCycles: number; count: number }>;
  ageByWeek: Array<{ week: number; count: number }>;
  meta?: any;
  debug?: any;
};

export type RetiradosDetailMode =
  | "tipo"          // lista por tipo
  | "cyclesTipo"    // lista por tipo ordenada por ciclos (server)
  | "ageWeekTipos"  // resumen: tipos dentro de una semana (conteos)
  | "ageWeekTipo";  // lista: items dentro de semana + tipo

export async function fetchRetiradosSummary(
  tenantId: string,
  opts?: { ttlSeconds?: number; maxScan?: number; pageSize?: number }
): Promise<RetiradosSummary> {
  const data = await postStats<any>(tenantId, "/api/idlinens/retirados/analysis", {
    ttlSeconds: opts?.ttlSeconds ?? 60,
    maxScan: opts?.maxScan ?? 50000,
    pageSize: opts?.pageSize ?? 1000,
  });

  const u = unwrapOk<any>(data);

  return {
    totalesByType: Array.isArray(u?.totalesByType) ? u.totalesByType : [],
    avgAgeWeeksByType: Array.isArray(u?.avgAgeWeeksByType) ? u.avgAgeWeeksByType : [],
    avgCyclesByType: Array.isArray(u?.avgCyclesByType) ? u.avgCyclesByType : [],
    ageByWeek: Array.isArray(u?.ageByWeek) ? u.ageByWeek : [],
    meta: u?.meta,
    debug: u?.debug,
  };
}

export async function fetchRetiradosDetail<TItem = any>(
  tenantId: string,
  params: {
    mode: RetiradosDetailMode;
    tipo?: string;
    week?: number;
    limit?: number;
    skip?: number;
    ttlSeconds?: number;
    maxScan?: number;
    pageSize?: number; // scan page size (server)
  }
): Promise<RetiradosDetailResponse<TItem>> {
  const data = await postStats<any>(tenantId, "/api/idlinens/retirados/analysis/details", {
    ...params,
    limit: params.limit ?? 100,
    skip: params.skip ?? 0,
  });

  const u = unwrapOk<any>(data);

  return {
    items: Array.isArray(u?.items) ? (u.items as TItem[]) : [],
    total: Number(u?.total ?? 0),
    limit: Number(u?.limit ?? (params.limit ?? 100)),
    skip: Number(u?.skip ?? (params.skip ?? 0)),
    meta: u?.meta,
  };
}
/** ✅ Acción: retirar (mover a Blancos Retirados) */
export async function retireAssetToRetirados(tenantId: string, tag: string) {
  const { sessionToken, idToken } = getAuthTokens();
  if (!sessionToken) throw new Error("No hay sessionToken (cloudSessionToken) en localStorage");

  const headers = buildHeaders(tenantId);

  const resp = await fetch("/api/cloud/assets/update", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({
      sessionToken,
      idToken,
      items: [{ tag: String(tag || "").trim(), locationId: "Blancos Retirados" }],
    }),
    cache: "no-store",
  });

  const txt = await resp.text().catch(() => "");
  let data: any = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = txt;
  }

  if (!resp.ok) throw new Error(`Update error (${resp.status}): ${txt || "sin detalle"}`);
  return data;
}
export async function retireAssetsToRetirados(
  tenantId: string,
  rows: Array<{ tag?: string; _id?: string }>
) {
  const { sessionToken, idToken } = getAuthTokens();
  if (!sessionToken) throw new Error("No hay sessionToken (cloudSessionToken) en localStorage");

  const headers = buildHeaders(tenantId);

  const items = rows
    .map((r) => ({
      tag: String(r.tag || r._id || "").trim(),
      locationId: "Blancos Retirados",
    }))
    .filter((x) => x.tag);

  if (!items.length) throw new Error("No hay prendas válidas para retirar");

  const resp = await fetch("/api/cloud/assets/update", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({
      sessionToken,
      idToken,
      items,
    }),
    cache: "no-store",
  });

  const txt = await resp.text().catch(() => "");
  let data: any = null;

  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = txt;
  }

  if (!resp.ok) throw new Error(`Update error (${resp.status}): ${txt || "sin detalle"}`);

  return data;
}

/** ---------------------------
 *  Detalle page (resumen / tablas existentes)
 *  --------------------------*/
type DetallePageResp = {
  total?: number;
  limit?: number;
  skip?: number;
  items?: RawAsset[];
};

async function postDetallePage(params: {
  tenantId: string;
  location?: string;
  tipo: string;
  limit?: number;
  skip?: number;
  globalTipo?: boolean;
}): Promise<{ items: RawAsset[]; total: number; limit: number; skip: number }> {
  const r = await postStats<DetallePageResp>(
  params.tenantId,
  "/api/idlinens/detalle-page",
 {
  ...(params.location ? { location: params.location } : {}),
  ...(params.globalTipo ? { globalTipo: true } : {}),
  tipo: params.tipo,
  limit: params.limit,
  skip: params.skip,
}
);

  const items = Array.isArray((r as any)?.items) ? ((r as any).items as RawAsset[]) : [];
  const total = typeof (r as any)?.total === "number" ? (r as any).total : items.length;
  const limit = typeof (r as any)?.limit === "number" ? (r as any).limit : (params.limit ?? 100);
  const skip = typeof (r as any)?.skip === "number" ? (r as any).skip : (params.skip ?? 0);

  return { items, total, limit, skip };
}

/** ---------------------------
 *  🧠 Normalización
 *  --------------------------*/
function toStr(v: any) {
  return String(v ?? "").trim();
}

function norm(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function canonTipo(v: any) {
  const noAccents = String(v ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const compact = noAccents.replace(/\s+/g, " ").trim();
  return compact.toUpperCase();
}

/** ✅ MAYÚSCULAS conservando Ñ/acentos */
function upperKeepAccents(s: string) {
  return String(s ?? "").trim().toLocaleUpperCase("es-MX");
}

/** ✅ Agrega + suma, conserva display */
function aggregateTipos(items: Array<{ tipo: string; count: number }>): TipoResumen[] {
  const map = new Map<string, { count: number; display: string; rawTipo: string }>();

  for (const it of items ?? []) {
    const raw = String(it?.tipo ?? "").trim();
    const key = canonTipo(raw);
    if (!key) continue;

    const count = Number(it?.count ?? 0);
    const prev = map.get(key);

    if (!prev) {
      map.set(key, { count, display: raw, rawTipo: raw });
    } else {
      prev.count += count;
      prev.display = prev.display || raw;
      prev.rawTipo = prev.rawTipo || raw;
    }
  }

  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      tipo: v.display,
      count: v.count,
      rawTipo: v.rawTipo,
    }))
    .sort((a, b) => b.count - a.count);
}

function resolveTipoForQuery(tipo: string, tipos?: TipoResumen[]) {
  const t = String(tipo ?? "").trim();
  if (!t) return t;

  const key = canonTipo(t);
  const found = (tipos ?? []).find((x) => (x.key ? x.key === key : canonTipo(x.tipo) === key));
  return found?.rawTipo?.trim() || t;
}

function toTipo(a: RawAsset) {
  const raw = toStr(a.AssetType) || toStr(a.type) || toStr(a.tipo) || "SIN_TIPO";
  return upperKeepAccents(raw) || "SIN_TIPO";
}

function toTag(a: RawAsset) {
  return toStr(a.AssetTag) || toStr(a.tag) || "";
}

function toId(a: RawAsset) {
  return toStr(a._id) || toStr(a.id) || "";
}

function toUbicacion(a: RawAsset) {
  return toStr(a.Location) || toStr(a.location) || toStr(a.ubicacion) || "";
}

function toStatus(a: RawAsset) {
  return (
    toStr((a as any).estado) ||
    toStr(a.status) ||
    toStr(a.Status) ||
    ""
  );
}

function estadoDisplay(a: RawAsset) {
  const raw = toStatus(a);
  const n = norm(raw);

  if (n === "in" || n === "checked in" || n === "entrada" || n === "check in") {
    return "Check in";
  }

  if (n === "out" || n === "checked out" || n === "salida" || n === "check out") {
    return "Check out";
  }

  if (n === "created" || n === "creado") {
    return "created";
  }

  return raw || "Sin estado";
}

function toEmpleado(a: RawAsset) {
  return (
    toStr((a as any).employee) ||
    toStr((a as any).empleado) ||
    toStr((a as any).PersonnelName) ||
    toStr((a as any).personnelName) ||
    toStr((a as any).x_employee) ||
    toStr((a as any).lastCheckOutBy) ||
    toStr((a as any).lastCheckInBy) ||
    ""
  );
}
function toEpochMs(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;

  if (typeof v === "number") {
    return v > 10_000_000_000 ? v : v * 1000;
  }

  const s = String(v).trim();
  if (!s) return null;

  const n = Number(s);
  if (Number.isFinite(n)) {
    return n > 10_000_000_000 ? n : n * 1000;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getTime();

  return null;
}

function formatDateMx(v: any) {
  const ms = toEpochMs(v);
  if (!ms) return "";
  return new Date(ms).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });
}

function getCreatedMs(a: RawAsset): number | null {
  return (
    toEpochMs((a as any).Created) ??
    toEpochMs((a as any).createdAt) ??
    toEpochMs((a as any).CreatedAt) ??
    toEpochMs((a as any).creado) ??
    toEpochMs((a as any).custom?.Created) ??
    toEpochMs((a as any).custom?.createdAt) ??
    toEpochMs((a as any).custom?.CreatedAt) ??
    null
  );
}

function getLastSeenMs(a: RawAsset): number | null {
  return (
    toEpochMs((a as any).LastSeen) ??
    toEpochMs((a as any).lastSeen) ??
    toEpochMs((a as any).LastSeenAt) ??
    toEpochMs((a as any).lastSeenAt) ??
    toEpochMs((a as any).last_seen_at) ??
    toEpochMs((a as any).vistoUltimaVez) ??
    toEpochMs((a as any).updatedAt) ??
    toEpochMs((a as any).UpdatedAt) ??
    toEpochMs((a as any).custom?.LastSeen) ??
    toEpochMs((a as any).custom?.lastSeen) ??
    toEpochMs((a as any).custom?.LastSeenAt) ??
    toEpochMs((a as any).custom?.lastSeenAt) ??
    null
  );
}

function getCiclosLavado(a: RawAsset): number {
  return (
    Number((a as any).ciclosLavado ?? NaN) ||
    Number((a as any).washCycles ?? NaN) ||
    Number((a as any).custom?.ciclosLavado ?? NaN) ||
    Number((a as any).custom?.CiclosLavado ?? NaN) ||
    Number((a as any).custom?.fields?.ciclosLavado ?? NaN) ||
    Number((a as any).custom?.fields?.CiclosLavado ?? NaN) ||
    0
  );
}

function diffDaysFromNow(ms: number | null): number {
  if (!ms) return 0;
  const now = Date.now();
  return Math.max(0, Math.floor((now - ms) / 86400000));
}

function toNumberSafe(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toDateStr(v: any) {
  if (!v) return "";
  if (typeof v === "number") {
    const ms = v > 10_000_000_000 ? v : v * 1000;
    return new Date(ms).toLocaleDateString();
  }
  const s = String(v);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  return s;
}

function resolveEstadoKey(a: RawAsset): EstadoKey | null {
  const ubic = norm(toUbicacion(a));
  const st = norm(toStatus(a));

  if (st === "created") return "nuevos";
  if (ubic === "almacen" && st === "out") return "lavanderia";
  if (ubic === "almacen" && st === "in") return "circulacion";
  return null;
}

function estadoLabel(k: EstadoKey) {
  return k === "nuevos" ? "Nuevos" : k === "lavanderia" ? "Lavandería" : "Circulación";
}

function toDetalleRow(a: RawAsset): DetalleRow {
  const tipo = toTipo(a);
  const estadoKey = resolveEstadoKey(a);
  const ubic = toUbicacion(a);
  const status = toStatus(a);

  const createdMs = getCreatedMs(a);
  const lastSeenMs = getLastSeenMs(a);

  const ciclosLavado = getCiclosLavado(a);
  const antiguedadDias = diffDaysFromNow(createdMs);

  const statusNorm = norm(status);

const enLavanderia =
  statusNorm === "out" ||
  statusNorm === "checked out" ||
  statusNorm === "check out" ||
  statusNorm === "salida";

  const diasLavanderia = enLavanderia && lastSeenMs ? diffDaysFromNow(lastSeenMs) : 0;

  return {
    tipo,
    _id: toId(a),
    tag: toTag(a) || undefined,
    estado: estadoDisplay(a),
    vistoUltimaVez: formatDateMx(lastSeenMs),
    creado: formatDateMx(createdMs),
    ciclosLavado,
    antiguedadDias,
    diasLavanderia,
    ubicacion: ubic || undefined,
    empleado: toEmpleado(a),
  };
}

/** ---------------------------
 *  ✅ 1) Resumen por estado
 *  --------------------------*/
export async function fetchResumenEstados(_tenantId: string): Promise<EstadoResumen[]> {
  const raw = await postStats<any>(_tenantId, "/api/idlinens/resumen-estados", {});
  const items: Array<{ estado: EstadoKey; count?: number; label?: string }> = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
      ? raw.items
      : [];

  return items.map((d: any) => {
    const estado = String(d?.estado || "").toLowerCase() as EstadoKey;
    return {
      estado,
      label: String(d?.label || "").trim() || estadoLabel(estado),
      count: Number(d?.count || 0),
    };
  });
}

/** ---------------------------
 *  ✅ 2) Resumen por tipo dentro de un estado
 *  --------------------------*/
export async function fetchResumenTipos(
  _tenantId: string,
  location: string
): Promise<TipoResumen[]> {
  const raw = await postStats<any>(_tenantId, "/api/idlinens/resumen-tipos", {
    location,
  });

  const items: Array<{ tipo: string; count?: number; rawTipo?: string }> = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
      ? raw.items
      : [];

  return aggregateTipos(
    items.map((d: any) => ({
      tipo: String(d?.tipo ?? ""),
      rawTipo: String(d?.rawTipo ?? d?.tipo ?? ""),
      count: Number(d?.count || 0),
    }))
  );
}
/** ---------------------------
 *  ✅ 3) Detalle tabla por estado + tipo
 *  --------------------------*/
export async function fetchDetallePage(
  _tenantId: string,
  location: string,
  tipo: string,
  limit = 50,
  skip = 0,
  tiposRef?: TipoResumen[]
): Promise<{ rows: DetalleRow[]; total: number; limit: number; skip: number }> {
  const tipoQuery = resolveTipoForQuery(tipo, tiposRef);

  const page = await postDetallePage({
    tenantId: _tenantId,
    location,
    tipo: tipoQuery,
    limit,
    skip,
  });

  return {
    rows: page.items.map(toDetalleRow),
    total: page.total,
    limit: page.limit,
    skip: page.skip,
  };
}

export async function fetchDetalleTipoGlobalPage(
  _tenantId: string,
  tipo: string,
  limit = 200,
  skip = 0,
  tiposRef?: TipoResumen[]
): Promise<{ rows: DetalleRow[]; total: number; limit: number; skip: number }> {
  const tipoQuery = resolveTipoForQuery(tipo, tiposRef);

  const page = await postDetallePage({
  tenantId: _tenantId,
  tipo: tipoQuery,
  limit,
  skip,
  globalTipo: true,
});
  return {
    rows: page.items.map(toDetalleRow),
    total: page.total,
    limit: page.limit,
    skip: page.skip,
  };
}

export async function fetchDetalle(
  _tenantId: string,
  location: string,
  tipo: string,
  tiposRef?: TipoResumen[]
): Promise<DetalleRow[]> {
  const out: DetalleRow[] = [];
  const SAFE_MAX = 5000;
  let skip = 0;
  const limit = 200;

  const tipoQuery = resolveTipoForQuery(tipo, tiposRef);

  while (out.length < SAFE_MAX) {
    const page = await postDetallePage({
      tenantId: _tenantId,
      location,
      tipo: tipoQuery,
      limit,
      skip,
    });

    if (!page.items.length) break;

    out.push(...page.items.map(toDetalleRow));

    skip += page.items.length;
    if (skip >= page.total) break;
  }

  return out;
}
/** ---------------------------
 *  ✅ Totales por tipo (Nuevos + Circulación)
 *  --------------------------*/
export async function fetchTotalesPorTipo(_tenantId: string): Promise<TipoResumen[]> {
  const raw = await postStats<any>(_tenantId, "/api/idlinens/totales-por-tipo", {});
  const items: Array<{ tipo: string; count?: number }> = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
      ? raw.items
      : [];

  return aggregateTipos(
    items.map((d: any) => ({
      tipo: String(d?.tipo ?? ""),
      count: Number(d?.count || 0),
    }))
  );
}

export type UbicacionResumen = {
  id: string;
  nombre: string;
  count: number; 
};

export async function fetchDistribucionPorUbicacion(
  tenantId: string
): Promise<UbicacionResumen[]> {
  const sessionToken =
    typeof window !== "undefined"
      ? String(localStorage.getItem("cloudSessionToken") || "").trim()
      : "";

  const idToken =
    typeof window !== "undefined"
      ? String(localStorage.getItem("cloudIdToken") || "").trim()
      : "";

  if (!sessionToken) {
    throw new Error("Sesión no válida");
  }

  const resp = await fetch(
    `/api/cloud/locations?limit=500&tenantId=${encodeURIComponent(tenantId)}`,
    {
      method: "GET",
      headers: {
        "x-session-token": sessionToken,
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "x-tenant-id": tenantId,
      },
      cache: "no-store",
    }
  );

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || "No se pudo cargar ubicaciones");
  }

  const arr = Array.isArray(data?.locations)
    ? data.locations
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];

 const out: UbicacionResumen[] = arr
  .map((loc: any): UbicacionResumen => {
    const id = String(
      loc?.id ?? loc?._id ?? loc?.raw?.id ?? loc?.raw?.locationId ?? ""
    ).trim();

    const nombre = String(
      loc?.name ?? loc?.nombre ?? loc?.raw?.name ?? loc?.raw?.LocationName ?? id
    ).trim();

    const count = Number(loc?.totalAssets ?? loc?.raw?.totalAssets ?? 0);

    return {
      id,
      nombre: nombre || id,
      count,
    };
  })
  .filter((x: UbicacionResumen) => Boolean(x.id));

out.sort((a: UbicacionResumen, b: UbicacionResumen) => b.count - a.count);
return out;
}


export async function fetchResumenTiposPorLocation(
  tenantId: string,
  location: string
): Promise<TipoResumen[]> {
  const loc = String(location || "").trim();
  if (!loc) return [];

  const locNorm = norm(loc);
  const all = await getAllAssetsCached(tenantId, {});

  const filtered = all.filter((a: RawAsset) => {
    const ubic = String(
      a?.Location ?? a?.location ?? a?.locationId ?? a?.ubicacion ?? ""
    ).trim();

    return norm(ubic) === locNorm;
  });

  return aggregateTipos(
    filtered.map((a: RawAsset) => ({
      tipo: String(
        a?.AssetType ?? a?.assetType ?? a?.type ?? a?.Type ?? a?.tipo ?? ""
      ),
      count: 1,
    }))
  );
}

export async function fetchDetallePagePorLocation(
  tenantId: string,
  location: string,
  tipo: string,
  limit = 100,
  skip = 0,
  tiposRef?: TipoResumen[]
): Promise<{ rows: DetalleRow[]; total: number; limit: number; skip: number }> {
  const loc = String(location || "").trim();
  const tipoQuery = resolveTipoForQuery(tipo, tiposRef);

  if (!loc || !tipoQuery) {
    return { rows: [], total: 0, limit, skip };
  }

  const all = await getAllAssetsCached(tenantId, {});

  const filtered = all.filter((a: RawAsset) => {
    const ubic =
      String(a?.Location ?? a?.location ?? a?.ubicacion ?? "").trim();

    const assetTipo = String(
      a?.AssetType ?? a?.type ?? a?.tipo ?? ""
    ).trim();

    return ubic === loc && canonTipo(assetTipo) === canonTipo(tipoQuery);
  });

  filtered.sort((a, b) => {
    const da = toEpochMs(a?.LastSeen ?? a?.lastSeen ?? a?.vistoUltimaVez) ?? 0;
    const db = toEpochMs(b?.LastSeen ?? b?.lastSeen ?? b?.vistoUltimaVez) ?? 0;
    return db - da;
  });

  const total = filtered.length;
  const pageItems = filtered.slice(skip, skip + limit);

  return {
    rows: pageItems.map((a) => toDetalleRow(a)),
    total,
    limit,
    skip,
  };
}

/** ---------------------------
 *  ✅ Tabla detalle por tipo (sin filtrar por estado)
 *  --------------------------*/
export async function fetchDetallePorTipo(
  _tenantId: string,
  tipo: string,
  tiposRef?: TipoResumen[]
): Promise<DetalleRow[]> {
  const [nuevos, circulacion] = await Promise.all([
    fetchDetalle(_tenantId, "nuevos", tipo, tiposRef),
    fetchDetalle(_tenantId, "circulacion", tipo, tiposRef),
  ]);
  return [...nuevos, ...circulacion];
}

/** ---------------------------
 *  ✅ Tipos en lavandería (para barras)
 *  --------------------------*/
export async function fetchLavanderiaResumenTipos(_tenantId: string): Promise<TipoResumen[]> {
  return fetchResumenTipos(_tenantId, "lavanderia");
}

export async function fetchLavanderiaRows(_tenantId: string): Promise<DetalleRow[]> {
  const tipos = await fetchResumenTipos(_tenantId, "lavanderia");
  const top = tipos.slice(0, 10);
  const rows = await Promise.all(
    top.map((t) => fetchLavanderiaDetallePorTipo(_tenantId, t.rawTipo ?? t.tipo, tipos))
  );
  return rows.flat();
}

export async function fetchLavanderiaDetallePorTipo(
  _tenantId: string,
  tipo: string,
  tiposRef?: TipoResumen[]
): Promise<DetalleRow[]> {
  const tipoQuery = resolveTipoForQuery(tipo, tiposRef);
  return fetchDetalle(_tenantId, "lavanderia", tipoQuery, tiposRef);
}

/** =========================================================
 *  ✅ 3ra FUNCIÓN: MOVIMIENTOS DIARIOS
 *  ========================================================= */

export type MovimientoEstado = "in" | "out" | "created";

export type MovResumenDia = {
  dia: string; // YYYY-MM-DD
  in: number;
  out: number;
  created: number;
  total: number;
};

export type MovimientoItem = {
  _id: string;
  fechaHora: string; // ISO o string
  estado: MovimientoEstado;
  empleado?: string;
  ubicacion?: string;
  resumen?: {
    totalProcesadas?: number;
    totalEnviadasLavanderia?: number;
    totalRecibidasHospital?: number;
  };
  detallePorTipo?: Array<{
    tipo: string;
    empleado?: string;
    entradas: number;
    salidas: number;
  }>;
};

type MovResumenResp = { items?: any[] } | any[];

export async function fetchMovimientosResumenDiario(
  tenantId: string,
  opts?: { days?: number }
): Promise<MovResumenDia[]> {
  const days = Math.max(1, Math.min(60, Number(opts?.days ?? 7)));

  const raw = await postStats<MovResumenResp>(tenantId, "/api/idlinens/movimientos-resumen-diario", {
    days,
  });

  const items: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.items)
      ? (raw as any).items
      : [];

  return items.map((d) => {
    const _in = Number(d?.in || 0);
    const out = Number(d?.out || 0);
    const created = Number(d?.created || 0);
    return {
      dia: String(d?.dia || d?.date || "").slice(0, 10),
      in: _in,
      out,
      created,
      total: Number(d?.total ?? _in + out + created),
    };
  });
}

type MovDiaResp = { items?: any[]; total?: number; limit?: number; skip?: number };

export async function fetchMovimientosDiaPage(
  tenantId: string,
  dia: string,
  limit = 50,
  skip = 0
): Promise<{ items: MovimientoItem[]; total: number; limit: number; skip: number }> {
  const raw = await postStats<MovDiaResp>(tenantId, "/api/idlinens/movimientos-dia-page", {
    dia,
    limit,
    skip,
  });

  const items = Array.isArray((raw as any)?.items) ? (raw as any).items : [];
  const total = typeof (raw as any)?.total === "number" ? (raw as any).total : items.length;

  const mapped: MovimientoItem[] = items.map((x: any) => ({
    _id: String(x?._id || x?.id || ""),
    fechaHora: String(x?.fechaHora || x?.createdAt || x?.CreatedAt || x?.ts || ""),
    estado: (String(x?.estado || x?.status || "").toLowerCase() as MovimientoEstado) || "out",
    empleado: String(x?.empleado || x?.employee || ""),
    ubicacion: String(x?.ubicacion || x?.location || x?.Location || ""),
    resumen: x?.resumen,
    detallePorTipo: Array.isArray(x?.detallePorTipo) ? x.detallePorTipo : undefined,
  }));

  return { items: mapped, total, limit, skip };
}

export function buildMovimientoPdfUrl(tenantId: string, movimientoId: string) {
  const base = `/api/idlinens/movimientos-pdf`;
  const qs = new URLSearchParams({ id: movimientoId, tenantId });
  return `${base}?${qs.toString()}`;
}
 
 //** =========================================================
 //*  ✅ INACTIVOS 15+ DÍAS
 //  ========================================================= 

type Inactivos15ResumenResp = { items?: Array<{ tipo: string; count?: number }> } | any[];

type Inactivos15DetalleResp = {
  total?: number;
  limit?: number;
  skip?: number;
  items?: RawAsset[];
};

// =========================================================
// LEGACY ACTUAL (lo dejamos para no romper nada todavía)
// =========================================================
export async function fetchInactivos15ResumenTipos(
  tenantId: string,
  opts?: { estado?: EstadoKey | "todos" }
): Promise<Inactivos15TipoResumen[]> {
  const estado = (opts?.estado ?? "todos") as any;

  const body: any = {};
  if (estado !== "todos") body.estado = estado;

  const raw = await postStats<Inactivos15ResumenResp>(
    tenantId,
    "/api/idlinens/inactivos15/resumen-tipos",
    body
  );

  const items: Array<{ tipo: string; count?: number }> = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.items)
      ? (raw as any).items
      : [];

  const tipos = aggregateTipos(
    items.map((d: any) => ({
      tipo: String(d?.tipo ?? ""),
      count: Number(d?.count || 0),
    }))
  );

  return tipos.map((t) => ({
    key: t.key,
    tipo: t.tipo,
    count: t.count,
    rawTipo: t.rawTipo,
  }));
}

// =========================================================
// NUEVO - ÚLTIMA ACTIVIDAD (>15 días)
// SOLO para la gráfica por ahora
// =========================================================
export async function fetchInactivos15UltimaActividadResumenTipos(
  tenantId: string,
  days = 15
): Promise<Inactivos15TipoResumen[]> {
  const raw = await postStats<Inactivos15ResumenResp>(
    tenantId,
    "/api/idlinens/inactivos15/ultima-actividad/resumen-tipos",
    {
  days,
  excludeStatuses: ["created", "CREATED", "nuevo", "nuevoS", "NUEVO", "NUEVOS"],
}
  );

  const items: Array<{ tipo: string; count?: number }> = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.items)
      ? (raw as any).items
      : [];

  const tipos = aggregateTipos(
    items.map((d: any) => ({
      tipo: String(d?.tipo ?? ""),
      count: Number(d?.count || 0),
    }))
  );

  return tipos.map((t) => ({
    key: t.key,
    tipo: t.tipo,
    count: t.count,
    rawTipo: t.rawTipo,
  }));
}

export async function fetchInactivos15DetallePage(
  tenantId: string,
  params: {
    estado?: EstadoKey | "todos";
    tipo?: string;
    limit?: number;
    skip?: number;
  }
): Promise<{ rows: Inactivos15DetalleRow[]; total: number; limit: number; skip: number }> {
  const estado = (params.estado ?? "todos") as any;
  const limit = params.limit ?? 10000;
  const skip = params.skip ?? 0;
  const tipoQuery = params.tipo ? String(params.tipo).trim() : "";

  const body: any = { tipo: tipoQuery, limit, skip };

  if (estado !== "todos") {
    body.estado = estado;
  }

  const raw = await postStats<Inactivos15DetalleResp>(
    tenantId,
    "/api/idlinens/inactivos15/detalle-page",
    body
  );

  const items = Array.isArray((raw as any)?.items) ? ((raw as any).items as RawAsset[]) : [];
  const total = typeof (raw as any)?.total === "number" ? (raw as any).total : items.length;

  const baseRows = items.map(toDetalleRow);

  const rows: Inactivos15DetalleRow[] = baseRows.map((r, i) => {
    const a = items[i] as any;
    return {
      ...r,
      daysInactive: typeof a?.daysInactive === "number" ? a.daysInactive : undefined,
      lastMovementAt: a?.lastMovementAt ? String(a.lastMovementAt) : undefined,
    };
  });

  return { rows, total, limit, skip };
}

export type ReportDay = { dateStr: string; count?: number };

export type ReportItem = {
  id: string;
  tenantId?: string;
  dateStr?: string;
  ranAt?: number | null;
  ranAtIso?: string | null;
  days?: number | null;
  filename?: string | null;
  bytes?: number | null;
  storagePath?: string | null;
};

async function getJson<T>(tenantId: string, path: string): Promise<T> {
  const headers = buildHeaders(tenantId);
  const resp = await fetch(path, {
    method: "GET",
    headers,
    credentials: "include",
    cache: "no-store",
  });

  const txt = await resp.text().catch(() => "");
  let data: any = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = { raw: txt };
  }

  if (!resp.ok) throw new Error(`Reports proxy error (${resp.status}): ${txt || "sin detalle"}`);
  return unwrapOk<T>(data);
}

export async function fetchReportDays(tenantId: string, limit = 30): Promise<ReportDay[]> {
  const data: any = await getJson<any>(tenantId, `/api/idlinens/reports/days?limit=${limit}`);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .map((x: any) => ({
      dateStr: String(x?.dateStr || "").trim(),
      count: typeof x?.count === "number" ? x.count : undefined,
    }))
    .filter((x: ReportDay) => !!x.dateStr);
}

export async function fetchReportsByDate(tenantId: string, dateStr: string, limit = 50): Promise<ReportItem[]> {
  const data: any = await getJson<any>(
    tenantId,
    `/api/idlinens/reports?date=${encodeURIComponent(dateStr)}&limit=${limit}`
  );
  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .map((x: any) => ({
      id: String(x?.id || "").trim(),
      tenantId: x?.tenantId,
      dateStr: x?.dateStr,
      ranAt: x?.ranAt ?? null,
      ranAtIso: x?.ranAtIso ?? null,
      days: x?.days ?? null,
      filename: x?.filename ?? null,
      bytes: x?.bytes ?? null,
      storagePath: x?.storagePath ?? null,
    }))
    .filter((x: ReportItem) => !!x.id);
}

export function getReportDownloadUrl(reportId: string) {
  return `/api/idlinens/reports/download?id=${encodeURIComponent(reportId)}`;
}
export async function fetchInactivos15UltimaActividadDetallePage(
  tenantId: string,
  params: {
    tipo?: string;
    limit?: number;
    skip?: number;
    days?: number;
  }
): Promise<{ rows: Inactivos15DetalleRow[]; total: number; limit: number; skip: number }> {
  const limit = params.limit ?? 10000;
  const skip = params.skip ?? 0;
  const tipoQuery = params.tipo ? String(params.tipo).trim() : "";
  const days = params.days ?? 15;

  const raw = await postStats<Inactivos15DetalleResp>(
    tenantId,
    "/api/idlinens/inactivos15/ultima-actividad/detalle-page",
    {
  tipo: tipoQuery,
  limit,
  skip,
  days,
  excludeStatuses: ["created", "CREATED", "nuevo", "NUEVO", "nuevos", "NUEVOS"],
}
  );

  const items = Array.isArray((raw as any)?.items) ? ((raw as any).items as RawAsset[]) : [];
  const total = typeof (raw as any)?.total === "number" ? (raw as any).total : items.length;

  const baseRows = items.map(toDetalleRow);

  const rows: Inactivos15DetalleRow[] = baseRows.map((r, i) => {
    const a = items[i] as any;
    return {
      ...r,
      daysInactive: typeof a?.daysInactive === "number" ? a.daysInactive : undefined,
      lastMovementAt: a?.lastMovementAt ? String(a.lastMovementAt) : undefined,
    };
  });

  return { rows, total, limit, skip };
}

export async function fetchInactivos15NuevosCreatedDetallePage(
  tenantId: string,
  params: {
    tipo?: string;
    limit?: number;
    skip?: number;
    days?: number;
  }
): Promise<{ rows: Inactivos15DetalleRow[]; total: number; limit: number; skip: number }> {
  const limit = params.limit ?? 10000;
  const skip = params.skip ?? 0;
  const tipoQuery = params.tipo ? String(params.tipo).trim() : "";
  const days = params.days ?? 15;

  const raw = await postStats<Inactivos15DetalleResp>(
    tenantId,
    "/api/idlinens/inactivos-nuevos-created/detalle-page",
    {
      tipo: tipoQuery,
      limit,
      skip,
      days,
    }
  );

  const items = Array.isArray((raw as any)?.items) ? ((raw as any).items as RawAsset[]) : [];
  const total = typeof (raw as any)?.total === "number" ? (raw as any).total : items.length;

 const baseRows = items.map(toDetalleRow);

const rows: Inactivos15DetalleRow[] = baseRows.map((r, i) => {
  const a = items[i] as any;
  const rr = r as any;

  return {
    ...r,

    _id: a?._id ?? a?.id ?? rr?._id,
    id: a?.id ?? a?._id ?? rr?._id,

    tag: a?.tag ?? a?.AssetTag ?? rr?.tag,
    AssetTag: a?.AssetTag ?? a?.tag ?? rr?.tag,

    tipo: a?.tipo ?? a?.AssetType ?? a?.assetType ?? rr?.tipo,
    AssetType: a?.AssetType ?? a?.assetType ?? a?.tipo ?? rr?.tipo,

    ubicacion: a?.ubicacion ?? a?.Location ?? a?.location ?? a?.locationId ?? rr?.ubicacion,
    location: a?.location ?? a?.Location ?? a?.ubicacion ?? a?.locationId ?? rr?.location,
    Location: a?.Location ?? a?.ubicacion ?? a?.location ?? a?.locationId ?? rr?.Location,

    estado: a?.estado ?? a?.status ?? a?.Status ?? rr?.estado,
    status: a?.status ?? a?.Status ?? a?.estado ?? rr?.status,
    Status: a?.Status ?? a?.status ?? a?.estado ?? rr?.Status,

    Created: a?.Created ?? a?.createdAt ?? a?.CreatedAt ?? rr?.Created,
    createdAt: a?.createdAt ?? a?.Created ?? a?.CreatedAt ?? rr?.createdAt,
    CreatedAt: a?.CreatedAt ?? a?.Created ?? a?.createdAt ?? rr?.CreatedAt,

    LastSeen: a?.LastSeen ?? a?.lastSeen ?? rr?.LastSeen,
    lastSeen: a?.lastSeen ?? a?.LastSeen ?? rr?.lastSeen,

    employee:
      a?.employee ??
      a?.Employee ??
      a?.empleado ??
      a?.Empleado ??
      a?.PersonnelName ??
      a?.personnelName ??
      a?.x_employee ??
      a?.assignedTo ??
      a?.AssignedTo ??
      rr?.employee,

    Empleado:
      a?.Empleado ??
      a?.empleado ??
      a?.PersonnelName ??
      a?.personnelName ??
      a?.x_employee ??
      rr?.Empleado,

    PersonnelName:
      a?.PersonnelName ??
      a?.personnelName ??
      a?.Empleado ??
      a?.empleado ??
      a?.x_employee ??
      rr?.PersonnelName,

    antiguedadDias: a?.antiguedadDias ?? rr?.antiguedadDias,
    diasLavanderia: a?.diasLavanderia ?? rr?.diasLavanderia,
    diasEnLavanderia:
      a?.diasEnLavanderia ??
      a?.diasLavanderia ??
      rr?.diasEnLavanderia,

    daysInactive:
      typeof a?.daysInactive === "number"
        ? a.daysInactive
        : rr?.daysInactive,

    lastMovementAt: a?.lastMovementAt
      ? String(a.lastMovementAt)
      : rr?.lastMovementAt,
  } as Inactivos15DetalleRow;
});

  return { rows, total, limit, skip };
}

/** ---------------------------
 *  Export util
 *  --------------------------*/
export { filterForEstado, getAllAssetsCached };