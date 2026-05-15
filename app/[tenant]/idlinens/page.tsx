// app/[tenant]/idlinens/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useTenant } from "@/components/tenant-context";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";

import { StatusPie } from "@/components/idlinens/StatusPie";
import { TipoBar } from "@/components/idlinens/TipoBar";

import {
  fetchDistribucionPorUbicacion,
  fetchTotalesPorTipo,
  UbicacionResumen,
  TipoResumen,
} from "@/components/idlinens/api";

export default function IdLinensPage() {
  const tenantId = useTenant();
  const siteTitle = "ID Linens - HA Chihuahua";

  const [estados, setEstados] = useState<UbicacionResumen[] | null>(null);
  const [tipos, setTipos] = useState<TipoResumen[] | null>(null);

  const [errPie, setErrPie] = useState<string | null>(null);
  const [errBar, setErrBar] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    setErrPie(null);
    setErrBar(null);
    setEstados(null);
    setTipos(null);

    fetchDistribucionPorUbicacion(tenantId)
      .then((e) => {
        if (!alive) return;
        setEstados(e);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErrPie(e instanceof Error ? e.message : String(e));
      });

    fetchTotalesPorTipo(tenantId)
      .then((t) => {
        if (!alive) return;
        setTipos(t);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErrBar(e instanceof Error ? e.message : String(e));
      });

    return () => {
      alive = false;
    };
  }, [tenantId]);

  return (
    <IdLinensShell tenantId={tenantId} title={siteTitle}>
      {(errPie || errBar) && (
        <div className="mb-4 space-y-2">
          {errPie && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Error gráfica de localidades: {errPie}
            </div>
          )}
          {errBar && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Error gráfica por tipo: {errBar}
            </div>
          )}
        </div>
      )}

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