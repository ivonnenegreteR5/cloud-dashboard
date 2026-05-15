//app/api/inventory/[path]/route.ts

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY =
  process.env.CLOUD_API_API_KEY ||
  process.env.CLOUD_API_KEY ||
  "";

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  try {
    const { path } = await params;
    const body = await req.json().catch(() => ({}));

    const tenantId =
      cleanStr(req.headers.get("x-tenant-id")) ||
      cleanStr(body?.tenantId) ||
      cleanStr(req.cookies.get("cloudSelectedTenantId")?.value);

    const sessionToken =
      cleanStr(body?.sessionToken) ||
      cleanStr(body?.auth?.token);

    const idToken = cleanStr(body?.idToken);

    if (!tenantId) {
      return NextResponse.json(
        { status: 400, message: "Falta x-tenant-id" },
        { status: 400 }
      );
    }

    if (!sessionToken) {
      return NextResponse.json(
        { status: 400, message: "Falta sessionToken" },
        { status: 400 }
      );
    }

    if (!idToken) {
      return NextResponse.json(
        { status: 401, message: "Falta idToken" },
        { status: 401 }
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "x-tenant-id": tenantId,
      Authorization: `Bearer ${idToken}`,
    };

    if (API_KEY) {
      headers["x-api-key"] = API_KEY;
    }

    const upstreamPath =
  path === "AssetsCount"
    ? `${BASE_URL}/api/v1/${tenantId}/Assets`
    : `${BASE_URL}/api/v1/${tenantId}/Inventory/${path}`;

    const upstream = await fetch(
  upstreamPath,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          auth: {
            token: sessionToken,
          },
          ...body,
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
          message: `Error consultando Inventory/${path}`,
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
        message: "Error en proxy inventory",
        details: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}