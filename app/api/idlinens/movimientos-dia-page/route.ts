//app/api/idlinens/movimientos-dia-page/route.ts
import { NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayKeyFromEpochSeconds(sec: any) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n * 1000);
  return toISODate(d); // local YYYY-MM-DD
}

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

    const dia = cleanStr(body?.dia); // YYYY-MM-DD
    const limit = Math.max(1, Math.min(Number(body?.limit || 50), 500));
    const skip = Math.max(0, Number(body?.skip || 0));
    const mode = cleanStr(body?.mode); // opcional

    if (!tenantId) return NextResponse.json({ message: "x-tenant-id missing" }, { status: 400 });
    if (!sessionToken) return NextResponse.json({ message: "sessionToken missing" }, { status: 401 });
    if (!idToken) {
      return NextResponse.json(
        { message: "idToken missing (Firebase JWT requerido por el API Gateway)" },
        { status: 401 }
      );
    }
    if (!dia) return NextResponse.json({ message: "dia missing" }, { status: 400 });

    // Traemos transacciones recientes (máx 500) y filtramos por día
    const url = new URL(`${BASE_URL}/transactions`);
    url.searchParams.set("sessionToken", sessionToken);
    url.searchParams.set("limit", "500");
    if (mode) url.searchParams.set("mode", mode);

    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`, // ✅ Gateway JWT aquí
        "x-tenant-id": tenantId,            // ✅ tenant por header
      },
      cache: "no-store",
    });

    const txt = await resp.text().catch(() => "");
    let rows: any[] = [];
    try {
      rows = txt ? JSON.parse(txt) : [];
    } catch {
      rows = [];
    }

    if (!resp.ok) {
      return NextResponse.json(
        { message: `Transactions error (${resp.status})`, details: txt },
        { status: resp.status }
      );
    }

    const filtered = rows.filter((r) => dayKeyFromEpochSeconds(r?.time) === dia);
    const total = filtered.length;
    const page = filtered.slice(skip, skip + limit);

    return NextResponse.json({ items: page, total, limit, skip });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Error movimientos-dia-page", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}