//app/[tenant]/inventory/abiertos/page.tsx
"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCcw, ScanLine } from "lucide-react";
import { useEffect, useState } from "react";

import { useTenant } from "@/components/tenant-context";
import { InventoryShell } from "@/components/inventory/inventory-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOpenInventories, InventoryItem } from "@/lib/inventory-api";

export default function InventariosAbiertosPage() {
  const tenantId = useTenant();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenantId) return;

    getOpenInventories(tenantId)
      .then((res) => {
        console.log("Open Inventories:", res);
       setItems((res.items || []).filter((item) => item.expectedTotal > 0));
      })
      .catch((err) => {
        console.error("Open Inventories error:", err);
        setError(err.message || "Error cargando inventarios abiertos");
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  return (
    <InventoryShell tenantId={tenantId} title="Inventarios abiertos">
      <div className="mb-4">
        <Link
          href={`/${tenantId}/inventory`}
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Regresar al dashboard
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>
              Inventarios abiertos
            </CardTitle>

            <p className="mt-1 text-sm text-neutral-500">
              Inventarios pendientes de completar desde handheld RFID.
            </p>
          </div>

          <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
            {items.length} abiertos
          </div>
        </CardHeader>

        <CardContent>
          {error ? (
            <p className="text-sm text-red-600">
              {error}
            </p>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <RefreshCcw className="h-4 w-4 animate-spin" />
              Cargando inventarios...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-14 text-center">
              <ScanLine className="mb-3 h-10 w-10 text-neutral-300" />

              <p className="text-sm font-medium text-neutral-700">
                No hay inventarios abiertos
              </p>

              <p className="mt-1 text-sm text-neutral-500">
                Cuando un inventario quede incompleto aparecerá aquí.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-neutral-500">
                    <th className="py-3 font-medium">Inventario</th>
                    <th className="py-3 font-medium">Campo</th>
                    <th className="py-3 font-medium">Esperados</th>
                    <th className="py-3 font-medium">Leídos</th>
                    <th className="py-3 font-medium">Faltantes</th>
                    <th className="py-3 font-medium">Progreso</th>
                    <th className="py-3 font-medium">Estado</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b last:border-b-0 hover:bg-neutral-50"
                    >
                      <td className="py-4">
                        <div className="font-semibold text-neutral-900">
                          {item.name}
                        </div>

                        <div className="mt-1 text-xs text-neutral-500">
                          ID: {item.id}
                        </div>
                      </td>

                      <td className="py-4">
                        <div className="font-medium">
                          {item.fieldLabel}
                        </div>

                        <div className="mt-1 text-xs text-neutral-500">
                          {item.fieldValue}
                        </div>
                      </td>

                      <td className="py-4 font-medium">
                        {item.expectedTotal}
                      </td>

                      <td className="py-4 font-medium text-green-700">
                        {item.foundTotal}
                      </td>

                      <td className="py-4 font-medium text-red-600">
                        {item.missingTotal}
                      </td>

                      <td className="py-4">
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span>{item.progressText}</span>
                        </div>

                        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                          <div
                            className="h-full rounded-full bg-black transition-all"
                            style={{
                              width: `${
                                item.expectedTotal > 0
                                  ? (item.foundTotal / item.expectedTotal) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </td>

                      <td className="py-4">
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          Abierto
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </InventoryShell>
  );
}