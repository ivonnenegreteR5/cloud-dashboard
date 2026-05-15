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
} from "@/components/idlinens/api";

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function tryDateMs(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v > 10_000_000_000 ? v : v * 1000;

  const s = String(v).trim();
  if (!s || s === "-") return 0;

  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return iso;

  const m = s.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/
  );

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
    const aVis = tryDateMs(a?.vistoUltimaVez);
    const bVis = tryDateMs(b?.vistoUltimaVez);
    if (aVis || bVis) return bVis - aVis;

    const aCre = tryDateMs(a?.creado);
    const bCre = tryDateMs(b?.creado);
    if (aCre || bCre) return bCre - aCre;

    const aId = String(a?._id ?? "");
    const bId = String(b?._id ?? "");
    return bId.localeCompare(aId);
  });
}

function excelEscape(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function csvEscape(v: unknown) {
  const s = String(v ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

function downloadRowsAsExcel(rows: DetalleRow[], fileName: string) {
  const headers = [
    "Tipo de blancos",
    "Número RFID",
    "Visto por última vez",
    "Ciclos de lavado",
    "Creado",
    "Ubicación",
    "Días en Lavandería",
    "Estado",
  ];

  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) =>
      [
        r.tipo,
        r.tag ?? "",
        r.vistoUltimaVez,
        r.ciclosLavado,
        r.creado,
        r.ubicacion ?? "",
        r.diasLavanderia,
        r.estado ?? "",
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = fileName.replace(/\.xls$/i, ".csv").replace(/\.xlsx$/i, ".csv");

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export default function IdLinensEstadoTipoPage() {
  const tenantId = useTenant();
  const router = useRouter();
  const params = useParams<{ estado?: string; tipo?: string }>();

  const location = safeDecode(String(params?.estado || "")).trim();
  const tipo = safeDecode(String(params?.tipo || "")).trim();

  const siteTitle = "ID Linens - HA Chihuahua";

  const [rows, setRows] = useState<DetalleRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const canLoadMore = useMemo(() => rows.length < total, [rows.length, total]);

  async function loadFirst() {
    setLoading(true);
    setErr(null);
    setRows([]);
    setTotal(0);

    try {
      const page = await fetchDetallePage(tenantId, location, tipo, 200, 0);
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
      const page = await fetchDetallePage(
        tenantId,
        location,
        tipo,
        200,
        rows.length
      );

      setRows((prev) => sortNewestFirst([...prev, ...page.rows]));
      setTotal(page.total);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDownloadAll() {
    if (downloading) return;

    setDownloading(true);
    setErr(null);

    try {
      let allRows: DetalleRow[] = [];
      let skip = 0;
      const limit = 1000;

      while (true) {
        const page = await fetchDetallePage(
          tenantId,
          location,
          tipo,
          limit,
          skip
        );

        allRows = [...allRows, ...page.rows];

        if (allRows.length >= page.total || page.rows.length === 0) break;

       skip += page.rows.length;
      }

      const finalRows = sortNewestFirst(allRows);
      const fecha = new Date().toISOString().slice(0, 10);

     downloadRowsAsExcel(finalRows, `detalle-${location}-${tipo}-${fecha}.csv`);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    if (!tenantId) return;

    if (!location) {
      setRows([]);
      setTotal(0);
      setErr("Ubicación inválida");
      setLoading(false);
      return;
    }

    if (!tipo) {
      setRows([]);
      setTotal(0);
      setErr("Tipo inválido");
      setLoading(false);
      return;
    }

    loadFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, location, tipo]);

  return (
    <IdLinensShell tenantId={tenantId} title={siteTitle}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
        <button
          type="button"
          onClick={() =>
            router.push(
              `/${tenantId}/idlinens/estado/${encodeURIComponent(location)}`
            )
          }
          className="rounded-md px-2 py-1 hover:bg-neutral-100"
        >
          ← Volver
        </button>

        <span>·</span>

        <span className="text-neutral-900">
          {location} · {tipo}
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
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={downloading || total === 0}
              className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              {downloading ? "Preparando Excel…" : `Descargar Excel`}
            </button>
          </div>

          <DetalleTable rows={rows} />

          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-neutral-500">
              Se carga paginado para que abra rápido.
            </div>

            <button
              type="button"
              onClick={loadMore}
              disabled={!canLoadMore || loadingMore}
              className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              {loadingMore ? "Cargando…" : canLoadMore ? "Cargar más" : "Fin"}
            </button>
          </div>
        </>
      )}
    </IdLinensShell>
  );
}