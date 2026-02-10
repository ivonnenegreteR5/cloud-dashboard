//app/api/idlinens/movimientos-resumen-diario/route.ts
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
  // YYYY-MM-DD en local
  return toISODate(d);
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

    const daysRaw = Number(body?.days ?? 7);
    const days = Math.max(1, Math.min(Number.isFinite(daysRaw) ? daysRaw : 7, 31));

    if (!tenantId) {
      return NextResponse.json({ message: "x-tenant-id missing" }, { status: 400 });
    }
    if (!sessionToken) {
      return NextResponse.json({ message: "sessionToken missing" }, { status: 401 });
    }

    // ✅ FIX: si vas por API Gateway con security firebase, el JWT DEBE ir en Authorization
    if (!idToken) {
      return NextResponse.json(
        { message: "idToken missing (Firebase JWT requerido por el API Gateway)" },
        { status: 401 }
      );
    }

    // Pedimos transactions recientes (el backend limita 500)
    const url = new URL(`${BASE_URL}/transactions`);
    url.searchParams.set("sessionToken", sessionToken);
    url.searchParams.set("limit", "500");
    // ⚠️ NO mandes tenantId ni token por query; el backend resuelve tenant por token/session + header.
    // url.searchParams.set("tenantId", tenantId); // <- ya no

    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // ✅ el Gateway valida aquí:
        Authorization: `Bearer ${idToken}`,
        // ✅ tu API también usa este header para decidir tenant (y para superadmin):
        "x-tenant-id": tenantId,
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

    // Ventana de días (incluye hoy)
    const today = new Date();
    const minDate = new Date(today);
    minDate.setDate(today.getDate() - (days - 1));
    const minKey = toISODate(minDate);

    // agregamos por día
    const map = new Map<string, { in: number; out: number; created: number; total: number }>();

    for (const r of rows) {
      const dia = dayKeyFromEpochSeconds(r?.time);
      if (!dia) continue;
      if (dia < minKey) continue;

      const mode = String(r?.mode || "").toLowerCase();
      const cur = map.get(dia) || { in: 0, out: 0, created: 0, total: 0 };

      if (mode === "in") cur.in += 1;
      else if (mode === "out") cur.out += 1;
      else if (mode === "created") cur.created += 1;

      cur.total += 1;
      map.set(dia, cur);
    }

    // aseguramos que existan los días aunque estén en 0
    const out: Array<{ dia: string; in: number; out: number; created: number; total: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(minDate);
      d.setDate(minDate.getDate() + i);
      const key = toISODate(d);
      const v = map.get(key) || { in: 0, out: 0, created: 0, total: 0 };
      out.push({ dia: key, ...v });
    }

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { message: "Error movimientos-resumen-diario", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
