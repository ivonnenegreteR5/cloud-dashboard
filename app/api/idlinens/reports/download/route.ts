//app/api/idlinens/reports/download/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY = process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

function cleanStr(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

// GET /api/idlinens/reports/download?id=...
export async function GET(req: NextRequest) {
  try {
    const urlIn = new URL(req.url);
    const id = cleanStr(urlIn.searchParams.get("id"));

    if (!id) {
      return NextResponse.json({ ok: false, error: "Falta id" }, { status: 400 });
    }

    const tenantHint =
      cleanStr(req.headers.get("x-tenant-id")) ||
      cleanStr(req.cookies.get("cloudSelectedTenantId")?.value);

    const authHeader = cleanStr(req.headers.get("authorization"));

    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
    };

    if (API_KEY) headers["x-api-key"] = API_KEY;
    if (tenantHint) headers["x-tenant-id"] = tenantHint;
    if (authHeader) headers["Authorization"] = authHeader;

    const upstreamUrl = `${BASE_URL}/api/v1/IdLinens/Reports/${encodeURIComponent(id)}/Download`;

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "follow",
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      let data: any = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }

      return NextResponse.json(
        {
          ok: false,
          status: upstream.status,
          error: "Error descargando reporte",
          details: data,
        },
        { status: upstream.status }
      );
    }

    const contentType = upstream.headers.get("content-type") || "application/pdf";
    const disposition =
      upstream.headers.get("content-disposition") ||
      `attachment; filename="reporte-${id}.pdf"`;

    const buf = await upstream.arrayBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        status: 500,
        error: "Error en download",
        details: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}