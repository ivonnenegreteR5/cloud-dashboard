
// app/api/cloud/assets/update/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

// Si tu Gateway usa apiKey, ponla en .env
const API_KEY =
  process.env.CLOUD_API_API_KEY ||
  process.env.CLOUD_API_KEY ||
  process.env.NEXT_PUBLIC_CLOUD_API_KEY ||
  "";

function withNoStore(res: NextResponse) {
  res.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Surrogate-Control", "no-store");
  return res;
}

export async function POST(req: Request) {
  try {
    const headers = new Headers(req.headers);

    // 🔑 tokens que vienen desde tu UI
    const sessionToken = headers.get("x-session-token") || "";
    const authHeader = headers.get("authorization") || ""; // Bearer <idToken>
    const tenantId = headers.get("x-tenant-id") || "";

    if (!tenantId) {
      return withNoStore(
        NextResponse.json({ ok: false, error: "Falta x-tenant-id" }, { status: 400 })
      );
    }
    if (!sessionToken) {
      return withNoStore(
        NextResponse.json({ ok: false, error: "Falta x-session-token" }, { status: 401 })
      );
    }
    if (!authHeader) {
      return withNoStore(
        NextResponse.json({ ok: false, error: "Falta Authorization Bearer (idToken)" }, { status: 401 })
      );
    }

    // body desde tu UI: { items: [...] }
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : null;
    if (!items || items.length === 0) {
      return withNoStore(
        NextResponse.json({ ok: false, error: "items[] requerido" }, { status: 400 })
      );
    }

    // ✅ IMPORTANTE:
    // - para soportar SUPERADMIN editando cualquier tenant,
    //   usamos el endpoint con tenant en la URL
    const url = `${BASE_URL}/api/v1/${encodeURIComponent(
      tenantId
    )}/Assets/Update`;

    // Gateway/backend esperan SessionToken dentro de auth.token
    const payload = {
      auth: { token: sessionToken },
      items,
    };

    const resp = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        ...(API_KEY ? { "x-api-key": API_KEY } : {}), // ✅ clave del gateway si aplica
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    // Normaliza a { ok: true/false } para tu UI
    if (!resp.ok || (data?.status && data.status !== 0)) {
      const msg =
        data?.message ||
        data?.error ||
        `Error HTTP ${resp.status} al llamar Assets/Update`;
      return withNoStore(
        NextResponse.json(
          { ok: false, error: msg, status: resp.status, details: data },
          { status: resp.status }
        )
      );
    }

    return withNoStore(
      NextResponse.json({ ok: true, data }, { status: 200 })
    );
  } catch (err: any) {
    console.error("POST /api/cloud/assets/update error:", err);
    return withNoStore(
      NextResponse.json(
        { ok: false, error: err?.message || "Error actualizando asset" },
        { status: 500 }
      )
    );
  }
}
