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

// ✅ Normaliza lo que venga del front a los 3 estados válidos del backend
function mapEstado(raw: string) {
  const e = cleanStr(raw).toLowerCase();
  if (!e) return "";

  // ya válidos
  if (e === "nuevos" || e === "lavanderia" || e === "circulacion") return e;

  // aliases típicos (lo que tú describes)
  if (e === "creado" || e === "created" || e === "nuevo" || e === "nuevas") return "nuevos";
  if (e === "salida" || e === "out" || e === "lavandería" || e === "lavanderia") return "lavanderia";
  if (e === "entrada" || e === "in" || e === "circulación" || e === "circulacion") return "circulacion";

  return e; // lo dejamos pasar para que el backend diga “inválido” si no coincide
}

// ✅ genera variantes razonables para tipo (trim + colapsar espacios)
function buildTipoVariants(tipo: string) {
  const t = cleanStr(tipo);
  if (!t) return [];
  const collapsed = t.replace(/\s+/g, " ").trim();
  const variants = new Set<string>([t, collapsed]);
  return Array.from(variants).filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionToken = cleanStr(body?.sessionToken || body?.auth?.token);
    const idToken = cleanStr(body?.idToken);

    const estado = mapEstado(body?.estado);
    const tipo = cleanStr(body?.tipo);

    const limit = Math.max(1, Math.min(cleanNum(body?.limit, 100), 500));
    const skip = Math.max(0, cleanNum(body?.skip, 0));

    if (!sessionToken) {
      return NextResponse.json(
        { status: 400, message: "Falta sessionToken" },
        { status: 400 }
      );
    }
    if (!estado) {
      return NextResponse.json(
        { status: 400, message: "Falta estado" },
        { status: 400 }
      );
    }
    if (!tipo) {
      return NextResponse.json(
        { status: 400, message: "Falta tipo" },
        { status: 400 }
      );
    }

    const headers = buildHeaders(req, idToken);

    // ✅ intenta con variantes de tipo si el primero regresa vacío
    const tipoVariants = buildTipoVariants(tipo);

    let lastData: any = null;

    for (const t of tipoVariants) {
      const upstream = await fetch(`${BASE_URL}/api/v1/IdLinens/DetallePage`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          auth: { token: sessionToken },
          estado,
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
        // error “real” del backend
        return NextResponse.json(
          {
            status: upstream.status,
            message: "Error consultando DetallePage",
            details: data ?? text,
          },
          { status: upstream.status }
        );
      }

      // si ya trajo items, regresamos
      if (data?.items?.length) {
        return NextResponse.json(data, { status: 200 });
      }
    }

    // si todos dieron ok pero vacío
    return NextResponse.json(
      {
        ...(lastData ?? { status: 0, items: [] }),
        debug: {
          ...(lastData?.debug ?? {}),
          note:
            lastData?.debug?.note ||
            "DetallePage regresó vacío. Revisa consistencia de campos en Firestore (AssetType/Location/status).",
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
