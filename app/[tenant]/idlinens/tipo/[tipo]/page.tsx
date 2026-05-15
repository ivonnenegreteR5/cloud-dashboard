// app/[tenant]/idlinens/tipo/[tipo]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { DetalleTable } from "@/components/idlinens/DetalleTable";
import * as XLSX from "xlsx";
import {
  fetchDetalleTipoGlobalPage,
  type DetalleRow,
} from "@/components/idlinens/api";

export default function IdLinensTipoPage() {
  const router = useRouter();
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

  const [rows, setRows] = useState<DetalleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const PAGE_SIZE = 200;
  const EXPORT_PAGE_SIZE = 5000;

  const canLoadMore = rows.length < total;

  async function loadFirst() {
    setLoading(true);
    setErr(null);
    setRows([]);
    setTotal(0);

    try {
      const page = await fetchDetalleTipoGlobalPage(
        tenantId,
        tipo,
        PAGE_SIZE,
        0
      );

      setRows(page.rows);
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
    setErr(null);

    try {
      const page = await fetchDetalleTipoGlobalPage(
        tenantId,
        tipo,
        PAGE_SIZE,
        rows.length
      );

      setRows((prev) => [...prev, ...page.rows]);
      setTotal(page.total);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function descargarExcelCompleto() {
    if (downloadingExcel) return;

    setDownloadingExcel(true);
    setErr(null);

    try {
      const allRows: DetalleRow[] = [];
      let skip = 0;
      let remoteTotal = total;

      while (true) {
        const page = await fetchDetalleTipoGlobalPage(
          tenantId,
          tipo,
          EXPORT_PAGE_SIZE,
          skip
        );

        allRows.push(...page.rows);
        remoteTotal = page.total;
        skip += page.rows.length;

        if (!page.rows.length || skip >= page.total) break;
      }

      const data = allRows.map((r) => ({
        "Tipo de blancos": r.tipo ?? "",
        "Número RFID": r.tag ?? "",
        "Visto por última vez": r.vistoUltimaVez ?? "",
        "Ciclos de lavado": r.ciclosLavado ?? 0,
        Creado: r.creado ?? "",
        "Antigüedad (días)": r.antiguedadDias ?? 0,
        Ubicación: r.ubicacion ?? "",
        "Días en Lavandería": r.diasLavanderia ?? 0,
        Estado: r.estado ?? "",
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(wb, ws, "Prendas");

      const safeTipo =
        tipo
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "tipo";

      XLSX.writeFile(
        wb,
        `distribucion-prendas-${safeTipo}-${remoteTotal}.xlsx`
      );
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setDownloadingExcel(false);
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
    <IdLinensShell tenantId={tenantId} title="Distribución de prendas">
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
          mostrando {rows.length} de {total}
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
          <DetalleTable
            rows={rows}
            onDownloadAll={descargarExcelCompleto}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-neutral-500">
              Esta tabla es exclusiva de la gráfica de barras.
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={descargarExcelCompleto}
                disabled={downloadingExcel || total === 0}
                className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloadingExcel
                  ? "Descargando Excel…"
                  : `Descargar Excel completo (${total})`}
              </button>

              <button
                type="button"
                onClick={loadMore}
                disabled={!canLoadMore || loadingMore}
                className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                {loadingMore ? "Cargando…" : canLoadMore ? "Cargar más" : "Fin"}
              </button>
            </div>
          </div>
        </>
      )}
    </IdLinensShell>
  );
}