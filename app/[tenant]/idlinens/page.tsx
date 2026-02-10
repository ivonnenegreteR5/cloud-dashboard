// app/[tenant]/idlinens/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useTenant } from "@/components/tenant-context";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";

import { StatusPie } from "@/components/idlinens/StatusPie";
import { TipoBar } from "@/components/idlinens/TipoBar";

import {
  fetchResumenEstados,
  fetchTotalesPorTipo,
  EstadoResumen,
  TipoResumen,
} from "@/components/idlinens/api";

export default function IdLinensPage() {
  const tenantId = useTenant();
  const siteTitle = "ID Linens - HA Chihuahua";

  const [estados, setEstados] = useState<EstadoResumen[] | null>(null);
  const [tipos, setTipos] = useState<TipoResumen[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    setErr(null);
    Promise.all([fetchResumenEstados(tenantId), fetchTotalesPorTipo(tenantId)])
      .then(([e, t]) => {
        if (!alive) return;
        setEstados(e);
        setTipos(t);
      })
      .catch((e) => alive && setErr(String(e?.message || e)));

    return () => {
      alive = false;
    };
  }, [tenantId]);

  return (
    <IdLinensShell tenantId={tenantId} title={siteTitle}>
      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error: {err}
        </div>
      )}

      {/* ✅ Layout: Pie más chico y Barras más largo (ocupa lo que sobra) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          {!estados ? (
            <div className="rounded-lg border bg-white p-6 text-sm text-neutral-600">
              Cargando gráfica…
            </div>
          ) : (
            <StatusPie tenantId={tenantId} data={estados} />
          )}
        </div>

        <div className="lg:col-span-8">
          {!tipos ? (
            <div className="rounded-lg border bg-white p-6 text-sm text-neutral-600">
              Cargando gráfica…
            </div>
          ) : (
            <TipoBar tenantId={tenantId} data={tipos} />
          )}
        </div>
      </div>
    </IdLinensShell>
  );
}
