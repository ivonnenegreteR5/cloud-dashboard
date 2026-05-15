import { NextRequest, NextResponse } from "next/server";
import { cloudDeleteAppBlancos } from "@/lib/cloudApi";

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.headers.get("x-session-token");
    const tenantId = req.headers.get("x-tenant-id");
    const authHeader = req.headers.get("authorization") || undefined;

    if (!sessionToken) {
      return NextResponse.json(
        { status: 401, message: "Falta x-session-token" },
        { status: 401 }
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { status: 400, message: "Falta x-tenant-id" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!items.length) {
      return NextResponse.json(
        { status: 400, message: "items[] requerido" },
        { status: 400 }
      );
    }

    const data = await cloudDeleteAppBlancos({
      tenantId: String(tenantId),
      sessionToken: String(sessionToken),
      authHeader,
      items,
    });

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error("cloud app-blancos/delete error:", err);
    return NextResponse.json(
      { status: 500, message: err?.message || "Error interno" },
      { status: 500 }
    );
  }
}