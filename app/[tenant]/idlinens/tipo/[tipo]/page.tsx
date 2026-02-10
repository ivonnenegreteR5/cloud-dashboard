// app/[tenant]/idlinens/tipo/[tipo]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { DetalleTable } from "@/components/idlinens/DetalleTable";
import { fetchDetallePage, type DetalleRow, type EstadoKey } from "@/components/idlinens/api";

// ✅ Solo los estados que queremos mostrar aquí (mezcla)
type Estado2 = Extract<EstadoKey, "nuevos" | "circulacion">;

function label(estado: Estado2) {
  return estado === "nuevos" ? "Nuevos" : "Circulación";
}

type EstadoMeta2 = Record<Estado2, { total: number; loaded: number }>;

export default function IdLinensTipoPage() {
  const router = useRouter();

  // ✅ leer tenant y tipo desde la URL
  const params = useParams<{ tenant?: string; tipo?: string }>();
  const tenantId = String(params?.tenant || "").trim();

  const tipo = useMemo(() => {
    const raw = String(params?.tipo || "");
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [params?.tipo]);

  const siteTitle = "Distribución de prendas";

  const [rows, setRows] = useState<DetalleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ✅ progreso separado para nuevos y circulación
  const [meta, setMeta] = useState<EstadoMeta2>({
    nuevos: { total: 0, loaded: 0 },
    circulacion: { total: 0, loaded: 0 },
  });

  const canLoadMore = useMemo(() => {
    return (
      meta.nuevos.loaded < meta.nuevos.total ||
      meta.circulacion.loaded < meta.circulacion.total
    );
  }, [meta]);

  // Solo informativo para el header
  const currentPhase = useMemo(() => {
    if (meta.nuevos.loaded < meta.nuevos.total) return label("nuevos");
    if (meta.circulacion.loaded < meta.circulacion.total) return label("circulacion");
    return "Fin";
  }, [meta]);

  async function loadFirst() {
    setLoading(true);
    setErr(null);
    setRows([]);

    setMeta({
      nuevos: { total: 0, loaded: 0 },
      circulacion: { total: 0, loaded: 0 },
    });

    try {
      // ✅ trae ambos estados desde el inicio
      const [pNuevos, pCirc] = await Promise.all([
        fetchDetallePage(tenantId, "nuevos", tipo, 200, 0),
        fetchDetallePage(tenantId, "circulacion", tipo, 200, 0),
      ]);

      // ✅ muestra ambos juntos (bloque: nuevos + circulación)
      setRows([...pNuevos.rows, ...pCirc.rows]);

      setMeta({
        nuevos: { total: pNuevos.total, loaded: pNuevos.rows.length },
        circulacion: { total: pCirc.total, loaded: pCirc.rows.length },
      });
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (loadingMore || !canLoadMore) return;
    setLoadingMore(true);

    try {
      // ✅ sigue paginando: termina nuevos primero, luego circulación
      if (meta.nuevos.loaded < meta.nuevos.total) {
        const page = await fetchDetallePage(
          tenantId,
          "nuevos",
          tipo,
          200,
          meta.nuevos.loaded
        );

        setRows((prev) => [...prev, ...page.rows]);

        setMeta((m) => ({
          ...m,
          nuevos: {
            total: page.total,
            loaded: m.nuevos.loaded + page.rows.length,
          },
        }));
        return;
      }

      if (meta.circulacion.loaded < meta.circulacion.total) {
        const page = await fetchDetallePage(
          tenantId,
          "circulacion",
          tipo,
          200,
          meta.circulacion.loaded
        );

        setRows((prev) => [...prev, ...page.rows]);

        setMeta((m) => ({
          ...m,
          circulacion: {
            total: page.total,
            loaded: m.circulacion.loaded + page.rows.length,
          },
        }));
        return;
      }
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!tenantId) {
      setErr("Tenant inválido en la URL");
      setLoading(false);
      return;
    }
    if (!tipo) {
      setErr("Tipo inválido");
      setLoading(false);
      return;
    }
    loadFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tipo]);

  return (
    <IdLinensShell tenantId={tenantId} title={siteTitle}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
        <button
          type="button"
          onClick={() => router.push(`/${tenantId}/idlinens`)}
          className="rounded-md px-2 py-1 hover:bg-neutral-100"
        >
          ← Volver
        </button>

        <span>·</span>

        <span className="text-neutral-900">Tipo: {tipo}</span>

        <span className="text-neutral-500">
          (mostrando {rows.length} · {currentPhase})
        </span>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error: {err}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-neutral-600">
          Cargando tabla…
        </div>
      ) : (
        <>
          <DetalleTable rows={rows} />

          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-neutral-500">
              Se carga paginado (Nuevos + Circulación) para que abra rápido.
            </div>

            <button
              type="button"
              onClick={loadMore}
              disabled={!canLoadMore || loadingMore}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-50 hover:bg-neutral-50"
            >
              {loadingMore ? "Cargando…" : canLoadMore ? "Cargar más" : "Fin"}
            </button>
          </div>
        </>
      )}
    </IdLinensShell>
  );
}
