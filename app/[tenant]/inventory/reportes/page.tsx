//app/[tenant]/inventory/reportes/page.tsx
"use client";

import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { useEffect, useState } from "react";

import { useTenant } from "@/components/tenant-context";
import { InventoryShell } from "@/components/inventory/inventory-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInventoryHistory, InventoryItem } from "@/lib/inventory-api";

export default function ReportesInventariosPage() {
  const tenantId = useTenant();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenantId) return;

    getInventoryHistory(tenantId)
      .then((res) => {
        console.log("Inventory Reports:", res);
        setItems(res.items || []);
      })
      .catch((err) => {
        console.error("Inventory Reports error:", err);
        setError(err.message || "Error cargando reportes");
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  return (
    <InventoryShell tenantId={tenantId} title="Reportes">
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
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Reportes PDF
          </CardTitle>
        </CardHeader>

        <CardContent>
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : loading ? (
            <p className="text-sm text-neutral-500">
              Cargando reportes...
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No hay reportes disponibles.
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
                    <th className="py-3">PDF</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b last:border-b-0"
                    >
                      <td className="py-3 font-medium">
                        {item.name}
                      </td>

                      <td className="py-3">
                        {item.fieldLabel}: {item.fieldValue}
                      </td>

                      <td className="py-3">
                        {item.result === "complete" ? (
                          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                            Completo
                          </span>
                        ) : (
                          <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                            Incompleto
                          </span>
                        )}
                      </td>

                      <td className="py-3">
                        {item.progressText}
                      </td>

                      <td className="py-3">
                        {item.report?.signedUrl ? (
                          <a
                            href={item.report.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                          >
                            <FileText className="h-4 w-4" />
                            Ver PDF
                          </a>
                        ) : (
                          "-"
                        )}
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