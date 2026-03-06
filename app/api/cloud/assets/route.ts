// app/api/cloud/assets/route.ts
import { NextResponse } from "next/server";
import { listAssetsWithSession } from "@/lib/cloudApi";

// ✅ FORZAR SIEMPRE DINÁMICO / SIN CACHÉ en Next
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_LIMIT = 100;

// ⚠️ Para UI, NO conviene 20,000. Aunque tu API lo soporte, mata rendimiento.
// Si necesitas exportaciones masivas, haz un endpoint aparte "export".
const MAX_LIMIT = 500;

// ✅ Lista de custom keys que NO quieres que vuelvan a salir (por tenant)
const DELETED_CUSTOM_KEYS_BY_TENANT: Record<string, string[]> = {
  demo: [
    "talla",
    "CampoCinco",
    "CampoCuatro",
    "camposeis",
    "campoTres",
    "EjemploCampo",
    "ejemploDos",
    "EjemploEnDemo",
    "lastCicloAt",
    "xhxhxf",
  ],
};

// ✅ valores “vacíos” que NO deben contar como datos
function isMeaningfulValue(v: any) {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  // objetos/arrays: los dejamos (si tú quieres, aquí puedes filtrarlos también)
  return true;
}

// ✅ limpia custom: quita undefined/null/""/"   "/NaN y keys inválidas/blacklist
function sanitizeCustomObject(custom: any, deletedKeys: Set<string>) {
  if (!custom || typeof custom !== "object") return {};

  const out: Record<string, any> = {};

  for (const [kRaw, v] of Object.entries(custom)) {
    const k = String(kRaw || "").trim();
    if (!k) continue;
    if (k.toLowerCase() === "undefined") continue;

    // 🔥 blacklist por tenant
    if (deletedKeys.has(k)) continue;

    if (!isMeaningfulValue(v)) continue;

    out[k] = v;
  }

  return out;
}

// ✅ helper para headers anti-cache
function withNoStore(res: NextResponse) {
  res.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Surrogate-Control", "no-store");
  return res;
}

function toSafeInt(v: any, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export async function GET(req: Request) {
  try {
    const headers = new Headers(req.headers);

    const sessionToken = headers.get("x-session-token");
    const authHeader = headers.get("authorization") || "";

    // ✅ tenantId para DATA (superadmin)
    const tenantId = String(headers.get("x-tenant-id") || "").trim();
    if (!tenantId) {
      return withNoStore(
        NextResponse.json({ ok: false, error: "Falta x-tenant-id" }, { status: 400 })
      );
    }

    if (!sessionToken) {
      return withNoStore(
        NextResponse.json({ ok: false, error: "Falta x-session-token" }, { status: 401 })
      );
    }

    // ⚠️ Si tu Cloud API depende del idToken para autorizar, mejor exigirlo aquí
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return withNoStore(
        NextResponse.json(
          { ok: false, error: "Falta Authorization Bearer <idToken>" },
          { status: 401 }
        )
      );
    }

    const url = new URL(req.url);

    const limitNum = toSafeInt(url.searchParams.get("limit"), DEFAULT_LIMIT);
    const skipNum = toSafeInt(url.searchParams.get("skip"), 0);

    const safeLimit = Math.min(Math.max(limitNum, 1), MAX_LIMIT);
    const safeSkip = Math.max(skipNum, 0);

    // ✅ Cloud API (tu backend) debe resolver por tenant:
    // - ya sea porque le mandas tenantId en body
    // - o porque le mandas x-tenant-id al gateway
    const result = await listAssetsWithSession(
      sessionToken,
      safeLimit,
      safeSkip,
      authHeader,
      tenantId
    );

    const items = Array.isArray(result?.items) ? result.items : [];
    const totalRaw = result?.total;

    const total =
      typeof totalRaw === "number"
        ? totalRaw
        : Number.isFinite(Number(totalRaw))
        ? Number(totalRaw)
        : items.length;

    // ✅ blacklist por tenant
    const deletedKeys = new Set(
      (DELETED_CUSTOM_KEYS_BY_TENANT[tenantId] || []).map((x) => String(x).trim())
    );

    // ✅ Sanitizamos los assets (custom)
    const cleanedItems = items.map((a: any) => {
      const rawCustom = a?.raw?.custom;
      const directCustom = a?.custom;

      const cleanRawCustom = sanitizeCustomObject(rawCustom, deletedKeys);
      const cleanCustom = sanitizeCustomObject(directCustom, deletedKeys);

      const next = { ...a };

      if (next.raw && typeof next.raw === "object") {
        next.raw = { ...next.raw, custom: cleanRawCustom };
      }

      next.custom = cleanCustom;

      return next;
    });

    return withNoStore(
      NextResponse.json(
        {
          ok: true,
          assets: cleanedItems,
          total,
          limit: safeLimit,
          skip: safeSkip,
          tenantId,
        },
        { status: 200 }
      )
    );
  } catch (err: any) {
    console.error("GET /api/cloud/assets error:", err);
    return withNoStore(
      NextResponse.json(
        { ok: false, error: err?.message || "Error consultando assets" },
        { status: 500 }
      )
    );
  }
}
