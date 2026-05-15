// app/[tenant]/idlinens/retirados/tipo/[tipo]/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { fetchRetiradosDetail, type AnalysisDetailItem } from "@/components/idlinens/api";

type Params = { tenant?: string; tipo?: string };

function fmtDateTime(ms?: number | null) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString("es-MX");
  } catch {
    return "—";
  }
}

function ageDays(ms?: number | null) {
  if (!ms) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
}

type ColumnKey =
  | "tipo"
  | "tag"
  | "lastSeenAtMs"
  | "cycles"
  | "createdAtMs"
  | "ageDays"
  | "location"
  | "laundryDays"
  | "status";

const defaultColumns: { key: ColumnKey; label: string }[] = [
  { key: "tipo", label: "Tipo de blancos" },
  { key: "tag", label: "Número RFID" },
  { key: "lastSeenAtMs", label: "Visto por última vez" },
  { key: "cycles", label: "Ciclos de lavado" },
  { key: "createdAtMs", label: "Creado" },
  { key: "ageDays", label: "Antigüedad en días" },
  { key: "location", label: "Ubicación" },
  { key: "laundryDays", label: "Días en Lavandería" },
  { key: "status", label: "Estado" },
];

function getCellValue(r: any, key: ColumnKey) {
  if (key === "tipo") return String(r.tipo || r.type || "—");
  if (key === "tag") return String(r.tag || r.epc || r.rfid || "—");

  if (key === "lastSeenAtMs") {
    return fmtDateTime(r.lastSeenAtMs ?? r.vistoUltimaVezMs ?? r.updatedAtMs ?? r.createdAtMs ?? null);
  }

  if (key === "cycles") {
    return Number(r._cycles ?? r.ciclosLavado ?? r.cycles ?? 0) || 0;
  }

  if (key === "createdAtMs") {
    return fmtDateTime(r.createdAtMs ?? null);
  }

  if (key === "ageDays") {
    return Number(r._ageDays || 0);
  }

  if (key === "location") {
    return String(r.location || r.ubicacion || "—");
  }

  if (key === "laundryDays") {
    return Number(r._laundryDays ?? r.diasLavanderia ?? r.diasEnLavanderia ?? r._ageDays ?? 0) || 0;
  }

  if (key === "status") {
    return String(r.status || r.estado || "—");
  }

  return "—";
}

