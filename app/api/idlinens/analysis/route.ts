// app/api/idlinens/analysis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { searchAssetsWithSession } from "@/lib/cloudApi";

export const dynamic = "force-dynamic";

const RETIRED_LOCATION_ID = "Blancos Retirados";

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
  ts: number; // ms
  assets: AnalysisAsset[];
};

const _analysisCache = new Map<string, CacheEntry>();

export function __getAnalysisCache(tenantId: string) {
  return _analysisCache.get(String(tenantId || "").trim());
}

// ✅ NUEVO: setter para que analysis/detail pueda guardar el scan en el mismo cache
export function __setAnalysisCache(tenantId: string, entry: CacheEntry) {
  const key = String(tenantId || "").trim();
  if (!key) return;
  _analysisCache.set(key, entry);
}

function cleanStr(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

function cleanNum(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickStr(...vals: any[]) {
  for (const v of vals) {
    const s = cleanStr(v);
    if (s) return s;
  }
  return "";
}

function parseDateToMs(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;

  // epoch sec / ms
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) {
    const ms = n > 9_999_999_999 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : ms;
  }

  // ISO string
  const d2 = new Date(v);
  if (!Number.isNaN(d2.getTime())) return d2.getTime();
  return null;
}

function weekFromAgeDays(ageDays: number) {
  return Math.max(1, Math.floor(ageDays / 7) + 1);
}

function getTokensFromReq(req: NextRequest, body: any) {
  const sessionToken =
    cleanStr(body?.sessionToken || body?.auth?.token) ||
    cleanStr(req.headers.get("x-session-token"));

  const idToken = cleanStr(body?.idToken);

  // Gateway valida Authorization Bearer <FirebaseIdToken>
  const authHeader =
    cleanStr(req.headers.get("authorization")) || (idToken ? `Bearer ${idToken}` : "");

  const tenantHint =
    cleanStr(req.headers.get("x-tenant-id")) ||
    cleanStr(req.cookies.get("cloudSelectedTenantId")?.value);

  return { sessionToken, authHeader, tenantHint };
}

/** Normaliza para comparar status (created/creado/nuevo/nuevos) */
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
  // ✅ cubre tenants que mandan created/creado/nuevo/nuevos
  return k === "created" || k === "creado" || k === "nuevo" || k === "nuevos";
}

