// app/[tenant]/idlinens/retirados/antiguedad/semana/[week]/tipo/[tipo]/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { fetchRetiradosDetail } from "@/components/idlinens/api";
import { Button } from "@/components/ui/button";

type Params = { tenant?: string; tenantId?: string; week?: string; tipo?: string };

type RetiradoRow = {
  _id?: string;
  tag?: string;
  tipo?: string;
  status?: string;
  location?: string;
  ciclosLavado?: number;
  createdAtMs?: number | null;
  lastSeenAtMs?: number | null;
  updatedAtMs?: number | null;
};

function fmtDateTime(ms?: number | null) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString("es-MX");
  } catch {
    return "—";
  }
}

function toAgeDays(ms?: number | null) {
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

function normalizeRow(r: any) {
  const lastSeen =
    r.lastSeenAtMs ??
    r.vistoUltimaVezMs ??
    r.updatedAtMs ??
    r.createdAtMs ??
    null;

  const created = r.createdAtMs ?? null;

  return {
    ...r,
    _lastSeenAtMs: lastSeen,
    _ageDays: toAgeDays(created),
    _laundryDays: toAgeDays(lastSeen),
    _cycles: Number(r.ciclosLavado ?? r.cycles ?? 0) || 0,
  };
}

function getCellValue(r: any, key: ColumnKey) {
  if (key === "tipo") return String(r.tipo || r.type || "—");
  if (key === "tag") return String(r.tag || r.epc || r.rfid || "—");
  if (key === "lastSeenAtMs") return fmtDateTime(r._lastSeenAtMs ?? null);
  if (key === "cycles") return Number(r._cycles || 0);
  if (key === "createdAtMs") return fmtDateTime(r.createdAtMs ?? null);
  if (key === "ageDays") return Number(r._ageDays || 0);
  if (key === "location") return String(r.location || r.ubicacion || "—");
  if (key === "laundryDays") return Number(r._laundryDays || 0);
  if (key === "status") return String(r.status || r.estado || "—");
  return "—";
}

export default function RetiradosAgeTipoPage() {
  const router = useRouter();
  const params = useParams<Params>();

  const tenantId = String(params?.tenantId || params?.tenant || "").trim();
  const week = Number(params?.week || 0);

  const tipo = useMemo(() => {
    const raw = String(params?.tipo || "").trim();
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [params?.tipo]);

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<RetiradoRow[]>([]);
  const [total, setTotal] = useState(0);

  const [pageSize, setPageSize] = useState(200);
  const [pageIndex, setPageIndex] = useState(0);

  const [columns, setColumns] = useState(defaultColumns);
  const [dragKey, setDragKey] = useState<ColumnKey | null>(null);

  const skip = pageIndex * pageSize;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        if (!tenantId) throw new Error("No tenantId.");
        if (!Number.isFinite(week) || week < 1) throw new Error("Semana inválida.");
        if (!tipo) throw new Error("Falta tipo (ruta).");

        const resp = await fetchRetiradosDetail(tenantId, {
          mode: "ageWeekTipo",
          week,
          tipo,
          limit: pageSize,
          skip,
          ttlSeconds: 60,
          maxScan: 50_000,
          pageSize: 1000,
        });

        if (!alive) return;
        setRows((resp.items || []) as RetiradoRow[]);
        setTotal(Number(resp.total || 0));
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || e || "Error"));
        setRows([]);
        setTotal(0);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [tenantId, week, tipo, pageSize, skip]);

  const showingFrom = total ? skip + 1 : 0;
  const showingTo = Math.min(skip + rows.length, total);

  const canPrev = pageIndex > 0;
  const canNext = skip + pageSize < total;

  const computedRows = useMemo(() => {
    return rows.map((r) => normalizeRow(r));
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
      let nextSkip = 0;
      let allItems: RetiradoRow[] = [];
      let grandTotal = total || 0;

      while (true) {
        const resp = await fetchRetiradosDetail(tenantId, {
          mode: "ageWeekTipo",
          week,
          tipo,
          limit: pageLimit,
          skip: nextSkip,
          ttlSeconds: 60,
          maxScan: 50_000,
          pageSize: 1000,
        });

        const items = Array.isArray(resp.items) ? (resp.items as RetiradoRow[]) : [];
        grandTotal = Number(resp.total || grandTotal || items.length);

        allItems = [...allItems, ...items];

        if (!items.length) break;
        if (allItems.length >= grandTotal) break;

        nextSkip += pageLimit;
      }

      const exportRows = allItems.map((item: any) => {
        const r = normalizeRow(item);
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
      XLSX.writeFile(wb, `retirados_semana_${week}_${tipo || "tipo"}_${tenantId}.xlsx`);
    } catch (e: any) {
      setErr(String(e?.message || e || "Error al descargar Excel"));
    } finally {
      setDownloading(false);
    }
  }, [tenantId, tipo, week, downloading, total, columns]);

  return (
    <IdLinensShell tenantId={tenantId} title="Retirados de inventario">
      <div className="px-4 md:px-6 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-neutral-900">
              Antigüedad (Retirados) — Semana {week}
            </div>
            <div className="text-sm text-neutral-700">{tipo}</div>
            <div className="text-xs text-neutral-500 mt-1">
              Mostrando {showingFrom}–{showingTo} • Filas en página: {rows.length} • Total: {total}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={downloading || loading || !total}
              onClick={downloadExcel}
            >
              {downloading ? "Descargando…" : "Descargar Excel"}
            </Button>

            <Button variant="outline" onClick={() => router.back()}>
              Regresar
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={!canPrev || loading}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>

            <Button
              variant="outline"
              disabled={!canNext || loading}
              onClick={() => setPageIndex((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-600">Filas:</span>
            <select
              className="h-9 rounded-md border bg-white px-2"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPageIndex(0);
              }}
              disabled={loading}
            >
              {[50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        {err ? <div className="text-sm text-red-600">{err}</div> : null}
        {loading ? <div className="text-sm opacity-70">Cargando…</div> : null}

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
              {computedRows.map((r: any, idx) => (
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

              {!computedRows.length && !loading ? (
                <tr>
                  <td className="p-3 opacity-70" colSpan={columns.length}>
                    Sin datos (en esta página).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-neutral-500">
          El Excel descarga el total detectado: {total}.
        </div>
      </div>
    </IdLinensShell>
  );
}