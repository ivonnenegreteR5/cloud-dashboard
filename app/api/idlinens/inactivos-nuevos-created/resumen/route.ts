///app/api/idlinens/inactivos-nuevos-created/resumen/route.ts


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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionToken = cleanStr(body?.sessionToken || body?.auth?.token);
    const idToken = cleanStr(body?.idToken);
    const days = Number(body?.days || 15);

    if (!sessionToken) {
      return NextResponse.json({ status: 400, message: "Falta sessionToken" }, { status: 400 });
    }

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

    const upstream = await fetch(
      `${BASE_URL}/api/v1/IdLinens/Inactivos15/NuevosCreated/ResumenTipos`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          auth: { token: sessionToken },
          days,
        }),
        cache: "no-store",
      }
    );

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
          message: "Error consultando NuevosCreated/ResumenTipos",
          details: data ?? text,
        },
        { status: upstream.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 500,
        message: "Error en inactivos-nuevos-created/resumen",
        details: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}