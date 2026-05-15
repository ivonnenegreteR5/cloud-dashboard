//app/api/idlinens/inactivos-nuevos-created/detalle-page/route.ts

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloud-api-754063199935.northamerica-south1.run.app";

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
    const authHeader =
      cleanStr(req.headers.get("authorization")) ||
      (idToken ? `Bearer ${idToken}` : "");

    const tenantHint =
      cleanStr(req.headers.get("x-tenant-id")) ||
      cleanStr(req.cookies.get("cloudSelectedTenantId")?.value);

    const days = Number(body?.days || 15);
    const tipo = cleanStr(body?.tipo);
    const limit = Number(body?.limit || 1000);
    const skip = Number(body?.skip || 0);

    if (!sessionToken) {
      return NextResponse.json({ status: 400, message: "Falta sessionToken" }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    };

    if (API_KEY) headers["x-api-key"] = API_KEY;
    if (tenantHint) headers["x-tenant-id"] = tenantHint;
    if (authHeader) headers["Authorization"] = authHeader;

    const upstream = await fetch(
      `${BASE_URL}/api/v1/IdLinens/Inactivos15/NuevosCreated/DetallePage`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          auth: { token: sessionToken },
          days,
          tipo,
          limit,
          skip,
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
          message: "Error consultando NuevosCreated/DetallePage",
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
        message: "Error en inactivos-nuevos-created/detalle-page",
        details: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}