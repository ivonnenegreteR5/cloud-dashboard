//app/[tenant]/contenedores/page.tsx

"use client";

import React, { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { useTenant } from "@/components/tenant-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ContainerItem = {
  id: string;
  containerId: string;
  name: string;
  description?: string;
  productCount?: number;
};

type ProductItem = {
  _id?: string;
  tag?: string;
  AssetTag?: string;
  name?: string;
  type?: string;
  location?: string;
  raw?: any;
};

export default function ContenedoresPage() {
  const tenantId = String(useTenant() || "").trim();

  const [containers, setContainers] = useState<ContainerItem[]>([]);
  const [selected, setSelected] = useState<ContainerItem | null>(null);
  const [products, setProducts] = useState<ProductItem[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function getAuth() {
    const sessionToken = localStorage.getItem("cloudSessionToken") || "";
    const idToken = localStorage.getItem("cloudIdToken") || "";
    return { sessionToken, idToken };
  }

  async function callContainers(path: string, body: any = {}) {
    const { sessionToken, idToken } = getAuth();

    const res = await fetch(`/api/containers/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        tenantId,
        sessionToken,
        idToken,
        ...body,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.status >= 400) {
      throw new Error(data.message || data.details || `Error en ${path}`);
    }

    return data;
  }

  async function loadContainers() {
    if (!tenantId) return;

    try {
      setLoading(true);
      setError(null);

      const data = await callContainers("List");
      const items = Array.isArray(data.items) ? data.items : [];

      setContainers(items);

      if (selected) {
        const fresh = items.find((x: ContainerItem) => x.containerId === selected.containerId);
        setSelected(fresh || null);
      }
    } catch (e: any) {
      setError(e.message || "Error cargando contenedores");
    } finally {
      setLoading(false);
    }
  }

  async function loadProducts(containerId: string) {
    try {
      setLoading(true);
      setError(null);

      const data = await callContainers("Products", { containerId });
      setProducts(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      setError(e.message || "Error cargando productos");
    } finally {
      setLoading(false);
    }
  }

  async function createContainer() {
    try {
      setMsg(null);
      setError(null);

      if (!name.trim()) {
        setError("Escribe el nombre del contenedor.");
        return;
      }

      await callContainers("Upsert", {
        name: name.trim(),
        description: description.trim(),
      });

      setName("");
      setDescription("");
      setMsg("Contenedor guardado correctamente.");
      await loadContainers();
    } catch (e: any) {
      setError(e.message || "Error guardando contenedor");
    }
  }

  async function assignProducts() {
    try {
      setMsg(null);
      setError(null);

      if (!selected) {
        setError("Selecciona un contenedor.");
        return;
      }

      const tags = tagsText
        .split(/\n|,|;/)
        .map((x) => x.trim())
        .filter(Boolean);

      if (!tags.length) {
        setError("Pega o escribe al menos un EPC/RFID.");
        return;
      }

      const data = await callContainers("AssignProducts", {
        containerId: selected.containerId,
        tags,
      });

      setTagsText("");
      setMsg(`Asignados: ${data.updatedTotal || 0}. No encontrados: ${data.notFoundTotal || 0}.`);
      await loadContainers();
      await loadProducts(selected.containerId);
    } catch (e: any) {
      setError(e.message || "Error asignando productos");
    }
  }

  async function removeProduct(tag: string) {
    try {
      if (!selected) return;

      await callContainers("RemoveProducts", {
        containerId: selected.containerId,
        tags: [tag],
      });

      setMsg("Producto quitado del contenedor.");
      await loadContainers();
      await loadProducts(selected.containerId);
    } catch (e: any) {
      setError(e.message || "Error quitando producto");
    }
  }

  async function deleteContainer(containerId: string) {
    try {
      const ok = window.confirm("¿Seguro que deseas eliminar este contenedor?");
      if (!ok) return;

      await callContainers("Delete", { containerId });

      setSelected(null);
      setProducts([]);
      setMsg("Contenedor eliminado.");
      await loadContainers();
    } catch (e: any) {
      setError(e.message || "Error eliminando contenedor");
    }
  }

  useEffect(() => {
    loadContainers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">Contenedores</h1>
          <p className="text-sm text-neutral-500">
            Crea contenedores y asigna productos para consultar la información agrupada.
          </p>
        </div>

        {msg && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {msg}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Crear contenedor</h2>

            <div className="space-y-3">
              <Input
                placeholder="Nombre del contenedor"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <Input
                placeholder="Descripción opcional"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <Button className="w-full" onClick={createContainer}>
                Guardar contenedor
              </Button>
            </div>

            <hr className="my-5" />

            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Lista</h2>
              <Button variant="outline" size="sm" onClick={loadContainers}>
                Actualizar
              </Button>
            </div>

            <div className="space-y-2">
              {loading && containers.length === 0 && (
                <p className="text-sm text-neutral-500">Cargando...</p>
              )}

              {!loading && containers.length === 0 && (
                <p className="text-sm text-neutral-500">No hay contenedores.</p>
              )}

              {containers.map((c) => (
                <button
                  key={c.containerId}
                  onClick={() => {
                    setSelected(c);
                    loadProducts(c.containerId);
                  }}
                  className={
                    "w-full rounded-lg border px-3 py-3 text-left text-sm transition " +
                    (selected?.containerId === c.containerId
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "bg-white hover:bg-neutral-50")
                  }
                >
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs opacity-80">
                    {c.productCount || 0} productos
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm">
            {!selected ? (
              <div className="py-12 text-center text-neutral-500">
                Selecciona un contenedor para ver o asignar productos.
              </div>
            ) : (
              <>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">{selected.name}</h2>
                    <p className="text-sm text-neutral-500">
                      ID: {selected.containerId}
                    </p>
                    {selected.description && (
                      <p className="mt-1 text-sm text-neutral-600">
                        {selected.description}
                      </p>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    className="text-red-600"
                    onClick={() => deleteContainer(selected.containerId)}
                  >
                    Eliminar
                  </Button>
                </div>

                <div className="mb-6 rounded-lg border bg-neutral-50 p-4">
                  <h3 className="mb-2 font-semibold">Asignar productos</h3>
                  <p className="mb-2 text-xs text-neutral-500">
                    Pega EPC/RFID separados por salto de línea, coma o punto y coma.
                  </p>

                  <textarea
                    className="min-h-28 w-full rounded-md border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-neutral-300"
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    placeholder={"EPC1\nEPC2\nEPC3"}
                  />

                  <div className="mt-3 flex justify-end">
                    <Button onClick={assignProducts}>Asignar al contenedor</Button>
                  </div>
                </div>

                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">
                    Productos en este contenedor ({products.length})
                  </h3>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadProducts(selected.containerId)}
                  >
                    Recargar
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-100 text-left">
                      <tr>
                        <th className="px-3 py-2">RFID</th>
                        <th className="px-3 py-2">Nombre</th>
                        <th className="px-3 py-2">Ubicación</th>
                        <th className="px-3 py-2 text-right">Acción</th>
                      </tr>
                    </thead>

                    <tbody>
                      {products.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-neutral-500">
                            Este contenedor aún no tiene productos.
                          </td>
                        </tr>
                      ) : (
                        products.map((p) => {
                          const tag = String(
                            p.tag ||
                              p.AssetTag ||
                              p.raw?.AssetTag ||
                              p.raw?.tag ||
                              ""
                          );

                          return (
                            <tr key={p._id || tag} className="border-t">
                              <td className="px-3 py-2 font-mono text-xs">{tag}</td>
                              <td className="px-3 py-2">
                                {p.name || p.raw?.Name || p.raw?.name || "-"}
                              </td>
                              <td className="px-3 py-2">
                                {p.location || p.raw?.Location || p.raw?.locationId || "-"}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeProduct(tag)}
                                >
                                  Quitar
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}