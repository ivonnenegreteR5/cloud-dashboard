import { NextRequest, NextResponse } from "next/server";
import { cloudListAppBlancos } from "@/lib/cloudApi";

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

    const data: any = await cloudListAppBlancos(
      String(tenantId),
      String(sessionToken),
      authHeader
    );

    return NextResponse.json(
      {
        status: 0,
        items: Array.isArray(data?.items) ? data.items : [],
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("cloud app-blancos/list error:", err);
    return NextResponse.json(
      { status: 500, message: err?.message || "Error interno" },
      { status: 500 }
    );
  }
}