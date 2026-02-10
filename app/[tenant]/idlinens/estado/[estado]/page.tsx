"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { TipoPie } from "@/components/idlinens/TipoPie";
import { fetchResumenTipos, type EstadoKey, type TipoResumen } from "@/components/idlinens/api";

function label(estado: EstadoKey) {
  return estado === "nuevos"
    ? "Nuevos"
    : estado === "lavanderia"
    ? "Lavandería"
    : "Circulación";
}

export default function IdLinensEstadoPage() {
  const tenantId = useTenant();
  const router = useRouter();
  const params = useParams<{ estado?: string }>();

  const estado = String(params?.estado || "").toLowerCase() as EstadoKey;

  const siteTitle = "ID Linens - HA Chihuahua";

  const [tipos, setTipos] = useState<TipoResumen[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setTipos(null);
    setErr(null);

    if (!["nuevos", "lavanderia", "circulacion"].includes(estado)) {
      setErr("Estado inválido");
      return;
    }

    fetchResumenTipos(tenantId, estado)
      .then((t) => alive && setTipos(t))
      .catch((e) => alive && setErr(String(e?.message || e)));

    return () => {
      alive = false;
    };
  }, [tenantId, estado]);

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
        <span className="text-neutral-900">Detalle por tipo: {label(estado)}</span>
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
        <TipoPie tenantId={tenantId} estado={estado} data={tipos} />
      )}
    </IdLinensShell>
  );
}
