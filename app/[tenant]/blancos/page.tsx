//app/[tenant]/blancos/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type BlancoItem = {
  id: string;
  name: string;
};

export default function BlancosPage() {
  const tenantFromContext = useTenant() as string | undefined;
  const pathname = usePathname();

  const tenantFromPath = useMemo(() => {
    if (!pathname) return undefined;
    const parts = pathname.split("/").filter(Boolean);
    return parts[0] || undefined;
  }, [pathname]);

  const tenantFromStorage =
    typeof window !== "undefined"
      ? window.localStorage.getItem("cloudTenantId") || undefined
      : undefined;

  const tenantId =
    tenantFromContext ||
    tenantFromPath ||
    tenantFromStorage ||
    "";

  const role =
  typeof window !== "undefined"
    ? (window.localStorage.getItem("cloudUserRole") || "").toLowerCase()
    : "";

const apps =
  typeof window !== "undefined"
    ? JSON.parse(window.localStorage.getItem("cloudApps") || "[]")
    : [];

const showIdLinens = Array.isArray(apps)
  ? apps.map(String).some((x) => x.trim().toLowerCase() === "idlinens")
  : false;

const isAdminLike =
  role === "admin" ||
  role === "admin_location" ||
  role === "superadmin";

const canManage = isAdminLike && showIdLinens;

  

  const [items, setItems] = useState<BlancoItem[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  const getSessionToken = () => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("cloudSessionToken");
  };

  const getIdToken = () => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("cloudIdToken");
  };

  const buildHeaders = () => {
    const sessionToken = getSessionToken();
    const idToken = getIdToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-tenant-id": String(tenantId),
    };

    if (sessionToken) headers["x-session-token"] = sessionToken;
    if (idToken) headers["Authorization"] = `Bearer ${idToken}`;

    return headers;
  };

  const fetchBlancos = async () => {
    try {
      setLoading(true);
      setError(null);
      setOkMessage(null);

      const res = await fetch("/api/cloud/app-blancos/list", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({}),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || (data?.status !== undefined && data.status !== 0)) {
        throw new Error(data?.message || "No se pudo obtener la lista de blancos");
      }

      const mapped = Array.isArray(data?.items)
        ? data.items.map((it: any) => ({
            id: String(it?.id || ""),
            name: String(it?.name || ""),
          }))
        : [];

      setItems(mapped);
    } catch (err: any) {
      setError(err?.message || "Error al cargar blancos");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    try {
      const name = newName.trim();
      if (!name) {
        setError("Escribe el nombre del blanco");
        return;
      }

      setSaving(true);
      setError(null);  
      setOkMessage(null);

      const res = await fetch("/api/cloud/app-blancos/upsert", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          items: [{ name }],
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || (data?.status !== undefined && data.status !== 0)) {
        throw new Error(data?.message || "No se pudo guardar el blanco");
      }

      setNewName("");
      setOkMessage("Blanco agregado correctamente");
      await fetchBlancos();
    } catch (err: any) {
      setError(err?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: BlancoItem) => {
  const confirmDelete = window.confirm(
    `¿Estás segura de eliminar el blanco "${item.name}"?`
  );

  if (!confirmDelete) return;

  try {
    setDeletingId(item.id);
    setError(null);
    setOkMessage(null);

    const res = await fetch("/api/cloud/app-blancos/delete", {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        items: [{ id: item.id, name: item.name }],
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || (data?.status !== undefined && data.status !== 0)) {
      throw new Error(data?.message || "No se pudo eliminar el blanco");
    }

    setOkMessage("Blanco eliminado correctamente");
    await fetchBlancos();
  } catch (err: any) {
    setError(err?.message || "Error al eliminar");
  } finally {
    setDeletingId(null);
  }
};

  useEffect(() => {
    if (tenantId && canManage) {
      fetchBlancos();
    }
  }, [tenantId, canManage]);

  return (
    <main className="min-h-screen bg-neutral-50">
      <AppHeader />

      <div className="mx-auto max-w-5xl px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Agregar blancos</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {!canManage ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Esta sección solo está disponible para el tenant idlinens con rol admin o superadmin.
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ej. Sábana, Toalla, Funda..."
                  />
                  <Button onClick={handleAdd} disabled={saving}>
                    {saving ? "Guardando..." : "Agregar"}
                  </Button>
                </div>

                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {okMessage && (
                  <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                    {okMessage}
                  </div>
                )}

                <div className="rounded-lg border bg-white">
                  <div className="border-b px-4 py-3 font-medium">
                    Lista de blancos
                  </div>

                  {loading ? (
                    <div className="p-4 text-sm text-neutral-600">Cargando...</div>
                  ) : items.length === 0 ? (
                    <div className="p-4 text-sm text-neutral-600">
                      No hay blancos registrados.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                          <span className="text-sm text-neutral-800">{item.name}</span>

                          <Button
                            variant="destructive"
                            onClick={() => handleDelete(item)}
                            disabled={deletingId === item.id}
                          >
                            {deletingId === item.id ? "Borrando..." : "Borrar"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}