function toAnalysisAsset(a: any): AnalysisAsset {
  // ✅ tag/id robusto
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

  // ✅ tipo robusto
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

  // ✅ status robusto
  const status = pickStr(
    a?.Status,
    a?.status,
    a?.custom?.Status,
    a?.custom?.status,
    a?.custom?.fields?.Status,
    a?.custom?.fields?.status,
    "created"
  );

  // ✅ location robusto
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

  // ✅ ciclos robusto
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

  // ✅ AJUSTE CLAVE: soporta Created (epoch seconds) del tenant HACH
  // Si no existe created, hace fallback a lastSeen/vistoUltimaVez
  const createdAtMs =
    parseDateToMs(a?.Created) ?? // ✅ real
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
    // fallback a "última vez visto"
    parseDateToMs(a?.LastSeen) ?? // ✅ real
    parseDateToMs(a?.lastSeen) ??
    parseDateToMs(a?.vistoUltimaVez) ??
    parseDateToMs(a?.custom?.LastSeen) ??
    parseDateToMs(a?.custom?.lastSeen) ??
    parseDateToMs(a?.custom?.vistoUltimaVez) ??
    null;

  return { _id, tag, tipo, status, location, ciclosLavado, createdAtMs };
}

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

    const ttlSeconds = Math.max(5, Math.min(cleanNum(body?.ttlSeconds, 60), 600));
    const maxScan = Math.max(100, Math.min(cleanNum(body?.maxScan, 50_000), 300_000));
    const pageSize = Math.max(100, Math.min(cleanNum(body?.pageSize, 1000), 5000));

    const cacheKey = String(tenantHint).trim();
    const now = Date.now();
    const cached = _analysisCache.get(cacheKey);

    if (cached && now - cached.ts < ttlSeconds * 1000) {
      const summary = buildSummaryFromAssets(cached.assets);
      return NextResponse.json(
        {
          ok: true,
          ...summary,
          meta: {
            cacheHit: true,
            ttlSeconds,
            scanned: cached.assets.length,
            maxScan,
            pageSize,
          },
        },
        { status: 200 }
      );
    }

    // Scan paginado
    const assets: AnalysisAsset[] = [];
    let skip = 0;
    let guardSameFirstId = "";
    let scannedRaw = 0;

    while (assets.length < maxScan) {
      const resp = await searchAssetsWithSession(sessionToken, {}, pageSize, skip, authHeader, cacheKey);

      const itemsRaw: any[] = Array.isArray((resp as any)?.assets) ? (resp as any).assets : [];
      if (!itemsRaw.length) break;

      scannedRaw += itemsRaw.length;

      const firstId = pickStr(itemsRaw[0]?._id, itemsRaw[0]?.id, itemsRaw[0]?.AssetTag, itemsRaw[0]?.tag);
      if (firstId && firstId === guardSameFirstId) break;
      guardSameFirstId = firstId;

      for (const raw of itemsRaw) {
        const mapped = toAnalysisAsset(raw);

        assets.push(mapped);
        if (assets.length >= maxScan) break;
      }

      skip += itemsRaw.length;

      const total = Number((resp as any)?.total ?? 0);
      if (total && skip >= total) break;
      if (itemsRaw.length < pageSize) break;
    }

    const entry: CacheEntry = { ts: Date.now(), assets };
    _analysisCache.set(cacheKey, entry); // normal
    // ✅ extra: por si lo quieres usar desde detail con el setter también
    __setAnalysisCache(cacheKey, entry);

    const summary = buildSummaryFromAssets(assets);

    return NextResponse.json(
      {
        ok: true,
        ...summary,
        meta: {
          cacheHit: false,
          ttlSeconds,
          scanned: assets.length,
          scannedRaw,
          truncated: assets.length >= maxScan,
          maxScan,
          pageSize,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Error en /api/idlinens/analysis",
        details: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}

function buildSummaryFromAssets(assets: AnalysisAsset[]) {
  const nowMs = Date.now();

    // cyclesByType (PROMEDIO) — excluye location Nuevos
  const cyclesMap = new Map<string, { total: number; count: number }>();

  for (const a of assets) {
    const tipo = cleanStr(a.tipo);
    if (!tipo) continue;

    const loc = normalizeKey(cleanStr(a.location));

    // ❌ quitar location Nuevos
    if (loc === "nuevos" || loc === "nuevo") continue;

    const ciclos = Number(a.ciclosLavado) || 0;

    const current = cyclesMap.get(tipo) || { total: 0, count: 0 };
    current.total += ciclos;
    current.count += 1;

    cyclesMap.set(tipo, current);
  }

  const cyclesByType = [...cyclesMap.entries()]
    .map(([tipo, d]) => ({
      tipo,
      // se deja el nombre totalCycles para NO romper el frontend actual
      totalCycles: d.count > 0 ? Number((d.total / d.count).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.totalCycles - a.totalCycles);

  // ✅ inactiveByType (COUNT) => TODOS los "nuevos": created/creado/nuevo/nuevos
  const inactiveMap = new Map<string, number>();
  for (const a of assets) {
    if (!isCreatedStatus(cleanStr(a.status))) continue;
    const tipo = cleanStr(a.tipo);
    if (!tipo) continue;
    inactiveMap.set(tipo, (inactiveMap.get(tipo) || 0) + 1);
  }

  const inactiveByType = [...inactiveMap.entries()]
    .map(([tipo, count]) => ({ tipo, count }))
    .sort((a, b) => b.count - a.count);

  // ✅ ageByWeek (COUNT)
  const ageMap = new Map<number, number>();
  let missingCreatedAt = 0;

  for (const a of assets) {
    if (!a.createdAtMs) {
      missingCreatedAt++;
      continue;
    }
    const ageDays = Math.max(0, Math.floor((nowMs - a.createdAtMs) / 86_400_000));
    const week = weekFromAgeDays(ageDays);
    ageMap.set(week, (ageMap.get(week) || 0) + 1);
  }

  const ageByWeek = [...ageMap.entries()]
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week - b.week);

  return {
    cyclesByType,
    inactiveByType,
    ageByWeek,
    debug: { missingCreatedAt },
  };
}