//app/[tenant]/transactions/page.tsx
// app/[tenant]/transactions/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface CloudTransaction {
  id?: string;
  assetId?: string;
  locationId?: string;
  locationName?: string;
  mode?: string;
  time?: number | string;
  byUid?: string;
  byEmail?: string;
  byName?: string;
  personnelName?: string;
  personnelLocation?: string;
  assetType?: string;
  assetCode?: string;
  raw?: any;
  [key: string]: any;
}

function getTodayMxYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getYmdMxFromTime(timeVal: any) {
  const n = Number(timeVal);
  if (!Number.isFinite(n) || n <= 0) return "";

  const date = new Date(n > 9999999999 ? n : n * 1000);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatFechaMx(timeVal: any) {
  const n = Number(timeVal);
  if (!Number.isFinite(n) || n <= 0) return "-";

  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(n > 9999999999 ? n : n * 1000));
}

function normalizeMode(mode: any) {
  const m = String(mode || "").toLowerCase().trim();

  if (["in", "entrada", "checkin", "check_in", "checked in"].includes(m)) {
    return "Entrada";
  }

  if (["out", "salida", "checkout", "check_out", "checked out"].includes(m)) {
    return "Salida";
  }

  if (["created", "creado", "nuevo"].includes(m)) {
    return "Creado";
  }

  return mode || "N/A";
}

