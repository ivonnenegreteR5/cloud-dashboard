// app/api/idlinens/tenants/me/route.ts
import { NextRequest, NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY = process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

function cleanStr(v: any): string {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

export async function GET(req: NextRequest) {
  try {
    if (!API_KEY) {
      return NextResponse.json(
        { error: "Falta CLOUD_API_API_KEY / CLOUD_API_KEY" },
        { status: 500 }
      );
    }

    const auth = cleanStr(req.headers.get("authorization"));
    const sessionToken = cleanStr(req.headers.get("x-session-token"));

    const headerTenant = cleanStr(req.headers.get("x-tenant-id"));

    const url = new URL(req.url);
    const queryTenant = cleanStr(url.searchParams.get("tenantId"));

    // ✅ fallback por cookie (superadmin)
    const cookieTenant = cleanStr(req.cookies.get("cloudSelectedTenantId")?.value);

    const selectedTenant = headerTenant || queryTenant || cookieTenant;

    if (!auth) {
      return NextResponse.json(
        { error: "Falta Authorization Bearer idToken" },
        { status: 401 }
      );
    }

    const cloudResp = await fetch(`${BASE_URL}/api/v1/Tenants/Me`, {
      method: "GET",
      headers: {
        "x-api-key": API_KEY,
        Authorization: auth,
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        ...(selectedTenant ? { "x-tenant-id": selectedTenant } : {}),
      },
      cache: "no-store",
    });

    const text = await cloudResp.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    return NextResponse.json(data, { status: cloudResp.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
