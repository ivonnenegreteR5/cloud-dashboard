// app/[tenant]/ubicaciones/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Ubicacion = {
  id: string;
  nombre: string;
  descripcion?: string;
  totalAssets: number;
};

function tenantFromPath(pathname: string | null) {
  if (!pathname) return "";
  const parts = pathname.split("/").filter(Boolean);
  return (parts[0] || "").trim();
}

function firstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

export default function UbicacionesListPage() {
  const pathname = usePathname();
  const tenantFromContext = (useTenant() as string) || "";

  const tenantId = useMemo(() => {
    const ctx = tenantFromContext.trim();
    if (ctx) return ctx;

    const fromUrl = tenantFromPath(pathname);
    if (fromUrl) return fromUrl;

    if (typeof window !== "undefined") {
      const stored = String(
        localStorage.getItem("tenantId") ||
          localStorage.getItem("cloudTenantId") ||
          localStorage.getItem("tenant") ||
          ""
      ).trim();
      if (stored) return stored;
    }

    return "";
  }, [tenantFromContext, pathname]);

  const base = tenantId ? `/${tenantId}` : "/";

  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ Admin full (admin / admin_location / superadmin)
  const [isAdmin, setIsAdmin] = useState(false);

  // UI state borrar
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const role = String(localStorage.getItem("cloudUserRole") || "")
        .trim()
        .toLowerCase();

      setIsAdmin(
        role === "admin" || role === "admin_location" || role === "superadmin"
      );
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const handleDeleteLocation = async (loc: Ubicacion) => {
    if (!tenantId) return;

    if (!isAdmin) {
      alert("No tienes permisos para borrar ubicaciones.");
      return;
    }

    const ok = window.confirm(
      `¿Seguro que quieres borrar la ubicación "${loc.nombre}"?\n\nEsto no se puede deshacer.`
    );
    if (!ok) return;

    const sessionToken = localStorage.getItem("cloudSessionToken");
    const idToken = localStorage.getItem("cloudIdToken");

    if (!sessionToken || !idToken) {
      alert("Sesión no válida, vuelve a iniciar sesión.");
      return;
    }

    try {
      setDeletingId(loc.id);

      const url = `/api/cloud/locations?tenantId=${encodeURIComponent(
        tenantId
      )}&id=${encodeURIComponent(loc.id)}`;

      const resp = await fetch(url, {
        method: "DELETE",
        headers: {
          "x-session-token": sessionToken,
          Authorization: `Bearer ${idToken}`,
          "x-tenant-id": tenantId,
        },
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || data?.message || "No se pudo borrar");
      }

      // ✅ quita de la lista (optimista)
      setUbicaciones((prev) => prev.filter((x) => x.id !== loc.id));
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Error borrando ubicación");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
  if (!tenantId) {
    setUbicaciones([]);
    setError("Tenant no válido. Vuelve a iniciar sesión.");
    setLoading(false);
    return;
  }

  const sessionToken = localStorage.getItem("cloudSessionToken");
  const idToken = localStorage.getItem("cloudIdToken");

  if (!sessionToken || !idToken) {
    setUbicaciones([]);
    setError("Sesión no válida, vuelve a iniciar sesión.");
    setLoading(false);
    return;
  }

  const load = async () => {
    try {
      setLoading(true);
      setError(null);

      const locationsUrl = `/api/cloud/locations?limit=500&tenantId=${encodeURIComponent(
        tenantId
      )}`;

      const commonHeaders = {
        "x-session-token": sessionToken,
        Authorization: `Bearer ${idToken}`,
        "x-tenant-id": tenantId,
      };

      const locationsResp = await fetch(locationsUrl, {
        headers: commonHeaders,
      });

      if (!locationsResp.ok) {
        const errorText = await locationsResp.text().catch(() => "");
        throw new Error(
          `Error ${locationsResp.status} al cargar ubicaciones: ${errorText}`
        );
      }

      const data = await locationsResp.json();

      // Extraemos el array correcto
      let locationsArray: any[] = [];

      if (Array.isArray(data.locations)) {
        locationsArray = data.locations;
      } else if (Array.isArray(data.items)) {
        locationsArray = data.items;
      } else if (Array.isArray(data)) {
        locationsArray = data;
      } else {
        throw new Error("La respuesta no contiene un array de ubicaciones válido");
      }

      const result: Ubicacion[] = [];

      for (const loc of locationsArray) {
        // Usamos directamente los campos planos si existen
        let locId = String(loc.id || loc._id || "").trim();
        let nombre = String(loc.name || loc.Name || "").trim();
        let descripcion = String(
          loc.description ||
          loc.descripcion ||
          loc.raw?.description ||
          (loc.active === false ? "Ubicación inactiva." : "")
        ).trim();

        // Fallback si no hay nombre → usamos id
        if (!nombre) nombre = locId;

        if (!locId) continue;

        const total = Number(loc.totalAssets ?? loc.raw?.totalAssets ?? 0);

        result.push({
          id: locId,
          nombre: nombre || locId,
          descripcion: descripcion || undefined,
          totalAssets: total,
        });
      }

      setUbicaciones(result);
    } catch (err: any) {
      console.error("Error al cargar ubicaciones:", err);
      setError(err.message || "Error al cargar ubicaciones");
      setUbicaciones([]);
    } finally {
      setLoading(false);
    }
  };

  load();
}, [tenantId]);

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="px-5 py-2">
              <Link href={base}>← Pantalla principal</Link>
            </Button>
          </div>

          {isAdmin && (
            <Button asChild className="px-5 py-2" disabled={!tenantId}>
              <Link href={tenantId ? `${base}/ubicaciones/nueva` : "#"}>
                + Crear ubicación
              </Link>
            </Button>
          )}
        </div>

        <section className="space-y-1">
          <h1 className="text-lg font-semibold">Ubicaciones</h1>
        </section>

        {loading && (
          <div className="mt-4 rounded-md border bg-white px-6 py-10 text-center text-sm text-neutral-600 shadow-sm">
            Cargando ubicaciones…
          </div>
        )}

        {!loading && error && (
          <div className="mt-4 rounded-md border bg-white px-6 py-10 text-center text-sm text-red-600 shadow-sm">
            {error}
          </div>
        )}

        {!loading && !error && ubicaciones.length === 0 && (
          <div className="mt-4 rounded-md border bg-white px-6 py-10 text-center text-sm text-neutral-600 shadow-sm">
            No hay ubicaciones registradas todavía.
          </div>
        )}

        {!loading && !error && ubicaciones.length > 0 && (
          <div className="mt-4 grid gap-4">
            {ubicaciones.map((u) => (
              <Card key={u.id} className="border border-neutral-200 shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base sm:text-lg font-semibold">
                      {u.nombre}
                    </CardTitle>
                  </div>

                  {isAdmin && (
                    <Button
                      variant="destructive"
                      className="shrink-0"
                      onClick={() => handleDeleteLocation(u)}
                      disabled={deletingId === u.id}
                    >
                      {deletingId === u.id ? "Borrando…" : "Borrar"}
                    </Button>
                  )}
                </CardHeader>

                <CardContent className="text-sm space-y-2">
                  {u.descripcion ? (
                    <p className="text-neutral-700 whitespace-pre-line">
                      {u.descripcion}
                    </p>
                  ) : (
                    <p className="text-neutral-500">Sin descripción registrada.</p>
                  )}

                  <p className="text-xs text-neutral-600">
                    Total de assets:{" "}
                    <span className="font-semibold">{u.totalAssets}</span>
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="pt-4 text-center text-xs text-neutral-500">
          © 2025 · Dashboard Cloud API
        </div>
      </main>
    </div>
  );
}