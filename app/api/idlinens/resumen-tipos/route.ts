 //app/api/idlinens/resumen-tipo/route.ts

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

/**
 * Normaliza para que el frontend siempre reciba:
 * { items: [{ tipo, count, rawTipo? }], ... }
 */
function normalizeResumenTiposResponse(data: any) {
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
    ? data.items
    : [];

  // Asegura forma uniforme y conserva rawTipo
  const normalizedItems = items.map((it: any) => {
    const rawTipo = cleanStr(it?.tipo);
    return {
      ...it,
      tipo: rawTipo,      // dejamos el tipo original tal cual
      rawTipo: rawTipo,   // duplicado útil para frontend (click → detalle)
      count: Number(it?.count || 0),
    };
  });

  // Si el backend ya trae estructura, respetamos pero garantizamos items
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ...data, items: normalizedItems };
  }

  return { items: normalizedItems };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionToken = cleanStr(body?.sessionToken || body?.auth?.token);
    const idToken = cleanStr(body?.idToken);
    const estado = cleanStr(body?.estado).toLowerCase();

    if (!sessionToken) {
      return NextResponse.json(
        { status: 400, message: "Falta sessionToken" },
        { status: 400 }
      );
    }
    if (!estado) {
      return NextResponse.json(
        { status: 400, message: "Falta estado" },
        { status: 400 }
      );
    }

    const headers = buildHeaders(req, idToken);

    const upstream = await fetch(`${BASE_URL}/api/v1/IdLinens/ResumenTipos`, {
      method: "POST",
      headers,
      body: JSON.stringify({ auth: { token: sessionToken }, estado }),
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
          message: "Error consultando ResumenTipos",
          details: data ?? text,
        },
        { status: upstream.status }
      );
    }

    // ✅ normaliza output
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
