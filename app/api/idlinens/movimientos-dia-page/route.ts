//app/api/idlinens/movimientos-dia-page/route.ts
import { NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const tenantId = cleanStr(req.headers.get("x-tenant-id"));
    const sessionToken = cleanStr(body?.sessionToken);
    const idToken = cleanStr(body?.idToken);

    const dia = cleanStr(body?.dia);
    const limit = Math.max(1, Math.min(Number(body?.limit || 30), 200));
    const skip = Math.max(0, Number(body?.skip || 0));

    if (!tenantId) return NextResponse.json({ message: "x-tenant-id missing" }, { status: 400 });
    if (!sessionToken) return NextResponse.json({ message: "sessionToken missing" }, { status: 401 });
    if (!idToken) return NextResponse.json({ message: "idToken missing" }, { status: 401 });
    if (!dia) return NextResponse.json({ message: "dia missing" }, { status: 400 });

    const url = new URL(`${BASE_URL}/api/v1/IdLinens/MovimientosDiaPage`);
    url.searchParams.set("sessionToken", sessionToken);
    url.searchParams.set("dia", dia);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("skip", String(skip));

    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        "x-tenant-id": tenantId,
      },
      cache: "no-store",
    });

    const txt = await resp.text().catch(() => "");
    const data = txt ? JSON.parse(txt) : {};

    if (!resp.ok) {
      return NextResponse.json(
        { message: `MovimientosDiaPage error (${resp.status})`, details: txt },
        { status: resp.status }
      );
    }

    return NextResponse.json({
      items: Array.isArray(data?.items) ? data.items : [],
      total: Number(data?.total || 0),
      limit: Number(data?.limit || limit),
      skip: Number(data?.skip || skip),
    });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Error movimientos-dia-page", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}