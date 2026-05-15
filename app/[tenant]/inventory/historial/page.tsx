//app/[tenant]/inventory/historial/page.tsx

"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { useTenant } from "@/components/tenant-context";
import { InventoryShell } from "@/components/inventory/inventory-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInventoryHistory, InventoryItem } from "@/lib/inventory-api";

function formatDate(value?: number | string) {
  if (!value) return "-";

  const date =
    typeof value === "number"
      ? new Date(value * 1000)
      : new Date(value);

  return date.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistorialInventariosPage() {
  const tenantId = useTenant();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenantId) return;

    getInventoryHistory(tenantId)
      .then((res) => {
        console.log("Inventory History:", res);
        setItems(res.items || []);
      })
      .catch((err) => {
        console.error("Inventory History error:", err);
        setError(err.message || "Error cargando inventarios");
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  return (
    <InventoryShell tenantId={tenantId} title="Historial de inventarios">
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
        <CardHeader>
          <CardTitle>Inventarios cerrados</CardTitle>
        </CardHeader>

        <CardContent>
          {error ? (
            <p className="text-sm text-red-600">
              {error}
            </p>
          ) : loading ? (
            <p className="text-sm text-neutral-500">
              Cargando...
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No hay inventarios cerrados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-neutral-500">
                    <th className="py-3">Inventario</th>
                    <th className="py-3">Campo</th>
                    <th className="py-3">Resultado</th>
                    <th className="py-3">Progreso</th>
                    <th className="py-3">Fecha</th>
                    <th className="py-3">Empleado</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item: any) => (
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

                      <td className="py-4">
                        {item.result === "complete" ? (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                            Completo
                          </span>
                        ) : (
                          <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
                            Incompleto
                          </span>
                        )}
                      </td>

                      <td className="py-4 font-medium">
                        {item.progressText}
                      </td>

                      <td className="py-4">
                        <div className="text-sm font-medium">
                          {formatDate(
                            item.closedAt ||
                              item.updatedAt ||
                              item.createdAt
                          )}
                        </div>
                      </td>

                      <td className="py-4">
                        <div className="font-medium">
                          {item.createdBy?.email || "-"}
                        </div>
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