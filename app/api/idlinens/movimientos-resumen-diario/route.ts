//app/api/idlinens/movimientos-resumen-diario/route.ts
import { NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

function dayKeyFromDateMX(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;

  return y && m && d ? `${y}-${m}-${d}` : "";
}

function dayKeyFromEpochSeconds(sec: any) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return "";
  return dayKeyFromDateMX(new Date(n * 1000));
}

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

function normalizeMode(v: any) {
  const modeRaw = String(v || "").toLowerCase().trim();

  if (["in", "entrada", "checkin", "check_in", "checked in"].includes(modeRaw)) {
    return "in";
  }

  if (["out", "salida", "checkout", "check_out", "checked out"].includes(modeRaw)) {
    return "out";
  }

  if (["created", "creado", "nuevo"].includes(modeRaw)) {
    return "created";
  }

  return modeRaw;
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

    if (!idToken) {
      return NextResponse.json(
        { message: "idToken missing (Firebase JWT requerido por el API Gateway)" },
        { status: 401 }
      );
    }

    const url = new URL(`${BASE_URL}/transactions`);
    url.searchParams.set("sessionToken", sessionToken);
    url.searchParams.set("limit", "5000");

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

    const today = new Date();
    const dayKeys: string[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dayKeys.push(dayKeyFromDateMX(d));
    }

    const minKey = dayKeys[0];

    const map = new Map<string, { in: number; out: number; created: number; total: number }>();

    for (const r of rows) {
      const dia = dayKeyFromEpochSeconds(r?.time);
      if (!dia) continue;
      if (dia < minKey) continue;

      const mode = normalizeMode(r?.mode);
      const cur = map.get(dia) || { in: 0, out: 0, created: 0, total: 0 };

      if (mode === "in") cur.in += 1;
      else if (mode === "out") cur.out += 1;
      else if (mode === "created") cur.created += 1;

      cur.total += 1;
      map.set(dia, cur);
    }

    const out = dayKeys.map((dia) => {
      const v = map.get(dia) || { in: 0, out: 0, created: 0, total: 0 };
      return { dia, ...v };
    });

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { message: "Error movimientos-resumen-diario", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}