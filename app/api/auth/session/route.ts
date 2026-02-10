// app/api/auth/session/route.ts
import { NextResponse } from "next/server";

const BASE_URL =
  process.env.CLOUD_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CLOUD_API_BASE_URL ||
  "https://cloudapi-prod-9metrcu7.uc.gateway.dev";

// x-api-key del gateway (la misma que usas en REST)
const API_KEY = process.env.CLOUD_API_API_KEY || process.env.CLOUD_API_KEY || "";

// ✅ Firebase Web API key (Identity Toolkit)
const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";

function cleanStr(v: any): string {
  const s = String(v ?? "").trim();
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

function parseApps(raw: any): string[] {
  // acepta:
  // - ["main","dline"]
  // - "main,dline"
  // - {items:[...]} (por si algún día lo mandas así)
  if (Array.isArray(raw)) return raw.map((x) => cleanStr(x)).filter(Boolean);

  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((x) => cleanStr(x))
      .filter(Boolean);
  }

  if (raw && typeof raw === "object") {
    const items = (raw as any).items;
    if (Array.isArray(items)) return items.map((x) => cleanStr(x)).filter(Boolean);
  }

  return [];
}

async function signInWithPassword(email: string, password: string) {
  if (!FIREBASE_WEB_API_KEY) {
    throw new Error("Falta FIREBASE_WEB_API_KEY (o NEXT_PUBLIC_FIREBASE_API_KEY) en .env");
  }

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(
      (data as any)?.error?.message || `Error Firebase signInWithPassword (${resp.status})`
    );
  }

  const idToken = (data as any)?.idToken as string | undefined;
  if (!idToken) throw new Error("Firebase no devolvió idToken");

  return idToken;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const email = cleanStr(body?.email);
    const password = body?.password as string | undefined;

    // ✅ (superadmin): permite pedir tenant desde login
    // (si no viene, no afecta nada)
    const requestedTenantId =
      cleanStr(body?.tenantId) ||
      cleanStr(body?.selectedTenantId) ||
      cleanStr(body?.tenant) ||
      "";

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "email y password requeridos" },
        { status: 400 }
      );
    }

    if (!API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Falta CLOUD_API_API_KEY / CLOUD_API_KEY en .env" },
        { status: 500 }
      );
    }

    if (!FIREBASE_WEB_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Falta FIREBASE_WEB_API_KEY (o NEXT_PUBLIC_FIREBASE_API_KEY) en .env" },
        { status: 500 }
      );
    }

    // ✅ 1) Generar idToken real en server (Firebase Auth REST)
    const idToken = await signInWithPassword(email, password);

    // ✅ 2) Pedir SessionToken a tu Cloud API
    const cloudResp = await fetch(`${BASE_URL}/api/v1/SessionToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        Authorization: `Bearer ${idToken}`,
        ...(requestedTenantId ? { "x-tenant-id": requestedTenantId } : {}),
      },
      body: JSON.stringify({
        email,
        password,
        apiKey: FIREBASE_WEB_API_KEY, // compat con tu server (firebaseApiKey/apiKey)
        ...(requestedTenantId ? { tenantId: requestedTenantId } : {}),
      }),
      cache: "no-store",
    });

    const text = await cloudResp.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!cloudResp.ok || (data?.status !== undefined && data?.status !== 0)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            data?.message ||
            data?.error ||
            `Error creando SessionToken (HTTP ${cloudResp.status})`,
          raw: data,
        },
        { status: cloudResp.status || 500 }
      );
    }

    // ✅ 3) SessionToken
    const sessionToken =
      cleanStr(data?.auth?.token) || cleanStr(data?.token) || cleanStr(data?.sessionToken);

    if (!sessionToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "La API no devolvió auth.token / token / sessionToken",
          raw: data,
        },
        { status: 500 }
      );
    }

    // ✅ 4) Campos reales desde backend
    const tenantId =
      cleanStr(data?.tenantId) || cleanStr(data?.tenant_id) || cleanStr(data?.tenant);

    const role = cleanStr(data?.role) || cleanStr(data?.user?.role) || "";

    const isSuperAdmin =
      Boolean(data?.isSuperAdmin) ||
      Boolean(data?.user?.isSuperAdmin) ||
      role.toLowerCase() === "superadmin";

    const requiresIdTokenRefresh = Boolean(data?.requiresIdTokenRefresh);

    // ✅ apps (módulos habilitados por tenant)
    const apps = parseApps(data?.apps);

    // ✅ Si es superadmin, aseguramos role="superadmin"
    const effectiveRole = isSuperAdmin ? "superadmin" : role || "user";

    // ✅ RESPUESTA + COOKIES (tenant seleccionado + apps)
    const res = NextResponse.json(
      {
        ok: true,
        sessionToken,
        idToken, // nota: si requiresIdTokenRefresh=true, el cliente debe refrescarlo
        requiresIdTokenRefresh,

        user: {
          uid: data?.uid ?? null,
          email: cleanStr(data?.email) || email,
          tenantId: tenantId || null,
          role: effectiveRole,
          isSuperAdmin,
          locationId: cleanStr(data?.locationId) || cleanStr(data?.location_id) || null,
          personnelId: cleanStr(data?.personnelId) || cleanStr(data?.personnel_id) || null,
          active: data?.active ?? null,
        },

        tenantId: tenantId || null,
        apps,
        expiresAt: data?.expiresAt ?? data?.expires_at ?? null,
      },
      { status: 200 }
    );

    // ✅ cookie para que el middleware / api routes sepan el tenant seleccionado
    // OJO: esto no rompe nada; solo facilita superadmin+tenant
    if (tenantId) {
      res.cookies.set("cloudSelectedTenantId", tenantId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 año
        sameSite: "lax",
      });
    }

    // ✅ cookie opcional: módulos habilitados (para UI / SSR si luego lo ocupas)
    // guardamos como CSV para evitar problemas de JSON en cookie
    if (apps.length > 0) {
      res.cookies.set("cloudApps", apps.join(","), {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    } else {
      // si no hay apps, limpiamos cookie para evitar residuos
      res.cookies.set("cloudApps", "", { path: "/", maxAge: 0 });
    }

    return res;
  } catch (err: any) {
    console.error("POST /api/auth/session error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Error creando SessionToken" },
      { status: 500 }
    );
  }
}
