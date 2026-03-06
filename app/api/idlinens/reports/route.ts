//app/api/idlinens/reports/route.ts

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY = process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

function isValidYMD(s: string) {
  // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // evita cosas tipo 2026-13-99
  const [yy, mm, dd] = s.split("-").map(Number);
  return d.getUTCFullYear() === yy && d.getUTCMonth() + 1 === mm && d.getUTCDate() === dd;
}

// GET /api/idlinens/reports?date=YYYY-MM-DD&limit=50
export async function GET(req: NextRequest) {
  try {
    const urlIn = new URL(req.url);
    const date = cleanStr(urlIn.searchParams.get("date"));
    const limitRaw = cleanStr(urlIn.searchParams.get("limit") || "50");
    const limit = Math.max(1, Math.min(Number(limitRaw || 50), 200));

    if (!date) {
      return NextResponse.json({ ok: false, error: "Falta date (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!isValidYMD(date)) {
      return NextResponse.json({ ok: false, error: "date inválida (YYYY-MM-DD)" }, { status: 400 });
    }

    const tenantHint =
      cleanStr(req.headers.get("x-tenant-id")) ||
      cleanStr(req.cookies.get("cloudSelectedTenantId")?.value);

    const auth = cleanStr(req.headers.get("authorization"));

    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (API_KEY) headers["x-api-key"] = API_KEY;
    if (tenantHint) headers["x-tenant-id"] = tenantHint;
    if (auth) headers["Authorization"] = auth;

    const upstreamUrl = `${BASE_URL}/api/v1/IdLinens/Reports?date=${encodeURIComponent(
      date
    )}&limit=${encodeURIComponent(String(limit))}`;

    const upstream = await fetch(upstreamUrl, { method: "GET", headers, cache: "no-store" });

    const text = await upstream.text().catch(() => "");
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: upstream.status,
          error: "Error consultando reportes del día",
          details: data,
        },
        { status: upstream.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, status: 500, error: "Error listando reportes", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}