// app/api/idlinens/detalle-page/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY =
  process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

function cleanNum(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildHeaders(req: NextRequest, idToken: string) {
  const tenantHint =
    cleanStr(req.headers.get("x-tenant-id")) ||
    cleanStr(req.cookies.get("cloudSelectedTenantId")?.value);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  if (API_KEY) headers["x-api-key"] = API_KEY;
  if (tenantHint) headers["x-tenant-id"] = tenantHint;
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;

  return headers;
}

function norm(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildTipoVariants(tipo: string) {
  const t = cleanStr(tipo);
  if (!t) return [];

  const collapsed = t.replace(/\s+/g, " ").trim();

  const variants = new Set<string>([
    t,
    collapsed,
    t.toUpperCase(),
    collapsed.toUpperCase(),
  ]);

  return Array.from(variants).filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionToken = cleanStr(body?.sessionToken || body?.auth?.token);
    const idToken = cleanStr(body?.idToken);

    const globalTipo = body?.globalTipo === true;
    const location = cleanStr(body?.location || body?.estado);
    const tipo = cleanStr(body?.tipo);

    const limit = Math.max(1, Math.min(cleanNum(body?.limit, 100), 5000));
    const skip = Math.max(0, cleanNum(body?.skip, 0));

    if (!sessionToken) {
      return NextResponse.json(
        { status: 400, message: "Falta sessionToken" },
        { status: 400 }
      );
    }

    if (!tipo) {
      return NextResponse.json(
        { status: 400, message: "Falta tipo" },
        { status: 400 }
      );
    }

    // ✅ Para tabla de pastel/location sí se requiere location.
    // ✅ Para tabla global/barra NO se requiere location.
    if (!location && !globalTipo) {
      return NextResponse.json(
        { status: 400, message: "Falta location" },
        { status: 400 }
      );
    }

    const headers = buildHeaders(req, idToken);
    const tipoVariants = buildTipoVariants(tipo);

    let lastData: any = null;
    const locationNorm = norm(location);

    for (const t of tipoVariants) {
      const upstream = await fetch(`${BASE_URL}/api/v1/IdLinens/DetallePage`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          auth: { token: sessionToken },
          ...(location ? { location } : {}),
          tipo: t,
          limit,
          skip,
        }),
        cache: "no-store",
      });

      const text = await upstream.text().catch(() => "");
      let data: any = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      lastData = data;

      if (!upstream.ok) {
        return NextResponse.json(
          {
            status: upstream.status,
            message: "Error consultando DetallePage",
            details: data ?? text,
          },
          { status: upstream.status }
        );
      }

      const items = Array.isArray(data?.items) ? data.items : [];

      // ✅ MODO GLOBAL: no filtra location, regresa lo que manda el server.
      if (globalTipo) {
        if (items.length > 0 || Number(data?.total || 0) > 0) {
          return NextResponse.json(
            {
              ...data,
              tipo: t,
              globalTipo: true,
              items,
              total: typeof data?.total === "number" ? data.total : items.length,
            },
            { status: 200 }
          );
        }

        continue;
      }

      // ✅ MODO LOCATION: conserva filtro extra defensivo por location.
      const filteredItems = items.filter((item: any) => {
        const itemLocation =
          cleanStr(item?.Location) ||
          cleanStr(item?.locationId) ||
          cleanStr(item?.location) ||
          cleanStr(item?.ubicacion);

        return norm(itemLocation) === locationNorm;
      });

      if (filteredItems.length > 0) {
        return NextResponse.json(
          {
            ...data,
            location,
            tipo: t,
            total:
              typeof data?.total === "number" ? data.total : filteredItems.length,
            items: filteredItems,
          },
          { status: 200 }
        );
      }
    }

    return NextResponse.json(
      {
        ...(lastData ?? { status: 0, items: [] }),
        ...(location ? { location } : {}),
        tipo,
        ...(globalTipo ? { globalTipo: true } : {}),
        debug: {
          ...(lastData?.debug ?? {}),
          note:
            lastData?.debug?.note ||
            (globalTipo
              ? "DetallePage global por tipo regresó vacío. Revisa consistencia de AssetType."
              : "DetallePage regresó vacío. Revisa consistencia de campos en Firestore (AssetType/Location)."),
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 500,
        message: "Error en /api/idlinens/detalle-page",
        details: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}