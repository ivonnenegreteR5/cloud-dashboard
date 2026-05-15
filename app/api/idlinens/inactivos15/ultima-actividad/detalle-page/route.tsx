import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

async function safeJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function pickTenant(req: Request) {
  return String(req.headers.get("x-tenant-id") || "").trim();
}

function pickJwt(req: Request, body: any) {
  const h = req.headers.get("authorization");
  if (h && h.toLowerCase().startsWith("bearer ")) return h;

  const idToken = String(body?.idToken || "").trim();
  if (idToken) return `Bearer ${idToken}`;

  return "";
}

export async function POST(req: Request) {
  try {
    const tenantId = pickTenant(req);
    const body = await safeJson(req);

    if (!tenantId) {
      return NextResponse.json({ message: "Missing x-tenant-id" }, { status: 400 });
    }

    const jwt = pickJwt(req, body);
    if (!jwt) {
      return NextResponse.json(
        { message: "Missing JWT (no Authorization header and no idToken in body)" },
        { status: 401 }
      );
    }

    const sessionToken = String(body?.sessionToken || "").trim();
    if (!sessionToken) {
      return NextResponse.json({ message: "Missing sessionToken" }, { status: 401 });
    }

    const days = Number(body?.days || 15);
    const tipo = String(body?.tipo || "").trim();
    const limit = Math.max(1, Math.min(Number(body?.limit ?? 1000), 10000));
    const skip = Math.max(0, Number(body?.skip ?? 0));
    const excludeStatuses = Array.isArray(body?.excludeStatuses)
  ? body.excludeStatuses
  : ["created", "CREATED", "nuevo", "NUEVO", "nuevos", "NUEVOS"];

    const upstreamPath = `/api/v1/${tenantId}/IdLinens/Inactivos15/UltimaActividad/DetallePage`;

    const upstream = await fetch(`${BASE_URL}${upstreamPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": tenantId,
        Authorization: jwt,
      },
      body: JSON.stringify({
  auth: { token: sessionToken },
  days,
  tipo,
  limit,
  skip,
  excludeStatuses,
}),
      cache: "no-store",
    });

    const text = await upstream.text().catch(() => "");
    if (!upstream.ok) {
      return NextResponse.json(
        { message: `Upstream error (${upstream.status}): ${text || "sin detalle"}` },
        { status: upstream.status }
      );
    }

    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ message: e?.message || "Error" }, { status: 500 });
  }
}