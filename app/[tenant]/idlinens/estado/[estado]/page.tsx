// app/[tenant]/idlinens/estado/[estado]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { TipoPie } from "@/components/idlinens/TipoPie";
import {
  fetchResumenTipos,
  type TipoResumen,
} from "@/components/idlinens/api";

export default function IdLinensEstadoPage() {
  const tenantId = useTenant();
  const router = useRouter();
  const params = useParams<{ estado?: string }>();

  // aunque la carpeta siga llamándose [estado], ahora la usamos como location
  const location = decodeURIComponent(String(params?.estado || "")).trim();

  const siteTitle = "ID Linens - HA Chihuahua";

  const [tipos, setTipos] = useState<TipoResumen[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    setTipos(null);
    setErr(null);

    if (!location) {
      setErr("Ubicación inválida");
      return;
    }

    // ✅ Usa el endpoint rápido basado en stats/rebuild
    fetchResumenTipos(tenantId, location)
      .then((t) => {
        if (!alive) return;
        setTipos(t);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : String(e));
      });

    return () => {
      alive = false;
    };
  }, [tenantId, location]);

  return (
    <IdLinensShell tenantId={tenantId} title={siteTitle}>
      <div className="mb-3 flex items-center gap-2 text-sm text-neutral-600">
        <button
          type="button"
          onClick={() => router.push(`/${tenantId}/idlinens`)}
          className="rounded-md px-2 py-1 hover:bg-neutral-100"
        >
          ← Volver
        </button>

        <span>·</span>

        <span className="text-neutral-900">
          Detalle por tipo: {location || "Ubicación"}
        </span>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error: {err}
        </div>
      )}

      {!tipos ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-neutral-600">
          Cargando gráfica…
        </div>
      ) : (
        <TipoPie tenantId={tenantId} location={location} data={tipos} />
      )}
    </IdLinensShell>
  );
}