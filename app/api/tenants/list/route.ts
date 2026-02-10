import { NextRequest, NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY =
  process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

export async function GET(req: NextRequest) {
  try {
    if (!API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Falta CLOUD_API_API_KEY en el servidor del dashboard" },
        { status: 500 }
      );
    }

    // 🔐 Firebase ID Token
    const auth = req.headers.get("authorization") || ""; // Bearer <idToken>
    const sessionToken = req.headers.get("x-session-token") || "";
    const tenantId = req.headers.get("x-tenant-id"); // 👈 CLAVE (superadmin)

    if (!auth.startsWith("Bearer ")) {
      return NextResponse.json(
        { ok: false, error: "Falta Authorization Bearer" },
        { status: 401 }
      );
    }

    // 🔑 Headers hacia Cloud API
    const headers: Record<string, string> = {
      "x-api-key": API_KEY,
      Authorization: auth,
    };

    if (sessionToken) headers["x-session-token"] = sessionToken;
    if (tenantId) headers["x-tenant-id"] = tenantId; // 👈 PASAMOS EL TENANT

    const resp = await fetch(`${BASE_URL}/api/v1/Tenants`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const text = await resp.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!resp.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            data?.message ||
            data?.error ||
            data?.raw ||
            `HTTP ${resp.status}`,
        },
        { status: resp.status }
      );
    }

    // Soporta respuesta como { items: [] } o como array directo
    const items = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
      ? data
      : [];

    return NextResponse.json({ ok: true, items }, { status: 200 });
  } catch (e: any) {
    console.error("[tenants route] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: 500 }
    );
  }
}
