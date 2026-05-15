//app/api/cloud/assets/search/route.ts

import { NextResponse } from "next/server";
import { searchAssetsWithSession } from "@/lib/cloudApi";

export async function POST(req: Request) {
  try {
    // 1. Obtener headers
    const headersList = new Headers(req.headers);
    const sessionToken = headersList.get("x-session-token")?.trim();
    const authHeader = headersList.get("authorization") || undefined;
    const tenantId = headersList.get("x-tenant-id")?.trim();

    // 2. Validar sessionToken
    if (!sessionToken) {
      return NextResponse.json(
        { ok: false, error: "Falta x-session-token" },
        { status: 401 }
      );
    }

    // 3. Obtener parámetros de paginación
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || "100"), 500));
    const skip = Math.max(0, Number(url.searchParams.get("skip") || "0"));

    // 4. Obtener filtros del body
    const body = await req.json().catch(() => ({}));
    const frontendFilters = body?.filters || {};

    // 5. TRANSFORMAR filtros del frontend al formato que espera Cloud API
    const backendFilters = frontendFilters;

    console.log(`[search/route] Enviando a Cloud API:`, {
  tenantId,
  filters: backendFilters,
  limit,
  skip
});

    // 6. ✅ LLAMAR A CLOUD API REAL con los filtros
    const result = await searchAssetsWithSession(
      sessionToken,
      backendFilters,
      limit,
      skip,
      authHeader,
      tenantId
    );

    // 7. Responder con los datos YA FILTRADOS
    return NextResponse.json({
      ok: true,
      assets: result.assets || [],
      total: result.total || 0, // 👈 ESTE ES EL TOTAL REAL DE LA BD
      limit: result.limit,
      skip: result.skip,
      hasMore: result.hasMore
    });

  } catch (err: any) {
    console.error("❌ Error en /api/cloud/assets/search:", err);
    return NextResponse.json(
      { 
        ok: false, 
        error: err?.message || "Error en búsqueda",
        details: err?.stack 
      },
      { status: 500 }
    );
  }
}