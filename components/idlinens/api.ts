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

/** ---------------------------
 *  🔐 TOKENS (de tu login)
 *  --------------------------*/
function getAuthTokens() {
  if (typeof window === "undefined") return { sessionToken: "", idToken: "" };
  const sessionToken = (localStorage.getItem("cloudSessionToken") || "").trim();
  const idToken = (localStorage.getItem("cloudIdToken") || "").trim();
  return { sessionToken, idToken };
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

  [k: string]: any;
};

type AssetsProxyResponse = { items: RawAsset[]; total?: number } | RawAsset[];
type AssetsPage = { items: RawAsset[]; total?: number };

/** ---------------------------
 *  ⚡ Cache en memoria (cliente)
 *  --------------------------*/
const _assetsCacheByKey = new Map<string, { ts: number; items: RawAsset[] }>();
const _inflightByKey = new Map<string, Promise<RawAsset[]>>();

/**
 * ✅ AJUSTE (sin romper nada): el cache key ahora incluye tenantId
 * para evitar que un tenant “contamine” el cache de otro.
 */
function makeCacheKey(tenantId: string, filter: Record<string, any>) {
  return JSON.stringify({ tenantId: String(tenantId || "").trim(), filter: filter || {} });
}

async function getAllAssetsCached(
  tenantId: string,
  filter: Record<string, any> = {}
) {
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
  if (!sessionToken)
    throw new Error("No hay sessionToken (cloudSessionToken) en localStorage");

  const resp = await fetch("/api/idlinens/assets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenantId,
    },
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

  if (!resp.ok)
    throw new Error(`Assets proxy error (${resp.status}): ${txt || "sin detalle"}`);

  if (Array.isArray(data)) return { items: data, total: undefined };

  const items = Array.isArray((data as any).items) ? (data as any).items : [];
  const total =
    typeof (data as any).total === "number" ? (data as any).total : undefined;
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
  if (!sessionToken)
    throw new Error("No hay sessionToken (cloudSessionToken) en localStorage");

  const resp = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenantId,
    },
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

  if (!resp.ok)
    throw new Error(`Stats proxy error (${resp.status}): ${txt || "sin detalle"}`);
  return data as T;
}

type DetallePageResp = {
  total?: number;
  limit?: number;
  skip?: number;
  items?: RawAsset[];
};

async function postDetallePage(params: {
  tenantId: string;
  estado: EstadoKey;
  tipo: string;
  limit?: number;
  skip?: number;
}): Promise<{ items: RawAsset[]; total: number; limit: number; skip: number }> {
  const r = await postStats<DetallePageResp>(
    params.tenantId,
    "/api/idlinens/detalle-page",
    { estado: params.estado, tipo: params.tipo, limit: params.limit, skip: params.skip }
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

/** ✅ Opcional bonito: MAYÚSCULAS conservando Ñ/acentos */
function upperKeepAccents(s: string) {
  return String(s ?? "").trim().toLocaleUpperCase("es-MX");
}

/** ✅ Agrega + suma, PERO conserva display con Ñ/acentos */
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
      tipo: v.display, // ✅ aquí se pinta con Ñ/acentos
      count: v.count,
      rawTipo: v.rawTipo, // ✅ para consultas
    }))
    .sort((a, b) => b.count - a.count);
}

/** ✅ resuelve display/canon -> raw (para que DetallePage NO regrese 0) */
function resolveTipoForQuery(tipo: string, tipos?: TipoResumen[]) {
  const t = String(tipo ?? "").trim();
  if (!t) return t;

  const key = canonTipo(t);
  const found = (tipos ?? []).find((x) => (x.key ? x.key === key : canonTipo(x.tipo) === key));
  return found?.rawTipo?.trim() || t;
}

/** ✅ AQUÍ ESTÁ EL CAMBIO IMPORTANTE: ya NO canonizamos en tablas */
function toTipo(a: RawAsset) {
  const raw = toStr(a.AssetType) || toStr(a.type) || toStr(a.tipo) || "SIN_TIPO";

  // Si quieres MAYÚSCULAS con Ñ: deja la siguiente línea
  return upperKeepAccents(raw) || "SIN_TIPO";

  // Si lo quieres tal cual como viene de la API (respetando may/min):
  // return raw || "SIN_TIPO";
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
  return toStr(a.Status) || toStr(a.status) || "";
}