export default function RetiradosTipoPage() {
  const router = useRouter();
  const params = useParams<Params>();

  const tenantId = useMemo(() => String(params?.tenant || "").trim(), [params?.tenant]);

  const tipo = useMemo(() => {
    const raw = String(params?.tipo || "");
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [params?.tipo]);

  const [rows, setRows] = useState<AnalysisDetailItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const [columns, setColumns] = useState(defaultColumns);
  const [dragKey, setDragKey] = useState<ColumnKey | null>(null);

  const limit = 200;
  const canLoadMore = rows.length < total;

  const loadPage = useCallback(
    async (nextSkip: number, append: boolean) => {
      const r = await fetchRetiradosDetail(tenantId, {
        mode: "tipo",
        tipo,
        limit,
        skip: nextSkip,
        ttlSeconds: 60,
        maxScan: 50_000,
        pageSize: 1000,
      });

      const nextItems = Array.isArray(r.items) ? (r.items as AnalysisDetailItem[]) : [];
      setTotal(Number(r.total || 0));
      setRows((prev) => (append ? [...prev, ...nextItems] : nextItems));
    },
    [tenantId, tipo]
  );

  useEffect(() => {
    if (!tenantId) {
      setErr("Falta tenantId.");
      setLoading(false);
      return;
    }

    if (!tipo) {
      setErr("Falta tipo.");
      setLoading(false);
      return;
    }

    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        setRows([]);
        setTotal(0);
        await loadPage(0, false);
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [tenantId, tipo, loadPage]);

  const onLoadMore = useCallback(async () => {
    if (!canLoadMore || loadingMore) return;

    try {
      setLoadingMore(true);
      await loadPage(rows.length, true);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoadingMore(false);
    }
  }, [canLoadMore, loadingMore, loadPage, rows.length]);

  const computedRows = useMemo(() => {
    const arr = Array.isArray(rows) ? [...rows] : [];

    arr.sort((a: any, b: any) => {
      const bm = Number(b?.lastSeenAtMs ?? b?.updatedAtMs ?? b?.createdAtMs ?? 0);
      const am = Number(a?.lastSeenAtMs ?? a?.updatedAtMs ?? a?.createdAtMs ?? 0);
      return bm - am;
    });

    return arr.map((r: any) => {
      const lastSeen = r.lastSeenAtMs ?? r.vistoUltimaVezMs ?? r.updatedAtMs ?? r.createdAtMs ?? null;
      const created = r.createdAtMs ?? null;

      return {
        ...r,
        _ageDays: ageDays(created),
        _laundryDays: ageDays(lastSeen),
        _cycles: Number(r.ciclosLavado ?? r.cycles ?? 0) || 0,
      };
    });
  }, [rows]);

  const moveColumn = useCallback(
    (targetKey: ColumnKey) => {
      if (!dragKey || dragKey === targetKey) return;

      setColumns((prev) => {
        const next = [...prev];
        const from = next.findIndex((c) => c.key === dragKey);
        const to = next.findIndex((c) => c.key === targetKey);

        if (from < 0 || to < 0) return prev;

        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);

        return next;
      });

      setDragKey(null);
    },
    [dragKey]
  );

  const downloadExcel = useCallback(async () => {
    if (!tenantId || !tipo || downloading) return;

    try {
      setDownloading(true);
      setErr(null);

      const pageLimit = 1000;
      let skip = 0;
      let allItems: AnalysisDetailItem[] = [];
      let grandTotal = total || 0;

      while (true) {
        const r = await fetchRetiradosDetail(tenantId, {
          mode: "tipo",
          tipo,
          limit: pageLimit,
          skip,
          ttlSeconds: 60,
          maxScan: 50_000,
          pageSize: 1000,
        });

        const items = Array.isArray(r.items) ? (r.items as AnalysisDetailItem[]) : [];
        grandTotal = Number(r.total || grandTotal || items.length);

        allItems = [...allItems, ...items];

        if (!items.length) break;
        if (allItems.length >= grandTotal) break;

        skip += pageLimit;
      }

      const normalized = allItems.map((r: any) => {
        const lastSeen = r.lastSeenAtMs ?? r.vistoUltimaVezMs ?? r.updatedAtMs ?? r.createdAtMs ?? null;
        const created = r.createdAtMs ?? null;

        return {
          ...r,
          _ageDays: ageDays(created),
          _laundryDays: ageDays(lastSeen),
          _cycles: Number(r.ciclosLavado ?? r.cycles ?? 0) || 0,
        };
      });

      const exportRows = normalized.map((r: any) => {
        const obj: Record<string, any> = {};
        columns.forEach((col) => {
          obj[col.label] = getCellValue(r, col.key);
        });
        return obj;
      });

      const XLSX = await import("xlsx");

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(wb, ws, "Retirados");
      XLSX.writeFile(wb, `retirados_${tipo || "tipo"}_${tenantId}.xlsx`);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setDownloading(false);
    }
  }, [tenantId, tipo, downloading, total, columns]);

  return (
    <IdLinensShell tenantId={tenantId} title="Retirados de inventario">
      <div className="px-4 md:px-6 py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/${tenantId}/idlinens/retirados`)}
              className="rounded-md px-2 py-1 hover:bg-neutral-100"
            >
              ← Volver
            </button>

            <span>·</span>

            <span className="text-neutral-900">
              Tipo: {tipo || "—"}
            </span>

            <span className="text-neutral-500">
              (mostrando {rows.length} de {total})
            </span>
          </div>

          <button
            type="button"
            onClick={downloadExcel}
            disabled={downloading || loading || !total}
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {downloading ? "Descargando…" : "Descargar Excel"}
          </button>
        </div>

        {err ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Error: {err}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border bg-white p-6 text-sm text-neutral-600">
            Cargando tabla…
          </div>
        ) : (
          <>
            <div className="rounded-2xl border bg-white overflow-auto">
              <table className="w-full min-w-[1500px] text-sm">
                <thead className="sticky top-0 bg-white shadow-sm">
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        draggable
                        onDragStart={() => setDragKey(col.key)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => moveColumn(col.key)}
                        className="p-3 text-left select-none whitespace-nowrap"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-400 text-xs cursor-grab active:cursor-grabbing">
                            ⋮⋮
                          </span>
                          <span>{col.label}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {computedRows.map((r: any, idx: number) => (
                    <tr
                      key={(r._id || r.tag || idx) + ""}
                      className="border-t hover:bg-neutral-50"
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={
                            col.key === "tag"
                              ? "p-3 font-mono text-[12px] whitespace-nowrap"
                              : col.key === "status"
                              ? "p-3 whitespace-nowrap"
                              : "p-3 whitespace-nowrap"
                          }
                        >
                          {col.key === "status" ? (
                            <span className="inline-flex min-w-[44px] justify-center rounded-full border bg-white px-3 py-1 text-xs">
                              {getCellValue(r, col.key)}
                            </span>
                          ) : (
                            getCellValue(r, col.key)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {!computedRows.length ? (
                    <tr>
                      <td className="p-3 opacity-70" colSpan={columns.length}>
                        Sin datos.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-neutral-500">
                Paginado para abrir rápido. El Excel descarga el total detectado: {total}.
              </div>

              <button
                type="button"
                disabled={!canLoadMore || loadingMore}
                onClick={onLoadMore}
                className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50"
              >
                {loadingMore ? "Cargando…" : canLoadMore ? "Cargar más" : "Fin"}
              </button>
            </div>
          </>
        )}
      </div>
    </IdLinensShell>
  );
}