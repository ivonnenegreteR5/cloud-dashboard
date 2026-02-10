// app/superadmin/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TenantItem = {
  id: string;
  name?: string;
  // ✅ opcional: si tu API ya lo manda (recomendado)
  apps?: string[];
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizeApps(input: any): string[] {
  const arr = Array.isArray(input) ? input : [];
  const clean = arr.map((x) => String(x || "").trim()).filter(Boolean);
  // ✅ "main" siempre presente (por si no viene)
  return clean.length ? clean : ["main"];
}

function setCookie(name: string, value: string, maxAgeSec = 60 * 60 * 24 * 365) {
  try {
    // SameSite=Lax y Path=/ para que lo vea middleware y todo el sitio
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
      value
    )}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
  } catch {
    // ignore
  }
}

export default function SuperadminPage() {
  const router = useRouter();

  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingEnter, setLoadingEnter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSessionToken = () => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("cloudSessionToken");
  };

  const getIdToken = () => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("cloudIdToken");
  };

  const isSuperAdmin = () => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("cloudIsSuperAdmin") === "true";
  };

  const safeTenants = useMemo(
    () =>
      (tenants || [])
        .filter((t) => isNonEmptyString(t?.id))
        .map((t) => ({ ...t, id: t.id.trim() })),
    [tenants]
  );

  // ✅ Trae branding (name/logo/theme/apps) del tenant seleccionado y lo guarda
  const fetchAndStoreBranding = async (tenantId: string) => {
  const sessionToken = getSessionToken();
  const idToken = getIdToken();

  if (!sessionToken || !idToken) {
    throw new Error("Falta sesión (tokens). Cierra sesión e inicia de nuevo.");
  }

  const urlA = `/api/idlinens/tenants/me?tenantId=${encodeURIComponent(tenantId)}`;
  const urlB = `/api/idlinens/tenants/me`;

  const commonHeaders: Record<string, string> = {
    Authorization: `Bearer ${idToken}`,
    "x-session-token": sessionToken,
  };

  let res = await fetch(urlA, { method: "GET", headers: commonHeaders, cache: "no-store" });

  if (!res.ok) {
    res = await fetch(urlB, {
      method: "GET",
      headers: { ...commonHeaders, "x-tenant-id": tenantId },
      cache: "no-store",
    });
  }

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || data?.raw || `HTTP ${res.status}`);
  }

  // ✅ TU BACKEND REGRESA { tenant: {...} }
  const tdata = data?.tenant ?? data ?? {};

  const name = String(tdata?.name || tdata?.tenantName || "").trim();
  const logoUrl = String(tdata?.logoUrl || tdata?.tenantLogoUrl || tdata?.logo || "").trim();
  const theme = tdata?.theme ?? tdata?.tenantTheme ?? null;
  const apps = Array.isArray(tdata?.apps) ? normalizeApps(tdata.apps) : null;

  if (name) window.localStorage.setItem("cloudTenantName", name);
  else window.localStorage.removeItem("cloudTenantName");

  if (logoUrl) window.localStorage.setItem("cloudTenantLogoUrl", logoUrl);
  else window.localStorage.removeItem("cloudTenantLogoUrl");

  window.localStorage.setItem("cloudTenantTheme", JSON.stringify(theme));

  if (apps && apps.length) {
    window.localStorage.setItem("cloudApps", JSON.stringify(apps));
  }
};

  useEffect(() => {
    if (!isSuperAdmin()) {
      router.push("/login");
      return;
    }

    const fetchTenants = async () => {
      try {
        setLoadingTenants(true);
        setError(null);

        const sessionToken = getSessionToken();
        const idToken = getIdToken();

        if (!sessionToken || !idToken) {
          throw new Error("Falta sesión (tokens). Cierra sesión e inicia de nuevo.");
        }

        // ✅ tu route
        const res = await fetch("/api/tenants/list", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "x-session-token": sessionToken,
          },
          cache: "no-store",
        });

        const text = await res.text();
        let data: any = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { raw: text };
        }

        if (!res.ok) {
          throw new Error(
            data?.error || data?.message || data?.raw || `HTTP ${res.status}`
          );
        }

        // ✅ puede venir {items:[...]} o directamente [...]
        const rawItems: TenantItem[] = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
          ? data
          : [];

        // ✅ Limpieza
        const cleaned: TenantItem[] = rawItems
          .filter((t) => isNonEmptyString(t?.id))
          .map((t) => ({
            ...t,
            id: t.id.trim(),
            // ✅ si no existe, lo dejamos undefined (lo resolveremos al entrar)
            apps: Array.isArray((t as any)?.apps)
              ? normalizeApps((t as any).apps)
              : (t as any)?.apps,
          }));

        setTenants(cleaned);

        const last = window.localStorage.getItem("cloudLastTenant");
        if (isNonEmptyString(last) && cleaned.some((t) => t.id === last.trim())) {
          setSelectedTenant(last.trim());
        } else if (cleaned.length > 0) {
          setSelectedTenant(cleaned[0].id);
        }
      } catch (e: any) {
        setError(e?.message || "Error cargando tenants");
      } finally {
        setLoadingTenants(false);
      }
    };

    fetchTenants();
  }, [router]);

  const handleEnter = async () => {
    try {
      setLoadingEnter(true);
      setError(null);

      if (!isNonEmptyString(selectedTenant)) {
        throw new Error("Selecciona un tenant");
      }

      const t = selectedTenant.trim();

      // ✅ 1) guardamos selección (para recordar)
      window.localStorage.setItem("cloudLastTenant", t);

      // ✅ 2) tenant seleccionado para DATA (superadmin cross-tenant)
      window.localStorage.setItem("cloudSelectedTenantId", t);
      setCookie("cloudSelectedTenantId", t); // 🔥 clave para que middleware lo use

      // ✅ 3) (opcional pero recomendado) tenant actual del dashboard
      window.localStorage.setItem("cloudTenantId", t);

      // ✅ 4) Guardar apps del tenant seleccionado (para que aparezca IDLinens)
      // Intento A: si venían en el listado (/api/tenants/list)
      const tenantObj = safeTenants.find((x) => x.id === t);
      const appsFromList = Array.isArray((tenantObj as any)?.apps)
        ? normalizeApps((tenantObj as any).apps)
        : [];

      if (appsFromList.length) {
        window.localStorage.setItem("cloudApps", JSON.stringify(appsFromList));
      } else {
        // fallback mínimo
        window.localStorage.setItem("cloudApps", JSON.stringify(["main"]));
      }

      // ✅ 4.5) Branding (nombre/logo/theme) para que el shell lo muestre
      // (Si falla, no bloqueamos entrada; solo quedará el fallback)
      try {
        await fetchAndStoreBranding(t);
      } catch (e) {
        console.warn("No se pudo cargar branding del tenant:", e);
      }

      // ✅ 5) navegar al tenant
      router.push(`/${t}`);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoadingEnter(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-xl shadow-md">
        <CardHeader>
          <CardTitle>Superadmin: Elegir tenant</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {loadingTenants ? (
            <p className="text-sm text-neutral-600">Cargando tenants…</p>
          ) : (
            <>
              <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un tenant" />
                </SelectTrigger>

                <SelectContent>
                  {safeTenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name || t.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                onClick={handleEnter}
                disabled={!isNonEmptyString(selectedTenant) || loadingEnter}
              >
                {loadingEnter ? "Entrando…" : "Entrar"}
              </Button>

              {safeTenants.length === 0 && (
                <p className="text-sm text-neutral-600">
                  No hay tenants disponibles para tu usuario.
                </p>
              )}
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>
          )}

          <p className="text-xs text-neutral-500">
            Solo Ivonne y Evelin pueden ver esta pantalla.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
