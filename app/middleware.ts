// middleware.ts (en la raíz del proyecto)
import { NextRequest, NextResponse } from "next/server";

function injectTenantHeader(req: NextRequest) {
  const tenant = req.cookies.get("cloudSelectedTenantId")?.value || "";
  const requestHeaders = new Headers(req.headers);

  // Si ya viene header, respétalo; si no, usa cookie
  if (tenant && !requestHeaders.get("x-tenant-id")) {
    requestHeaders.set("x-tenant-id", tenant);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ✅ 1) Tu proxy actual
  if (path.startsWith("/api/cloud")) {
    return injectTenantHeader(req);
  }

  // ✅ 2) Rutas “directas” que viste en Network (assets, transactions, custom-fields)
  //    (por si las estás pegando como /assets o /custom-fields)
  if (
    path === "/assets" ||
    path === "/transactions" ||
    path === "/custom-fields"
  ) {
    return injectTenantHeader(req);
  }

  // ✅ 3) Mismas rutas pero bajo tenant (ej: /hach/assets, /demo/transactions)
  //    Tomamos el primer segmento como tenant y el segundo como recurso.
  const parts = path.split("/").filter(Boolean); // ["hach","assets"]
  if (parts.length >= 2) {
    const resource = parts[1];
    if (
      resource === "assets" ||
      resource === "transactions" ||
      resource === "custom-fields"
    ) {
      return injectTenantHeader(req);
    }
  }

  return NextResponse.next();
}

// ✅ matcher ampliado para que Next ejecute el middleware en esas rutas
export const config = {
  matcher: [
    "/api/cloud/:path*",

    // rutas directas
    "/assets",
    "/transactions",
    "/custom-fields",

    // rutas bajo tenant (cualquier tenant)
    "/:tenant/assets",
    "/:tenant/transactions",
    "/:tenant/custom-fields",
  ],
};
