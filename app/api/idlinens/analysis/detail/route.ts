// app/api/idlinens/analysis/detail/route.ts
import { NextRequest, NextResponse } from "next/server";
import { searchAssetsWithSession } from "@/lib/cloudApi";
import { __getAnalysisCache, __setAnalysisCache } from "../route";

export const dynamic = "force-dynamic";

const RETIRED_LOCATION_ID = "Blancos Retirados";

// =====================
// Tipos
// =====================
type AnalysisAsset = {
  _id: string;
  tag: string;
  tipo: string;
  status: string;
  location: string;
  ciclosLavado: number;
  createdAtMs: number | null;
};

type CacheEntry = {
  ts: number;
  assets: AnalysisAsset[];
};

// =====================
// Utils
// =====================
function cleanStr(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

function cleanNum(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseDateToMs(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;

  // epoch seconds / ms
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) {
    const ms = n > 9_999_999_999 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : ms;
  }

  const d2 = new Date(v);
  if (!Number.isNaN(d2.getTime())) return d2.getTime();
  return null;
}

function pickStr(...vals: any[]) {
  for (const v of vals) {
    const s = cleanStr(v);
    if (s) return s;
  }
  return "";
}

function weekFromAgeDays(ageDays: number) {
  return Math.max(1, Math.floor(ageDays / 7) + 1);
}

function normalizeKey(s: string) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function isCreatedStatus(status: string) {
  const k = normalizeKey(status);
  return k === "created" || k === "creado" || k === "nuevo" || k === "nuevos";
}

function getTokensFromReq(req: NextRequest, body: any) {
  const sessionToken =
    cleanStr(body?.sessionToken || body?.auth?.token) ||
    cleanStr(req.headers.get("x-session-token"));

  // JWT Firebase (Gateway)
  const idToken = cleanStr(body?.idToken);
  const authHeader =
    cleanStr(req.headers.get("authorization")) || (idToken ? `Bearer ${idToken}` : "");

  const tenantHint =
    cleanStr(req.headers.get("x-tenant-id")) ||
    cleanStr(req.cookies.get("cloudSelectedTenantId")?.value);

  return { sessionToken, authHeader, tenantHint };
}

// =====================
// Mappers (mismos criterios que analysis/route.ts)
// =====================
function toAnalysisAsset(a: any): AnalysisAsset {
  const tag = pickStr(
    a?.AssetTag,
    a?.tag,
    a?.custom?.AssetTag,
    a?.custom?.tag,
    a?.custom?.fields?.AssetTag,
    a?.custom?.fields?.tag,
    a?._id,
    a?.id,
    ""
  );

  const _id = pickStr(a?._id, a?.id, tag);

  const tipo = pickStr(
    a?.AssetType,
    a?.type,
    a?.tipo,
    a?.Description,

    a?.custom?.AssetType,
    a?.custom?.type,
    a?.custom?.tipo,
    a?.custom?.Description,

    a?.custom?.fields?.AssetType,
    a?.custom?.fields?.type,
    a?.custom?.fields?.tipo,
    a?.custom?.fields?.Description,

    "—"
  );

  const status = pickStr(
    a?.Status,
    a?.status,
    a?.custom?.Status,
    a?.custom?.status,
    a?.custom?.fields?.Status,
    a?.custom?.fields?.status,
    "created"
  );

  const location = pickStr(
    a?.Location,
    a?.location,
    a?.ubicacion,
    a?.locationId,

    a?.custom?.Location,
    a?.custom?.location,
    a?.custom?.ubicacion,
    a?.custom?.locationId,

    a?.custom?.fields?.Location,
    a?.custom?.fields?.location,
    a?.custom?.fields?.ubicacion,
    a?.custom?.fields?.locationId,

    "—"
  );

  const ciclosLavado =
    Number(
      a?.ciclosLavado ??
        a?.washCycles ??
        a?.custom?.ciclosLavado ??
        a?.custom?.CiclosLavado ??
        a?.custom?.fields?.ciclosLavado ??
        a?.custom?.fields?.CiclosLavado ??
        0
    ) || 0;

  // ✅ AJUSTE CLAVE: tu tenant HACH trae Created / LastSeen (epoch seconds)
  // createdAt con fallback a lastSeen si no existe
  const createdAtMs =
    parseDateToMs(a?.Created) ?? // ✅ real (captura)
    parseDateToMs(a?.CreatedAt) ??
    parseDateToMs(a?.createdAt) ??
    parseDateToMs(a?.created) ??
    parseDateToMs(a?.creado) ??
    parseDateToMs(a?.custom?.Created) ??
    parseDateToMs(a?.custom?.CreatedAt) ??
    parseDateToMs(a?.custom?.createdAt) ??
    parseDateToMs(a?.custom?.created) ??
    parseDateToMs(a?.custom?.creado) ??
    parseDateToMs(a?.custom?.fields?.Created) ??
    parseDateToMs(a?.custom?.fields?.CreatedAt) ??
    parseDateToMs(a?.custom?.fields?.createdAt) ??
    parseDateToMs(a?.custom?.fields?.created) ??
    parseDateToMs(a?.custom?.fields?.creado) ??
    parseDateToMs(a?.LastSeen) ?? // ✅ real (captura)
    parseDateToMs(a?.lastSeen) ??
    parseDateToMs(a?.vistoUltimaVez) ??
    parseDateToMs(a?.custom?.LastSeen) ??
    parseDateToMs(a?.custom?.lastSeen) ??
    parseDateToMs(a?.custom?.vistoUltimaVez) ??
    null;

  return { _id, tag, tipo, status, location, ciclosLavado, createdAtMs };
}

// =====================
// ✅ Cache: asegurar y GUARDAR en el Map del route padre
// =====================
async function ensureAnalysisCache(params: {
  tenantId: string;
  sessionToken: string;
  authHeader: string;
  ttlSeconds?: number;
  maxScan?: number;
  pageSize?: number;
}): Promise<{ entry: CacheEntry; cacheHit: boolean; scannedRaw: number }> {
  const tenantId = String(params.tenantId || "").trim();
  const ttlSeconds = Math.max(5, Math.min(Number(params.ttlSeconds ?? 60), 600));
  const maxScan = Math.max(100, Math.min(Number(params.maxScan ?? 50_000), 300_000));
  const pageSize = Math.max(100, Math.min(Number(params.pageSize ?? 1000), 5000));

  const cached = __getAnalysisCache(tenantId) as CacheEntry | undefined;
  const now = Date.now();
  if (cached && now - cached.ts < ttlSeconds * 1000) {
    return { entry: cached, cacheHit: true, scannedRaw: 0 };
  }

  // Scan paginado (igual que analysis/route.ts)
  const assets: AnalysisAsset[] = [];
  let skip = 0;
  let guardSameFirstId = "";
  let scannedRaw = 0;

  while (assets.length < maxScan) {
    const resp = await searchAssetsWithSession(params.sessionToken, {}, pageSize, skip, params.authHeader, tenantId);
    const itemsRaw: any[] = Array.isArray((resp as any)?.assets) ? (resp as any).assets : [];
    if (!itemsRaw.length) break;

    scannedRaw += itemsRaw.length;

    const firstId = pickStr(itemsRaw[0]?._id, itemsRaw[0]?.id, itemsRaw[0]?.AssetTag, itemsRaw[0]?.tag);
    if (firstId && firstId === guardSameFirstId) break;
    guardSameFirstId = firstId;

    for (const raw of itemsRaw) {
      const mapped = toAnalysisAsset(raw);
      // analysis normal excluye retirados
      if (cleanStr(mapped.location) === RETIRED_LOCATION_ID) continue;

      assets.push(mapped);
      if (assets.length >= maxScan) break;
    }

    skip += itemsRaw.length;

    const total = Number((resp as any)?.total ?? 0);
    if (total && skip >= total) break;
    if (itemsRaw.length < pageSize) break;
  }

  const entry: CacheEntry = { ts: Date.now(), assets };
  // ✅ ahora sí: lo guardamos en el módulo padre (route.ts)
  __setAnalysisCache(tenantId, entry);

  return { entry, cacheHit: false, scannedRaw };
}

// =====================
// Route
// =====================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionToken, authHeader, tenantHint } = getTokensFromReq(req, body);

    if (!tenantHint) {
      return NextResponse.json({ ok: false, error: "Falta x-tenant-id." }, { status: 400 });
    }
    if (!sessionToken) {
      return NextResponse.json({ ok: false, error: "Falta sessionToken." }, { status: 401 });
    }

    const mode = cleanStr(body?.mode); // "cycles" | "inactive" | "age" | "ageTipo"
    const tipo = cleanStr(body?.tipo);
    const week = cleanNum(body?.week, 0);

    const limit = Math.max(1, Math.min(cleanNum(body?.limit, 100), 500));
    const skip = Math.max(0, cleanNum(body?.skip, 0));

    if (!mode) {
      return NextResponse.json({ ok: false, error: "Falta mode." }, { status: 400 });
    }

    // ========
    // AGE / AGETIPO: usa cache (y si no hay, lo genera aquí y lo guarda)
    // ========
    if (mode === "age" || mode === "ageTipo") {
      if (!week || week < 1) {
        return NextResponse.json({ ok: false, error: "Falta week>=1." }, { status: 400 });
      }
      if (mode === "ageTipo" && !tipo) {
        return NextResponse.json({ ok: false, error: "Falta tipo para mode=ageTipo." }, { status: 400 });
      }

      const ttlSeconds = cleanNum(body?.ttlSeconds, 60);
      const maxScan = cleanNum(body?.maxScan, 50_000);
      const pageSize = cleanNum(body?.pageSize, 1000);

      const { entry, cacheHit, scannedRaw } = await ensureAnalysisCache({
        tenantId: tenantHint,
        sessionToken,
        authHeader,
        ttlSeconds,
        maxScan,
        pageSize,
      });

      const nowMs = Date.now();
      const tipoKey = mode === "ageTipo" ? normalizeKey(tipo) : "";

      const filtered = entry.assets.filter((a) => {
        if (cleanStr(a.location) === RETIRED_LOCATION_ID) return false;
        if (!a.createdAtMs) return false;

        const ageDays = Math.max(0, Math.floor((nowMs - a.createdAtMs) / 86_400_000));
        if (weekFromAgeDays(ageDays) !== week) return false;

        if (mode === "ageTipo") {
          return normalizeKey(cleanStr(a.tipo)) === tipoKey;
        }
        return true;
      });

      filtered.sort((x, y) => Number(x.createdAtMs ?? 0) - Number(y.createdAtMs ?? 0));

      const total = filtered.length;
      const page = filtered.slice(skip, skip + limit);

      return NextResponse.json(
        {
          ok: true,
          items: page,
          total,
          limit,
          skip,
          meta: {
            source: cacheHit ? "cache" : "scan",
            cachedAt: entry.ts,
            scanned: entry.assets.length,
            scannedRaw,
            mode,
            week,
            tipo: mode === "ageTipo" ? tipo : undefined,
          },
        },
        { status: 200 }
      );
    }

    // ========
    // CYCLES / INACTIVE: cloud paginado por tipo (rápido)
    // ========
    if ((mode === "cycles" || mode === "inactive") && !tipo) {
      return NextResponse.json({ ok: false, error: "Falta tipo." }, { status: 400 });
    }

    const filters: Record<string, string> = {
      AssetType: tipo,
    };

    // Inactive: pedimos created y luego filtramos para variantes (creado/nuevo)
    if (mode === "inactive") {
      filters["Status"] = "created";
    }

    const resp = await searchAssetsWithSession(sessionToken, filters, limit, skip, authHeader, tenantHint);
    const itemsRaw: any[] = Array.isArray((resp as any)?.assets) ? (resp as any).assets : [];

    const mapped: AnalysisAsset[] = itemsRaw
      .map(toAnalysisAsset)
      .filter((r) => cleanStr(r.location) !== RETIRED_LOCATION_ID)
      .filter((r) => (mode !== "inactive" ? true : isCreatedStatus(cleanStr(r.status))));

    // Nota: total del backend puede incluir cosas que luego filtramos (retirados/variantes)
    const backendTotal = Number((resp as any)?.total ?? 0);
    const totalApprox = backendTotal || mapped.length;

    return NextResponse.json(
      {
        ok: true,
        items: mapped,
        total: totalApprox,
        limit,
        skip,
        meta: {
          source: "cloud-search",
          mode,
          note:
            "total puede ser aproximado si backend cuenta items que luego filtramos en server. Items sí están filtrados.",
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Error en /api/idlinens/analysis/detail",
        details: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}