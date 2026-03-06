// app/api/idlinens/retirados/analysis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { searchAssetsWithSession } from "@/lib/cloudApi";

export const dynamic = "force-dynamic";

const RETIRED_LOCATION_ID = "Blancos Retirados";

type RetAsset = {
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
  assets: RetAsset[];
};

const _retiradosCache = new Map<string, CacheEntry>();

export function __getRetiradosCache(tenantId: string) {
  return _retiradosCache.get(String(tenantId || "").trim());
}

export function __setRetiradosCache(tenantId: string, entry: CacheEntry) {
  const key = String(tenantId || "").trim();
  if (!key) return;
  _retiradosCache.set(key, entry);
}

// ---------------------
// Utils
// ---------------------
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

function weekFromAgeDays(ageDays: number) {
  return Math.max(1, Math.floor(ageDays / 7) + 1);
}

function getTokensFromReq(req: NextRequest, body: any) {
  const sessionToken =
    cleanStr(body?.sessionToken || body?.auth?.token) ||
    cleanStr(req.headers.get("x-session-token"));

  const idToken = cleanStr(body?.idToken);

  const authHeader =
    cleanStr(req.headers.get("authorization")) || (idToken ? `Bearer ${idToken}` : "");

  const tenantHint =
    cleanStr(req.headers.get("x-tenant-id")) ||
    cleanStr(req.cookies.get("cloudSelectedTenantId")?.value);

  return { sessionToken, authHeader, tenantHint };
}

// ---------------------
// Mapper (igual estilo que analysis)
// ---------------------
function toRetAsset(a: any): RetAsset {
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
    "in"
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

  // ✅ soporte para tenant HACH: Created / LastSeen epoch seconds
  const createdAtMs =
    parseDateToMs(a?.Created) ??
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
    // fallback
    parseDateToMs(a?.LastSeen) ??
    parseDateToMs(a?.lastSeen) ??
    parseDateToMs(a?.vistoUltimaVez) ??
    null;

  return { _id, tag, tipo, status, location, ciclosLavado, createdAtMs };
}

// ---------------------
// Summary builder (3 gráficas)
// ---------------------
function buildRetiradosSummary(assets: RetAsset[]) {
  const nowMs = Date.now();

  // 1) Totales por tipo (count)
  const countByType = new Map<string, number>();

  // 2) Promedio antigüedad por tipo (en semanas)
  const ageAggByType = new Map<string, { sumWeeks: number; n: number }>();

  // 3) Promedio ciclos por tipo
  const cycAggByType = new Map<string, { sum: number; n: number }>();

  // Distribución por semana (count) -> para drilldown week
  const countByWeek = new Map<number, number>();

  let missingCreatedAt = 0;

  for (const a of assets) {
    const tipo = cleanStr(a.tipo);
    if (!tipo) continue;

    countByType.set(tipo, (countByType.get(tipo) || 0) + 1);

    // ciclos
    const cyc = Number(a.ciclosLavado) || 0;
    const cycAgg = cycAggByType.get(tipo) || { sum: 0, n: 0 };
    cycAgg.sum += cyc;
    cycAgg.n += 1;
    cycAggByType.set(tipo, cycAgg);

    // antigüedad
    if (!a.createdAtMs) {
      missingCreatedAt++;
      continue;
    }
    const ageDays = Math.max(0, Math.floor((nowMs - a.createdAtMs) / 86_400_000));
    const week = weekFromAgeDays(ageDays);

    countByWeek.set(week, (countByWeek.get(week) || 0) + 1);

    const ageAgg = ageAggByType.get(tipo) || { sumWeeks: 0, n: 0 };
    ageAgg.sumWeeks += week;
    ageAgg.n += 1;
    ageAggByType.set(tipo, ageAgg);
  }

  const totalesByType = [...countByType.entries()]
    .map(([tipo, count]) => ({ tipo, count }))
    .sort((a, b) => b.count - a.count);

  const avgAgeWeeksByType = [...ageAggByType.entries()]
    .map(([tipo, v]) => ({
      tipo,
      avgWeeks: v.n ? Number((v.sumWeeks / v.n).toFixed(2)) : 0,
      count: v.n,
    }))
    .sort((a, b) => b.avgWeeks - a.avgWeeks);

  const avgCyclesByType = [...cycAggByType.entries()]
    .map(([tipo, v]) => ({
      tipo,
      avgCycles: v.n ? Number((v.sum / v.n).toFixed(2)) : 0,
      count: v.n,
    }))
    .sort((a, b) => b.avgCycles - a.avgCycles);

  const ageByWeek = [...countByWeek.entries()]
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week - b.week);

  return {
    totalesByType,
    avgAgeWeeksByType,
    avgCyclesByType,
    ageByWeek,
    debug: { missingCreatedAt },
  };
}

// ---------------------
// Route
// ---------------------
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
    const cached = _retiradosCache.get(cacheKey);

    if (cached && now - cached.ts < ttlSeconds * 1000) {
      const summary = buildRetiradosSummary(cached.assets);
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

    // ✅ Scan paginado pero filtrando desde origen SOLO retirados
    const assets: RetAsset[] = [];
    let skip = 0;
    let guardSameFirstId = "";
    let scannedRaw = 0;

    const filters = { Location: RETIRED_LOCATION_ID };

    while (assets.length < maxScan) {
      const resp = await searchAssetsWithSession(sessionToken, filters, pageSize, skip, authHeader, cacheKey);
      const itemsRaw: any[] = Array.isArray((resp as any)?.assets) ? (resp as any).assets : [];
      if (!itemsRaw.length) break;

      scannedRaw += itemsRaw.length;

      const firstId = pickStr(itemsRaw[0]?._id, itemsRaw[0]?.id, itemsRaw[0]?.AssetTag, itemsRaw[0]?.tag);
      if (firstId && firstId === guardSameFirstId) break;
      guardSameFirstId = firstId;

      for (const raw of itemsRaw) {
        const mapped = toRetAsset(raw);

        // doble seguro por si algún tenant manda Location diferente
        if (cleanStr(mapped.location) !== RETIRED_LOCATION_ID) continue;

        assets.push(mapped);
        if (assets.length >= maxScan) break;
      }

      skip += itemsRaw.length;

      const total = Number((resp as any)?.total ?? 0);
      if (total && skip >= total) break;
      if (itemsRaw.length < pageSize) break;
    }

    const entry: CacheEntry = { ts: Date.now(), assets };
    _retiradosCache.set(cacheKey, entry);
    __setRetiradosCache(cacheKey, entry);

    const summary = buildRetiradosSummary(assets);

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
      { ok: false, error: "Error en /api/idlinens/retirados/analysis", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}