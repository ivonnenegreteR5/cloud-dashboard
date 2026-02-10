// app/[tenant]/idlinens/estado/[estado]/tipo/[tipo]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { DetalleTable } from "@/components/idlinens/DetalleTable";
import {
  fetchDetallePage,
  type DetalleRow,
  type EstadoKey,
} from "@/components/idlinens/api";

function label(estado: EstadoKey) {
  return estado === "nuevos"
    ? "Nuevos"
    : estado === "lavanderia"
    ? "Lavandería"
    : "Circulación";
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * ✅ IMPORTANTE (newest-first):
 * Tus DetalleRow trae `creado` y `vistoUltimaVez` como string (locale),
 * así que NO conviene parsear con Date si viene como "dd/mm/aaaa".
 * Mejor ordenamos de forma robusta:
 *  - intentamos usar timestamp si existe
 *  - si no, ordenamos por `vistoUltimaVez` como fallback
 *  - y si todo falla, dejamos el orden del backend
 */
function tryDateMs(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v > 10_000_000_000 ? v : v * 1000;

  const s = String(v).trim();
  if (!s) return 0;

  // ISO (2026-02-04T...)
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return iso;

  // dd/mm/yyyy o dd-mm-yyyy (muy común por toLocaleDateString)
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const hh = Number(m[4] ?? 0);
    const min = Number(m[5] ?? 0);
    const d = new Date(yyyy, mm - 1, dd, hh, min, 0, 0);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }

  return 0;
}

function sortNewestFirst(list: DetalleRow[]) {
  return [...list].sort((a: any, b: any) => {
    // Primero intenta por `creado` (más sentido para "últimas agregadas")
    const aCre = tryDateMs(a?.creado);
    const bCre = tryDateMs(b?.creado);
    if (aCre || bCre) return bCre - aCre;

    // Si no se puede, usa `vistoUltimaVez`
    const aVis = tryDateMs(a?.vistoUltimaVez);
    const bVis = tryDateMs(b?.vistoUltimaVez);
    if (aVis || bVis) return bVis - aVis;

    // Último recurso: estable por _id (si el backend usa ObjectId, esto suele correlacionar con tiempo)
    const aId = String(a?._id ?? "");
    const bId = String(b?._id ?? "");
    return bId.localeCompare(aId);
  });
}

export default function IdLinensEstadoTipoPage() {
  const tenantId = useTenant();
  const router = useRouter();
  const params = useParams<{ estado?: string; tipo?: string }>();

  const estado = String(params?.estado || "").toLowerCase() as EstadoKey;
  const tipo = safeDecode(String(params?.tipo || ""));

  const siteTitle = "ID Linens - HA Chihuahua";

  const [rows, setRows] = useState<DetalleRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const canLoadMore = useMemo(() => rows.length < total, [rows.length, total]);

  async function loadFirst() {
    setLoading(true);
    setErr(null);
    setRows([]);
    setTotal(0);

    try {
      const page = await fetchDetallePage(tenantId, estado, tipo, 200, 0);
      setRows(sortNewestFirst(page.rows));
      setTotal(page.total);
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
      const page = await fetchDetallePage(tenantId, estado, tipo, 200, rows.length);
      setRows((p) => sortNewestFirst([...p, ...page.rows]));
      setTotal(page.total);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    // ✅ evita requests con tenant vacío o aún no cargado
    if (!tenantId) return;

    if (!["nuevos", "lavanderia", "circulacion"].includes(estado)) {
      setErr("Estado inválido");
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
  }, [tenantId, estado, tipo]);

  return (
    <IdLinensShell tenantId={tenantId} title={siteTitle}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
        <button
          type="button"
          onClick={() => router.push(`/${tenantId}/idlinens/estado/${estado}`)}
          className="rounded-md px-2 py-1 hover:bg-neutral-100"
        >
          ← Volver
        </button>
        <span>·</span>
        <span className="text-neutral-900">
          {label(estado)} · {tipo}
        </span>
        <span className="text-neutral-500">
          ({rows.length}
          {total ? ` / ${total}` : ""})
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
              Se carga paginado para que abra rápido.
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
