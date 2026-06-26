// app/[tenant]/ubicaciones/page.tsx
// app/[tenant]/ubicaciones/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Ubicacion = {
  id: string;
  nombre: string;
  descripcion?: string;
  totalAssets: number;
  parentId?: string | null;
  isSubLocation?: boolean;
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
      return String(
        localStorage.getItem("tenantId") ||
          localStorage.getItem("cloudTenantId") ||
          localStorage.getItem("tenant") ||
          ""
      ).trim();
    }

    return "";
  }, [tenantFromContext, pathname]);

  const base = tenantId ? `/${tenantId}` : "/";

  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [subForm, setSubForm] = useState<Record<string, { id: string; name: string }>>({});
  const [editForm, setEditForm] = useState<{
    oldId: string;
    id: string;
    name: string;
    parentId?: string | null;
  } | null>(null);

  useEffect(() => {
    const role = String(localStorage.getItem("cloudUserRole") || "")
      .trim()
      .toLowerCase();

    setIsAdmin(
      role === "admin" || role === "admin_location" || role === "superadmin"
    );
  }, []);

  const getAuthHeaders = () => {
    const sessionToken = localStorage.getItem("cloudSessionToken");
    const idToken = localStorage.getItem("cloudIdToken");

    if (!sessionToken || !idToken) {
      throw new Error("Sesión no válida, vuelve a iniciar sesión.");
    }

    return {
      "Content-Type": "application/json",
      "x-session-token": sessionToken,
      Authorization: `Bearer ${idToken}`,
      "x-tenant-id": tenantId,
    };
  };

  const loadUbicaciones = useCallback(async () => {
    if (!tenantId) {
      setUbicaciones([]);
      setError("Tenant no válido. Vuelve a iniciar sesión.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const sessionToken = localStorage.getItem("cloudSessionToken");
      const idToken = localStorage.getItem("cloudIdToken");

      if (!sessionToken || !idToken) {
        throw new Error("Sesión no válida, vuelve a iniciar sesión.");
      }

      const resp = await fetch(
        `/api/cloud/locations?limit=500&tenantId=${encodeURIComponent(tenantId)}`,
        {
          headers: {
            "x-session-token": sessionToken,
            Authorization: `Bearer ${idToken}`,
            "x-tenant-id": tenantId,
          },
        }
      );

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`Error ${resp.status} al cargar ubicaciones: ${txt}`);
      }

      const data = await resp.json();

      const locationsArray: any[] = Array.isArray(data.locations)
        ? data.locations
        : Array.isArray(data.items)
          ? data.items
          : Array.isArray(data)
            ? data
            : [];

      const result: Ubicacion[] = locationsArray
        .map((loc) => {
          const raw = loc.raw || loc;

          const locId = String(loc.id || raw.id || raw._id || "").trim();

          let nombre = String(
            loc.name ||
              raw.name ||
              raw.Name ||
              firstNonEmpty(raw.LocationName, raw.Location, raw.id)
          ).trim();

          if (!nombre) nombre = locId;
          if (!locId) return null;

          const parentId = String(raw.parentId || raw.parent || "").trim();

          return {
            id: locId,
            nombre,
            descripcion: String(raw.description || raw.descripcion || "").trim() || undefined,
            totalAssets: Number(raw.totalAssets ?? loc.totalAssets ?? 0),
            parentId: parentId || null,
            isSubLocation: Boolean(raw.isSubLocation || parentId),
          };
        })
        .filter(Boolean) as Ubicacion[];

      result.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

      setUbicaciones(result);
    } catch (err: any) {
      console.error("Error al cargar ubicaciones:", err);
      setError(err.message || "Error al cargar ubicaciones");
      setUbicaciones([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadUbicaciones();
  }, [loadUbicaciones]);

  const padres = useMemo(
    () => ubicaciones.filter((u) => !u.parentId),
    [ubicaciones]
  );

  const subPorPadre = useMemo(() => {
    const map: Record<string, Ubicacion[]> = {};
    for (const u of ubicaciones) {
      if (!u.parentId) continue;
      if (!map[u.parentId]) map[u.parentId] = [];
      map[u.parentId].push(u);
    }
    return map;
  }, [ubicaciones]);

  const handleSaveLocation = async (item: {
    id: string;
    name: string;
    parentId?: string | null;
    oldId?: string;
  }) => {
    if (!tenantId) return;

    if (!isAdmin) {
      alert("No tienes permisos para guardar ubicaciones.");
      return;
    }

    const id = item.id.trim();
    const name = item.name.trim();

    if (!id || !name) {
      alert("ID y nombre son requeridos.");
      return;
    }

    try {
      setSavingId(item.oldId || id);

      const headers = getAuthHeaders();

      const resp = await fetch(
        `/api/cloud/locations?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            tenantId,
            item: {
              id,
              name,
              parentId: item.parentId || null,
              parent: item.parentId || null,
              isSubLocation: Boolean(item.parentId),
              active: true,
            },
          }),
        }
      );

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || data?.message || "No se pudo guardar");
      }

      if (item.oldId && item.oldId !== id) {
        const ok = window.confirm(
          "Cambiaste el ID. Se creará el nuevo ID y se borrará el anterior.\n\nOJO: esto no mueve automáticamente assets que todavía tengan el ID anterior."
        );

        if (ok) {
          await fetch(
            `/api/cloud/locations?tenantId=${encodeURIComponent(
              tenantId
            )}&id=${encodeURIComponent(item.oldId)}`,
            {
              method: "DELETE",
              headers,
            }
          );
        }
      }

      setEditForm(null);
      await loadUbicaciones();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Error guardando ubicación");
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateSubLocation = async (parent: Ubicacion) => {
    const form = subForm[parent.id] || { id: "", name: "" };
    const id = form.id.trim();
    const name = form.name.trim();

    if (!id || !name) {
      alert("Escribe ID y nombre de la sububicación.");
      return;
    }

    await handleSaveLocation({
      id,
      name,
      parentId: parent.id,
    });

    setSubForm((prev) => ({
      ...prev,
      [parent.id]: { id: "", name: "" },
    }));

    setExpanded((prev) => ({
      ...prev,
      [parent.id]: true,
    }));
  };

  const handleDeleteLocation = async (loc: Ubicacion) => {
    if (!tenantId) return;

    if (!isAdmin) {
      alert("No tienes permisos para borrar ubicaciones.");
      return;
    }

    const ok = window.confirm(
      `¿Seguro que quieres borrar "${loc.nombre}"?\n\nEsto no se puede deshacer.`
    );
    if (!ok) return;

    try {
      setDeletingId(loc.id);

      const headers = getAuthHeaders();

      const resp = await fetch(
        `/api/cloud/locations?tenantId=${encodeURIComponent(
          tenantId
        )}&id=${encodeURIComponent(loc.id)}`,
        {
          method: "DELETE",
          headers,
        }
      );

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || data?.ok === false) {
        throw new Error(data?.error || data?.message || "No se pudo borrar");
      }

      await loadUbicaciones();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Error borrando ubicación");
    } finally {
      setDeletingId(null);
    }
  };

  const renderEditBox = (u: Ubicacion) => {
    if (!editForm || editForm.oldId !== u.id) return null;

    return (
      <div className="mt-4 rounded-lg border bg-neutral-50 p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-neutral-600">ID</label>
            <Input
              value={editForm.id}
              onChange={(e) =>
                setEditForm((prev) =>
                  prev ? { ...prev, id: e.target.value } : prev
                )
              }
            />
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600">Nombre</label>
            <Input
              value={editForm.name}
              onChange={(e) =>
                setEditForm((prev) =>
                  prev ? { ...prev, name: e.target.value } : prev
                )
              }
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              handleSaveLocation({
                oldId: editForm.oldId,
                id: editForm.id,
                name: editForm.name,
                parentId: editForm.parentId || null,
              })
            }
            disabled={savingId === u.id}
          >
            {savingId === u.id ? "Guardando…" : "Guardar cambios"}
          </Button>

          <Button variant="outline" onClick={() => setEditForm(null)}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="outline" className="px-5 py-2">
            <Link href={base}>← Pantalla principal</Link>
          </Button>

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
          <p className="text-sm text-neutral-500">
            Administra ubicaciones principales y sububicaciones.
          </p>
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

        {!loading && !error && padres.length === 0 && (
          <div className="mt-4 rounded-md border bg-white px-6 py-10 text-center text-sm text-neutral-600 shadow-sm">
            No hay ubicaciones registradas todavía.
          </div>
        )}

        {!loading && !error && padres.length > 0 && (
          <div className="mt-4 grid gap-4">
            {padres.map((u) => {
              const subs = subPorPadre[u.id] || [];
              const isOpen = !!expanded[u.id];
              const form = subForm[u.id] || { id: "", name: "" };

              return (
                <Card key={u.id} className="border border-neutral-200 shadow-sm">
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base sm:text-lg font-semibold">
                        {u.nombre}
                      </CardTitle>
                      <p className="text-xs text-neutral-500">ID: {u.id}</p>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev,
                            [u.id]: !prev[u.id],
                          }))
                        }
                      >
                        {isOpen ? "Ocultar" : "Ver"} sububicaciones ({subs.length})
                      </Button>

                      {isAdmin && (
                        <>
                          <Button
                            variant="outline"
                            onClick={() =>
                              setEditForm({
                                oldId: u.id,
                                id: u.id,
                                name: u.nombre,
                                parentId: null,
                              })
                            }
                          >
                            Editar
                          </Button>

                          <Button
                            variant="destructive"
                            onClick={() => handleDeleteLocation(u)}
                            disabled={deletingId === u.id}
                          >
                            {deletingId === u.id ? "Borrando…" : "Borrar"}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="text-sm space-y-4">
                    <p className="text-xs text-neutral-600">
                      Total de assets:{" "}
                      <span className="font-semibold">{u.totalAssets}</span>
                    </p>

                    {renderEditBox(u)}

                    {isAdmin && !subForm[u.id] && (
  <Button
    variant="outline"
    onClick={() =>
      setSubForm((prev) => ({
        ...prev,
        [u.id]: { id: "", name: "" },
      }))
    }
  >
    + Crear sububicación
  </Button>
)}

{isAdmin && subForm[u.id] && (
  <div className="rounded-lg border bg-white p-4 space-y-3">
                        <p className="text-sm font-medium">
                          Ingresar sububicación
                        </p>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            placeholder="ID, ejemplo: sedis1"
                            value={form.id}
                            onChange={(e) =>
                              setSubForm((prev) => ({
                                ...prev,
                                [u.id]: {
                                  ...form,
                                  id: e.target.value,
                                },
                              }))
                            }
                          />

                          <Input
                            placeholder="Nombre, ejemplo: SEDIS 1"
                            value={form.name}
                            onChange={(e) =>
                              setSubForm((prev) => ({
                                ...prev,
                                [u.id]: {
                                  ...form,
                                  name: e.target.value,
                                },
                              }))
                            }
                          />
                        </div>

                      <div className="flex flex-wrap gap-2">
  <Button onClick={() => handleCreateSubLocation(u)}>
    Guardar sububicación
  </Button>

  <Button
    variant="outline"
    onClick={() =>
      setSubForm((prev) => {
        const copy = { ...prev };
        delete copy[u.id];
        return copy;
      })
    }
  >
    Cancelar
  </Button>
</div>
                      </div>
                    )}

                    {isOpen && (
                      <div className="space-y-3">
                        {subs.length === 0 ? (
                          <p className="rounded-md border bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
                            Esta ubicación todavía no tiene sububicaciones.
                          </p>
                        ) : (
                          subs.map((s) => (
                            <div
                              key={s.id}
                              className="rounded-lg border bg-neutral-50 p-4 space-y-3"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="font-medium">{s.nombre}</p>
                                  <p className="text-xs text-neutral-500">
                                    ID: {s.id}
                                  </p>
                                  <p className="text-xs text-neutral-500">
                                    Pertenece a: {u.nombre}
                                  </p>
                                </div>

                                {isAdmin && (
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        setEditForm({
                                          oldId: s.id,
                                          id: s.id,
                                          name: s.nombre,
                                          parentId: u.id,
                                        })
                                      }
                                    >
                                      Editar
                                    </Button>

                                    <Button
                                      variant="destructive"
                                      onClick={() => handleDeleteLocation(s)}
                                      disabled={deletingId === s.id}
                                    >
                                      {deletingId === s.id
                                        ? "Borrando…"
                                        : "Borrar"}
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {renderEditBox(s)}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="pt-4 text-center text-xs text-neutral-500">
          © 2025 · Dashboard Cloud API
        </div>
      </main>
    </div>
  );
}