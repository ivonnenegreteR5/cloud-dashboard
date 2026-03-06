// app/api/idlinens/retirados/analysis/details/route.ts

import { NextRequest, NextResponse } from "next/server";
import { searchAssetsWithSession } from "@/lib/cloudApi";
import { __getRetiradosCache, __setRetiradosCache } from "../cache";
export const dynamic = "force-dynamic";

const RETIRED_LOCATION_ID = "Blancos Retirados";

type RetDetailMode = "tipo" | "ageWeekTipos" | "ageWeekTipo" | "cyclesTipo";

type RetAsset = {
  _id: string;
  tag: string;
  tipo: string;
  status: string;
  location: string;
  ciclosLavado: number;
  createdAtMs: number | null;
};

type CacheEntry = { ts: number; assets: RetAsset[] };

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
    null;

  return { _id, tag, tipo, status, location, ciclosLavado, createdAtMs };
}

// ✅ si no hay cache, lo genera aquí y lo guarda (igual que summary)
async function ensureRetCache(params: {
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

  const cached = __getRetiradosCache(tenantId) as CacheEntry | undefined;
  const now = Date.now();
  if (cached && now - cached.ts < ttlSeconds * 1000) {
    return { entry: cached, cacheHit: true, scannedRaw: 0 };
  }

  const assets: RetAsset[] = [];
  let skip = 0;
  let guardSameFirstId = "";
  let scannedRaw = 0;

  const filters = { Location: RETIRED_LOCATION_ID };

  while (assets.length < maxScan) {
    const resp = await searchAssetsWithSession(
      params.sessionToken,
      filters,
      pageSize,
      skip,
      params.authHeader,
      tenantId
    );

    const itemsRaw: any[] = Array.isArray((resp as any)?.assets) ? (resp as any).assets : [];
    if (!itemsRaw.length) break;

    scannedRaw += itemsRaw.length;

    const firstId = pickStr(
      itemsRaw[0]?._id,
      itemsRaw[0]?.id,
      itemsRaw[0]?.AssetTag,
      itemsRaw[0]?.tag
    );
    if (firstId && firstId === guardSameFirstId) break;
    guardSameFirstId = firstId;

    for (const raw of itemsRaw) {
      const mapped = toRetAsset(raw);
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
  __setRetiradosCache(tenantId, entry);

  return { entry, cacheHit: false, scannedRaw };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionToken, authHeader, tenantHint } = getTokensFromReq(req, body);

    if (!tenantHint)
      return NextResponse.json({ ok: false, error: "Falta x-tenant-id." }, { status: 400 });
    if (!sessionToken)
      return NextResponse.json({ ok: false, error: "Falta sessionToken." }, { status: 401 });

    const mode = cleanStr(body?.mode) as RetDetailMode;
    const tipo = cleanStr(body?.tipo);
    const week = body?.week != null ? Number(body.week) : undefined;

    const limit = Math.max(1, Math.min(cleanNum(body?.limit, 100), 500));
    const skip = Math.max(0, cleanNum(body?.skip, 0));

    if (!mode) return NextResponse.json({ ok: false, error: "Falta mode." }, { status: 400 });

    const ttlSeconds = cleanNum(body?.ttlSeconds, 60);
    const maxScan = cleanNum(body?.maxScan, 50_000);
    const pageSize = cleanNum(body?.pageSize, 1000);

    const { entry, cacheHit, scannedRaw } = await ensureRetCache({
      tenantId: tenantHint,
      sessionToken,
      authHeader,
      ttlSeconds,
      maxScan,
      pageSize,
    });

    const nowMs = Date.now();
    const assetWeek = (a: RetAsset) => {
      if (!a.createdAtMs) return null;
      const ageDays = Math.max(0, Math.floor((nowMs - a.createdAtMs) / 86_400_000));
      return weekFromAgeDays(ageDays);
    };

    // 1) tipo => lista
    if (mode === "tipo") {
      if (!tipo) return NextResponse.json({ ok: false, error: "Falta tipo." }, { status: 400 });
      const filtered = entry.assets.filter((a) => cleanStr(a.tipo) === tipo);
      const total = filtered.length;
      const page = filtered.slice(skip, skip + limit);
      return NextResponse.json(
        {
          ok: true,
          items: page,
          total,
          limit,
          skip,
          meta: { cacheHit, scannedRaw, scanned: entry.assets.length },
        },
        { status: 200 }
      );
    }

    // 2) ageWeekTipos => barras por tipo para esa semana
    if (mode === "ageWeekTipos") {
      if (!week || !Number.isFinite(week) || week < 1) {
        return NextResponse.json({ ok: false, error: "Falta week>=1." }, { status: 400 });
      }
      const map = new Map<string, number>();
      for (const a of entry.assets) {
        if (assetWeek(a) !== week) continue;
        const t = cleanStr(a.tipo) || "SIN_TIPO";
        map.set(t, (map.get(t) || 0) + 1);
      }
      const items = [...map.entries()]
        .map(([tipo, count]) => ({ tipo, count }))
        .sort((a, b) => b.count - a.count);

      return NextResponse.json(
        { ok: true, items, total: items.length, limit: items.length, skip: 0, meta: { cacheHit, week } },
        { status: 200 }
      );
    }

    // 3) ageWeekTipo => lista final
    if (mode === "ageWeekTipo") {
      if (!week || !Number.isFinite(week) || week < 1) {
        return NextResponse.json({ ok: false, error: "Falta week>=1." }, { status: 400 });
      }
      if (!tipo) return NextResponse.json({ ok: false, error: "Falta tipo." }, { status: 400 });

      const filtered = entry.assets.filter((a) => cleanStr(a.tipo) === tipo && assetWeek(a) === week);
      const total = filtered.length;
      const page = filtered.slice(skip, skip + limit);

      return NextResponse.json(
        { ok: true, items: page, total, limit, skip, meta: { cacheHit, week, tipo } },
        { status: 200 }
      );
    }

    // 4) cyclesTipo => lista por tipo (ordenado por ciclos desc)
    if (mode === "cyclesTipo") {
      if (!tipo) return NextResponse.json({ ok: false, error: "Falta tipo." }, { status: 400 });

      const filtered = entry.assets.filter((a) => cleanStr(a.tipo) === tipo);
      filtered.sort((a, b) => (Number(b.ciclosLavado) || 0) - (Number(a.ciclosLavado) || 0));

      const total = filtered.length;
      const page = filtered.slice(skip, skip + limit);

      return NextResponse.json(
        { ok: true, items: page, total, limit, skip, meta: { cacheHit, scanned: entry.assets.length } },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { ok: false, error: "mode inválido. Usa: tipo | ageWeekTipos | ageWeekTipo | cyclesTipo" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Error en /api/idlinens/retirados/analysis/details",
        details: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}