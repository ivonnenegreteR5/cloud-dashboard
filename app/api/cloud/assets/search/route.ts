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
    const backendFilters: Record<string, string> = {};
    
    Object.entries(frontendFilters).forEach(([key, filter]: [string, any]) => {
      if (!filter?.mode || !filter.value?.trim()) return;
      
      // Mapeo de columnas de UI a campos de Firestore
      if (key === 'base:ubicacion' || key === 'base:Location') {
        backendFilters['Location'] = filter.value;
      } else if (key === 'base:nombreActivo' || key === 'base:AssetType') {
        backendFilters['AssetType'] = filter.value;
      } else if (key === 'base:estado' || key === 'base:Status') {
        backendFilters['Status'] = filter.value;
        backendFilters['status'] = filter.value; // Ambos formatos
      } else if (key === 'base:rfid' || key === 'base:AssetTag') {
        backendFilters['AssetTag'] = filter.value;
      } else if (key === 'base:empleado' || key === 'base:PersonnelName') {
        backendFilters['PersonnelName'] = filter.value;
      } else if (key.startsWith('custom:')) {
        // Para campos personalizados
        const customKey = key.replace('custom:', '');
        backendFilters[`custom.${customKey}`] = filter.value;
      }
    });

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