export default function TransactionsPage() {
  const tenantId = useTenant();
  const router = useRouter();

  const [items, setItems] = useState<CloudTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(25);

  const todayMx = useMemo(() => getTodayMxYmd(), []);

  useEffect(() => {
    const sToken = localStorage.getItem("cloudSessionToken");
    const iToken = localStorage.getItem("cloudIdToken");

    if (!sToken || !iToken) {
      router.push("/login");
      return;
    }

    const fetchTx = async () => {
      try {
        setLoading(true);
        setError(null);

        const resp = await fetch(
          `/api/cloud/transactions?limit=5000&dia=${todayMx}`,
          {
            headers: {
              "x-session-token": sToken,
              Authorization: `Bearer ${iToken}`,
              "x-tenant-id": tenantId,
            },
          }
        );

        const data = await resp.json();

        if (!resp.ok || !data.ok) {
          throw new Error(data.error || "Error cargando transacciones");
        }

        setItems((data.transactions || []) as CloudTransaction[]);
      } catch (err: any) {
        console.error("Error cargando transacciones:", err);
        setError(err.message || "Error cargando transacciones");
      } finally {
        setLoading(false);
      }
    };

    fetchTx();
  }, [router, tenantId, todayMx]);

  const rowsDelDia = useMemo(() => {
    return (items || [])
      .filter((t) => {
        const timeVal =
          typeof t.time === "number"
            ? t.time
            : t.time
            ? Number(t.time)
            : t.raw?.time;

        return getYmdMxFromTime(timeVal) === todayMx;
      })
      .map((t) => {
        const modeRaw = t.mode || t.raw?.mode || "";
        const tipo = normalizeMode(modeRaw);

        const ubicacion =
          t.locationName ||
          t.raw?.locationName ||
          t.raw?.location_name ||
          t.locationId ||
          t.raw?.locationId ||
          t.raw?.location_id ||
          t.raw?.Location ||
          t.personnelLocation ||
          t.raw?.personnelLocation ||
          "-";

        const epc =
          t.assetCode ||
          t.raw?.assetCode ||
          t.raw?.AssetTag ||
          t.raw?.assetTag ||
          t.raw?.tag ||
          t.assetId ||
          "-";

        const empleado =
          t.personnelName ||
          t.byName ||
          t.byEmail ||
          t.raw?.personnelName ||
          t.raw?.by_name ||
          t.raw?.by_email ||
          t.raw?.by ||
          "-";

        const timeVal =
          typeof t.time === "number"
            ? t.time
            : t.time
            ? Number(t.time)
            : t.raw?.time;

        const fecha = formatFechaMx(timeVal);

        return { tipo, ubicacion, epc, empleado, fecha };
      });
  }, [items, todayMx]);

  const rowsCortas = rowsDelDia;
  const total = rowsDelDia.length;
const totalIn = rowsDelDia.filter((r) => r.tipo === "Entrada").length;
const totalOut = rowsDelDia.filter((r) => r.tipo === "Salida").length;

const totalPages = Math.max(1, Math.ceil(rowsDelDia.length / pageSize));

const currentRows = rowsDelDia.slice(
  (page - 1) * pageSize,
  page * pageSize
);

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900">
      <AppHeader />

      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div>
          <Button asChild variant="outline" className="px-5 py-2">
            <Link href={`/${tenantId}`}>← Regresar a pantalla principal</Link>
          </Button>
        </div>

        <h2 className="text-lg font-semibold">Transacciones</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="py-4">
              <div className="text-xs font-semibold uppercase text-neutral-500">
                TOTAL TRANSACCIONES DEL DÍA
              </div>
              <div className="mt-2 text-3xl font-bold">
                {loading ? "…" : total}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="text-xs font-semibold uppercase text-neutral-500">
                ENTRADAS DEL DÍA
              </div>
              <div className="mt-2 text-3xl font-bold">
                {loading ? "…" : totalIn}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="text-xs font-semibold uppercase text-neutral-500">
                SALIDAS DEL DÍA
              </div>
              <div className="mt-2 text-3xl font-bold">
                {loading ? "…" : totalOut}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Transacciones por día</CardTitle>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </div>
            )}

            <div className="mb-3 text-xs text-neutral-500">
              Mostrando movimientos del día: {todayMx}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-600">
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Ubicación</th>
                    <th className="py-2 pr-4">Etiqueta</th>
                    <th className="py-2 pr-4">Empleado</th>
                    <th className="py-2 pr-4">Fecha</th>
                  </tr>
                </thead>

                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center">
                        Cargando transacciones…
                      </td>
                    </tr>
                  )}

                  {!loading && rowsCortas.length === 0 && !error && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center">
                        No hay transacciones registradas hoy.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    currentRows.map((t, idx) => (
                      <tr
                        key={idx}
                        className={`border-b ${
                          idx % 2 ? "bg-neutral-50" : "bg-white"
                        }`}
                      >
                        <td className="py-2 pr-4 align-top">
                          <Badge
                            variant={
                              t.tipo === "Entrada" ? "default" : "secondary"
                            }
                          >
                            {t.tipo}
                          </Badge>
                        </td>

                        <td className="py-2 pr-4 align-top">{t.ubicacion}</td>

                        <td className="py-2 pr-4 align-top font-mono text-xs">
                          {t.epc}
                        </td>

                        <td className="py-2 pr-4 align-top text-xs">
                          {t.empleado}
                        </td>

                        <td className="py-2 pr-4 align-top text-xs">
                          {t.fecha}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

  <div className="flex items-center gap-2 text-sm">
    <span>Mostrar</span>

    <select
      className="rounded border px-2 py-1"
      value={pageSize}
      onChange={(e) => {
        setPageSize(Number(e.target.value));
        setPage(1);
      }}
    >
      <option value={10}>10</option>
      <option value={25}>25</option>
      <option value={50}>50</option>
      <option value={100}>100</option>
    </select>

    <span>registros</span>
  </div>

  <div className="text-sm text-neutral-600">
    {rowsDelDia.length === 0
      ? "0 de 0"
      : `${(page - 1) * pageSize + 1} - ${Math.min(
          page * pageSize,
          rowsDelDia.length
        )} de ${rowsDelDia.length}`}
  </div>

  <div className="flex gap-2">

    <Button
      variant="outline"
      disabled={page === 1}
      onClick={() => setPage((p) => p - 1)}
    >
      ← Anterior
    </Button>

    <div className="flex items-center px-3 text-sm">
      Página {page} de {totalPages}
    </div>

    <Button
      variant="outline"
      disabled={page >= totalPages}
      onClick={() => setPage((p) => p + 1)}
    >
      Siguiente →
    </Button>

  </div>

</div>
          </CardContent>
        </Card>

        <div className="pt-2 text-center text-xs text-neutral-500">
          © 2025 · Dashboard Cloud API
        </div>
      </div>
    </div>
  );
}