// app/api/cloud/assets/delete/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

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
    const sessionToken = headers.get("x-session-token") || "";
    const authHeader = headers.get("authorization") || "";
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

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    const clean = ids.map((x) => String(x || "").trim()).filter(Boolean);
    if (clean.length === 0) {
      return withNoStore(
        NextResponse.json({ ok: false, error: "ids[] requerido" }, { status: 400 })
      );
    }

    const url = `${BASE_URL}/api/v1/${encodeURIComponent(
      tenantId
    )}/Assets/Delete`;

    const payload = {
      auth: { token: sessionToken },
      items: clean.map((_id) => ({ _id })),
    };

    const resp = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        ...(API_KEY ? { "x-api-key": API_KEY } : {}),
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

    if (!resp.ok || (data?.status && data.status !== 0)) {
      const msg =
        data?.message ||
        data?.error ||
        `Error HTTP ${resp.status} al llamar Assets/Delete`;
      return withNoStore(
        NextResponse.json(
          { ok: false, error: msg, status: resp.status, details: data },
          { status: resp.status }
        )
      );
    }

    return withNoStore(NextResponse.json({ ok: true, data }, { status: 200 }));
  } catch (err: any) {
    console.error("POST /api/cloud/assets/delete error:", err);
    return withNoStore(
      NextResponse.json(
        { ok: false, error: err?.message || "Error eliminando asset" },
        { status: 500 }
      )
    );
  }
}
