import { NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

function sameDay(epochSec: any, dia: string) {
  const n = Number(epochSec);
  if (!Number.isFinite(n) || n <= 0) return false;
  const d = new Date(n * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}` === dia;
}

export async function GET(req: Request) {
  try {
    const urlIn = new URL(req.url);
    const dia = String(urlIn.searchParams.get("dia") || "").trim();

    const tenantId = String(req.headers.get("x-tenant-id") || "").trim();
    // OJO: este endpoint depende de cookies/local storage en frontend normalmente.
    // Aquí lo resolvemos por query params para descarga directa si quieres:
    const sessionToken = String(urlIn.searchParams.get("sessionToken") || "").trim();
    const idToken = String(urlIn.searchParams.get("idToken") || "").trim();

    if (!tenantId) return NextResponse.json({ message: "x-tenant-id missing" }, { status: 400 });
    if (!sessionToken) return NextResponse.json({ message: "sessionToken missing" }, { status: 401 });
    if (!dia) return NextResponse.json({ message: "dia missing" }, { status: 400 });

    const url = new URL(`${BASE_URL}/transactions`);
    url.searchParams.set("sessionToken", sessionToken);
    if (idToken) url.searchParams.set("token", idToken);
    url.searchParams.set("tenantId", tenantId);
    url.searchParams.set("limit", "500");

    const resp = await fetch(url.toString(), { method: "GET", cache: "no-store" });
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

    const filtered = rows.filter((r) => sameDay(r?.time, dia));

    // Descarga como JSON (placeholder de reporte)
    return new NextResponse(JSON.stringify({ dia, total: filtered.length, items: filtered }, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="movimientos-${dia}.json"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { message: "Error movimientos-dia-pdf", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
