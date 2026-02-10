// app/api/cloud/personnel/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cloudUpsertPersonnel } from "@/lib/cloudApi";

// Nota: cloudUpsertPersonnel lo agregamos abajo en cloudApi.ts si no existe.

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.headers.get("x-session-token");
    const tenantIdHeader = req.headers.get("x-tenant-id");
    const authHeader = req.headers.get("authorization") || undefined; // Bearer {idToken}

    if (!sessionToken) {
      return NextResponse.json(
        { status: 401, message: "Falta x-session-token" },
        { status: 401 }
      );
    }
    if (!tenantIdHeader) {
      return NextResponse.json(
        { status: 400, message: "Falta x-tenant-id" },
        { status: 400 }
      );
    }

    const tenantId = String(tenantIdHeader).trim();

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const role = String(body?.role || "user").trim();
    const location = String(body?.location || "").trim();

    if (!id) {
      return NextResponse.json(
        { status: 400, message: "id es requerido" },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        { status: 400, message: "name es requerido" },
        { status: 400 }
      );
    }

    // Email es recomendable porque es el que amarra Firebase claims
    if (!email) {
      return NextResponse.json(
        { status: 400, message: "email es requerido para reparar claims" },
        { status: 400 }
      );
    }

    const data = await cloudUpsertPersonnel({
      tenantId,
      sessionToken,
      authHeader,
      item: {
        _id: id,
        Name: name,
        Email: email,
        role,
        Location: location,
      },
    });

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error("cloud personnel/upsert error:", err);
    return NextResponse.json(
      { status: 500, message: err?.message || "Error interno" },
      { status: 500 }
    );
  }
}