function toEmpleado(a: RawAsset) {
  return toStr(a.employee) || toStr(a.empleado) || "";
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

  const ciclosLavado =
    toNumberSafe((a as any).ciclosLavado, NaN) || toNumberSafe((a as any).washCycles, 0);

  const visto =
    toDateStr((a as any).vistoUltimaVez) ||
    toDateStr((a as any).lastSeen) ||
    toDateStr((a as any).LastSeen);

  const creado =
    toDateStr((a as any).creado) ||
    toDateStr((a as any).createdAt) ||
    toDateStr((a as any).CreatedAt);

  const ubic = toUbicacion(a);

  return {
    tipo,
    _id: toId(a),
    tag: toTag(a) || undefined,
    estado: estadoKey ? estadoLabel(estadoKey) : undefined,
    vistoUltimaVez: visto || "",
    creado: creado || "",
    ciclosLavado,
    antiguedadDias: toNumberSafe((a as any).antiguedadDias, 0),
    diasLavanderia: toNumberSafe((a as any).diasLavanderia, 0),
    ubicacion: ubic || undefined,
    empleado: toEmpleado(a),
  };
}

/** ---------------------------
 *  ✅ 1) Resumen por estado
 *  --------------------------*/
export async function fetchResumenEstados(_tenantId: string): Promise<EstadoResumen[]> {
  const raw = await postStats<any>(_tenantId, "/api/idlinens/resumen-estados", {});
  const items: Array<{ estado: EstadoKey; count?: number; label?: string }> =
    Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];

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
  estado: EstadoKey
): Promise<TipoResumen[]> {
  const raw = await postStats<any>(_tenantId, "/api/idlinens/resumen-tipos", { estado });

  const items: Array<{ tipo: string; count?: number }> =
    Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];

  return aggregateTipos(
    items.map((d: any) => ({
      tipo: String(d?.tipo ?? ""),
      count: Number(d?.count || 0),
    }))
  );
}

/** ---------------------------
 *  ✅ 3) Detalle tabla por estado + tipo
 *  --------------------------*/
export async function fetchDetallePage(
  _tenantId: string,
  estado: EstadoKey,
  tipo: string,
  limit = 100,
  skip = 0,
  tiposRef?: TipoResumen[]
): Promise<{ rows: DetalleRow[]; total: number; limit: number; skip: number }> {
  const tipoQuery = resolveTipoForQuery(tipo, tiposRef);

  const page = await postDetallePage({
    tenantId: _tenantId,
    estado,
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

export async function fetchDetalle(
  _tenantId: string,
  estado: EstadoKey,
  tipo: string,
  tiposRef?: TipoResumen[]
): Promise<DetalleRow[]> {
  const out: DetalleRow[] = [];
  const SAFE_MAX = 5000;
  let skip = 0;
  const limit = 300;

  const tipoQuery = resolveTipoForQuery(tipo, tiposRef);

  while (out.length < SAFE_MAX) {
    const page = await postDetallePage({
      tenantId: _tenantId,
      estado,
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
  const items: Array<{ tipo: string; count?: number }> =
    Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];

  return aggregateTipos(
    items.map((d: any) => ({
      tipo: String(d?.tipo ?? ""),
      count: Number(d?.count || 0),
    }))
  );
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
  // ✅ Ajuste “seguro”: resolvemos tipo canon->raw si nos pasan referencia,
  // pero si no, se comporta igual que antes.
  const tipoQuery = resolveTipoForQuery(tipo, tiposRef);
  return fetchDetalle(_tenantId, "lavanderia", tipoQuery, tiposRef);
}

/** =========================================================
 *  ✅ 3ra FUNCIÓN: MOVIMIENTOS DIARIOS (NUEVO)
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

/**
 * ✅ Resumen por día (últimos N días)
 * ⚠️ Ajusta SOLO el path si tu backend lo tiene distinto.
 */
export async function fetchMovimientosResumenDiario(
  tenantId: string,
  opts?: { days?: number }
): Promise<MovResumenDia[]> {
  const days = Math.max(1, Math.min(60, Number(opts?.days ?? 7)));

  const raw = await postStats<MovResumenResp>(
    tenantId,
    "/api/idlinens/movimientos-resumen-diario",
    { days }
  );

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

/**
 * ✅ Lista paginada de transacciones de un día
 * ⚠️ Ajusta SOLO el path si tu backend lo tiene distinto.
 */
export async function fetchMovimientosDiaPage(
  tenantId: string,
  dia: string, // YYYY-MM-DD
  limit = 50,
  skip = 0
): Promise<{ items: MovimientoItem[]; total: number; limit: number; skip: number }> {
  const raw = await postStats<MovDiaResp>(
    tenantId,
    "/api/idlinens/movimientos-dia-page",
    { dia, limit, skip }
  );

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

/**
 * ✅ URL para descargar PDF de una transacción
 * ⚠️ Ajusta SOLO el path si tu backend lo tiene distinto.
 */
export function buildMovimientoPdfUrl(tenantId: string, movimientoId: string) {
  const base = `/api/idlinens/movimientos-pdf`;
  const qs = new URLSearchParams({ id: movimientoId, tenantId });
  return `${base}?${qs.toString()}`;
}




/** ---------------------------
 *  (Opcional) Export util si lo ocupas en otros lados
 *  --------------------------*/
export { filterForEstado, getAllAssetsCached };
