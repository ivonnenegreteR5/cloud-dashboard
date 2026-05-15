//components/inventory/inventory-dashboard.tsx
"use client";

import Link from "next/link";
import {
  BarChart3,
  ClipboardList,
  History,
  PackageCheck,
  RefreshCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getInventoryDashboardData,
  InventoryItem,
} from "@/lib/inventory-api";

function pct(value: number, total: number) {
  if (!total) return "0.0";
  return ((value / total) * 100).toFixed(1);
}

export function InventoryDashboard({ tenantId }: { tenantId: string }) {
  const base = `/${tenantId}/inventory`;

  const [recentItems, setRecentItems] = useState<InventoryItem[]>([]);
  const [totals, setTotals] = useState({
    totalAssets: 0,
    foundTotal: 0,
    missingTotal: 0,
    extraTotal: 0,
    duplicateTotal: 0,
    openTotal: 0,
    closedTotal: 0,
    readsTotal: 0,
    differencesTotal: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenantId) return;

    getInventoryDashboardData(tenantId)
      .then((res) => {
        setRecentItems(res.recentItems || []);
        setTotals(res.totals);
      })
      .catch((err) => {
        console.error("Inventory dashboard error:", err);
        setError(err.message || "Error cargando dashboard de inventarios");
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  const stats = [
    {
      label: "Inventarios abiertos",
      value: totals.openTotal,
      help: "Pendientes de captura RFID",
    },
    {
      label: "Lecturas recibidas",
      value: totals.readsTotal,
      help: "RFID/manual desde handheld",
    },
    {
      label: "Diferencias",
      value: totals.differencesTotal,
      help: "Faltantes, sobrantes o duplicados",
    },
    {
      label: "Cerrados",
      value: totals.closedTotal,
      help: "Listos para reporte",
    },
  ];

  const foundPercent = Number(pct(totals.foundTotal, totals.totalAssets));
  const missingPercent = Number(pct(totals.missingTotal, totals.totalAssets));
  const extraPercent = Number(pct(totals.extraTotal, totals.totalAssets));

  const donutStyle = useMemo(() => {
    const foundDeg = Math.min(foundPercent * 3.6, 360);
    const missingDeg = Math.min(foundDeg + missingPercent * 3.6, 360);
    const extraDeg = Math.min(missingDeg + extraPercent * 3.6, 360);

    return {
      background: `conic-gradient(#22c55e 0deg ${foundDeg}deg, #ef4444 ${foundDeg}deg ${missingDeg}deg, #7c3aed ${missingDeg}deg ${extraDeg}deg, #e5e7eb ${extraDeg}deg 360deg)`,
    };
  }, [foundPercent, missingPercent, extraPercent]);

  return (
    <div className="px-4 pb-8 md:px-6">
      <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
        <Badge variant="secondary">Inventory</Badge>
        <h1 className="mt-3 text-2xl font-bold text-neutral-900">
          Módulo de inventarios
        </h1>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <RefreshCcw className="h-4 w-4 animate-spin" />
          Cargando dashboard...
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <Card key={s.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-neutral-500">
                    {s.label}
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="text-3xl font-extrabold">{s.value}</div>
                  <p className="mt-1 text-xs text-neutral-500">{s.help}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <Card>
              <CardHeader>
                <CardTitle>Resumen General</CardTitle>
              </CardHeader>

              <CardContent>
                <div className="flex flex-col items-center gap-6 md:flex-row md:justify-center">
                  <div
                    className="relative h-44 w-44 rounded-full"
                    style={donutStyle}
                  >
                    <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-white">
                      <p className="text-2xl font-extrabold">
                        {totals.totalAssets}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Total assets
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-[16px_1fr_auto] items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-green-500" />
                      <span>Encontrados</span>
                      <span>
                        {totals.foundTotal} ({pct(totals.foundTotal, totals.totalAssets)}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-[16px_1fr_auto] items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-red-500" />
                      <span>Faltantes</span>
                      <span>
                        {totals.missingTotal} ({pct(totals.missingTotal, totals.totalAssets)}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-[16px_1fr_auto] items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-violet-600" />
                      <span>Sobrantes</span>
                      <span>
                        {totals.extraTotal} ({pct(totals.extraTotal, totals.totalAssets)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inventarios Recientes</CardTitle>
              </CardHeader>

              <CardContent>
                {recentItems.length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    No hay inventarios recientes.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-neutral-500">
                          <th className="py-3 font-semibold">Nombre</th>
                          <th className="py-3 font-semibold">Campo</th>
                          <th className="py-3 font-semibold">Progreso</th>
                          <th className="py-3 font-semibold">Estado</th>
                        </tr>
                      </thead>

                      <tbody>
                        {recentItems.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b last:border-b-0"
                          >
                            <td className="py-3 font-medium">{item.name}</td>

                            <td className="py-3">
                              {item.fieldLabel}: {item.fieldValue}
                            </td>

                            <td className="py-3">
                              {item.progressText}
                            </td>

                            <td className="py-3">
                              <span
                                className={
                                  item.status === "open"
                                    ? "rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700"
                                    : "rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700"
                                }
                              >
                                {item.status === "open" ? "Abierto" : "Cerrado"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <Link
                  href={`${base}/historial`}
                  className="mt-5 inline-block text-sm font-semibold text-blue-700 hover:underline"
                >
                  Ver historial →
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Accesos rápidos
                </CardTitle>
              </CardHeader>

              <CardContent className="grid gap-3 md:grid-cols-3">
                <Link
                  href={`${base}/abiertos`}
                  className="flex items-center justify-between rounded-xl border p-3 hover:bg-neutral-50"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <PackageCheck className="h-4 w-4" />
                    Inventarios abiertos
                  </span>
                </Link>

                <Link
                  href={`${base}/historial`}
                  className="flex items-center justify-between rounded-xl border p-3 hover:bg-neutral-50"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <History className="h-4 w-4" />
                    Historial
                  </span>
                </Link>

                <Link
                  href={`${base}/reportes`}
                  className="flex items-center justify-between rounded-xl border p-3 hover:bg-neutral-50"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <BarChart3 className="h-4 w-4" />
                    Reportes
                  </span>
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}