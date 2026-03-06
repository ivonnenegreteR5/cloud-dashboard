// app/api/cloud/transactions/route.ts
import { NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

const API_KEY = process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

/**
 * GET /api/cloud/transactions
 *
 * Soporta:
 * - limit (default 500)
 * - assetId (opcional)
 * - tag (opcional)  -> EPC/RFID
 *
 * ✅ Mantiene compatibilidad:
 * - si no mandas assetId/tag, se comporta igual
 * - si no mandas x-tenant-id, no falla (pero puede caer en demo)
 *
 * ✅ FIX superadmin:
 * - si viene x-tenant-id, lo re-enviamos (header + query) para forzar tenant
 */
export async function GET(req: Request) {
  try {
    const headersIn = new Headers(req.headers);
    const sessionToken = headersIn.get("x-session-token");
    const authHeader = headersIn.get("authorization") || undefined;

    // ✅ tenant seleccionado (middleware/cookie -> header)
    const tenantId = (headersIn.get("x-tenant-id") || "").trim();

    if (!sessionToken) {
      return NextResponse.json(
        { ok: false, error: "Falta x-session-token" },
        { status: 401 }
      );
    }

    if (!API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta CLOUD_API_API_KEY o CLOUD_API_KEY en variables de entorno",
        },
        { status: 500 }
      );
    }

    const urlIn = new URL(req.url);

    // ✅ parámetros (sin romper nada)
    const limit = (urlIn.searchParams.get("limit") ?? "1000").trim();
    const assetId = (urlIn.searchParams.get("assetId") || "").trim();
    const tag = (urlIn.searchParams.get("tag") || "").trim();

    // ✅ Tu backend soporta /transactions global con sessionToken
    const urlOut = new URL(`${BASE_URL}/transactions`);
    urlOut.searchParams.set("sessionToken", sessionToken);
    urlOut.searchParams.set("limit", limit);

    // ✅ Filtros opcionales
if (assetId) urlOut.searchParams.set("assetId", assetId);
if (tag) urlOut.searchParams.set("tag", tag);

// 👇 NUEVO: filtro por ubicación
const locationId = urlIn.searchParams.get("locationId")?.trim() || "";
if (locationId) urlOut.searchParams.set("locationId", locationId);
    // ✅ FIX: si viene tenant, lo mandamos también por query (compat con backends)
    if (tenantId) urlOut.searchParams.set("tenantId", tenantId);

    const cloudResp = await fetch(urlOut.toString(), {
      method: "GET",
      headers: {
        "x-api-key": API_KEY,
        ...(authHeader ? { Authorization: authHeader } : {}),
        // ✅ FIX: y por header también (si tu Cloud API lo soporta)
        ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      },
      cache: "no-store",
    });

    const text = await cloudResp.text();
    let json: any = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      if (!cloudResp.ok) {
        return NextResponse.json(
          { ok: false, error: text || "Respuesta no válida de la API externa" },
          { status: cloudResp.status }
        );
      }
      // si fue ok pero no JSON (raro), lo devolvemos tal cual
      return NextResponse.json(
        { ok: true, transactions: text },
        { status: cloudResp.status }
      );
    }

    if (!cloudResp.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: json?.message || "Error de la API externa",
          raw: json,
        },
        { status: cloudResp.status }
      );
    }

    // normalizamos: tu Cloud API suele devolver array
    const transactions = Array.isArray(json)
      ? json
      : Array.isArray(json?.transactions)
      ? json.transactions
      : Array.isArray(json?.data)
      ? json.data
      : [];

    return NextResponse.json({ 
  ok: true, 
  transactions,
  total: transactions.length  // 👈 AGREGAR ESTO
}, { status: 200 });

  } catch (err: any) {
    console.error("GET /api/cloud/transactions error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Error consultando transacciones" },
      { status: 500 }
    );
  }
}
