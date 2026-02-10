// app/api/idlinens/assets/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // ✅ evita caching de Next en esta route

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY =
  process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

function cleanStr(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

function cleanNum(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionToken = cleanStr(body?.sessionToken || body?.auth?.token);
    const idToken = cleanStr(body?.idToken);
    const filter = body?.filter || {};

    // ✅ soporta strings/números bien
    const limit = cleanNum(body?.limit, 100);
    const skip = cleanNum(body?.skip, 0);

    if (!sessionToken) {
      return NextResponse.json(
        { status: 400, message: "Falta sessionToken" },
        { status: 400 }
      );
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

    // ✅ algunos backends usan page/pageSize, otros offset/take, otros start/count
    // mandamos varios para maximizar compatibilidad sin romper el actual
    const pageSize = Math.max(1, Math.min(limit, 5000));
    const page = Math.floor(skip / pageSize) + 1;

    const upstreamBody: any = {
      auth: { token: sessionToken },
      filter,

      // tu formato actual
      limit: pageSize,
      skip,

      // formatos alternativos
      page,
      pageSize,

      offset: skip,
      take: pageSize,

      start: skip,
      count: pageSize,
    };

    const upstream = await fetch(`${BASE_URL}/api/v1/Assets`, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamBody),
      cache: "no-store", // ✅ importante
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
          message: "Error consultando Assets",
          details: data ?? text,
        },
        { status: upstream.status }
      );
    }

    // ✅ debug headers (para ver en Network cuántos items regresan)
    const res = NextResponse.json(data, { status: 200 });
    res.headers.set("x-debug-sent-limit", String(pageSize));
    res.headers.set("x-debug-sent-skip", String(skip));
    res.headers.set("x-debug-sent-page", String(page));
    res.headers.set(
      "x-debug-recv-count",
      String(Array.isArray(data) ? data.length : Array.isArray(data?.items) ? data.items.length : 0)
    );
    if (typeof data?.total === "number") res.headers.set("x-debug-recv-total", String(data.total));

    return res;
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 500,
        message: "Error en /api/idlinens/assets",
        details: String(err),
      },
      { status: 500 }
    );
  }
}
