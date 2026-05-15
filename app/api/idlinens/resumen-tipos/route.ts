// app/api/idlinens/resumen-tipos/route.ts

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY =
  process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

function buildHeaders(req: NextRequest, idToken: string) {
  const tenantHint =
    cleanStr(req.headers.get("x-tenant-id")) ||
    cleanStr(req.cookies.get("cloudSelectedTenantId")?.value);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  if (API_KEY) headers["x-api-key"] = API_KEY;
  if (tenantHint) headers["x-tenant-id"] = tenantHint;
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;

  return headers;
}

function normalizeResumenTiposResponse(data: any) {
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : [];

  const normalizedItems = items.map((it: any) => {
    const rawTipo = cleanStr(it?.rawTipo || it?.tipo);
    return {
      tipo: rawTipo,
      rawTipo,
      count: Number(it?.count || 0),
    };
  });

  return { items: normalizedItems };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionToken = cleanStr(body?.sessionToken || body?.auth?.token);
    const idToken = cleanStr(body?.idToken);
    const location = cleanStr(body?.location || body?.estado);

    if (!sessionToken) {
      return NextResponse.json(
        { status: 400, message: "Falta sessionToken" },
        { status: 400 }
      );
    }

    if (!location) {
      return NextResponse.json(
        { status: 400, message: "Falta location" },
        { status: 400 }
      );
    }

    const headers = buildHeaders(req, idToken);

    const upstream = await fetch(`${BASE_URL}/api/v1/IdLinens/ResumenTipos`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        auth: { token: sessionToken },
        location,
      }),
      cache: "no-store",
    });

    const text = await upstream.text().catch(() => "");
    let data: any = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          status: upstream.status,
          message: "Error consultando ResumenTipos por location",
          details: data ?? text,
        },
        { status: upstream.status }
      );
    }

    const normalized = normalizeResumenTiposResponse(data);
    return NextResponse.json(normalized, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 500,
        message: "Error en /api/idlinens/resumen-tipos",
        details: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}