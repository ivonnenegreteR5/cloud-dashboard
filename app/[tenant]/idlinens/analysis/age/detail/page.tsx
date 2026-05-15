 //app/[tenant]/idlinens/analysis/age/detail/page.tsx
"use client";

import * as XLSX from "xlsx";
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { fetchAnalysisDetail } from "@/components/idlinens/api";
import { Button } from "@/components/ui/button";

type Params = { tenant?: string; tenantId?: string };

type Row = {
  _id: string;
  tag: string;
  tipo: string;
  location: string;
  status: string;
  createdAtMs: number | null;
  lastSeenAtMs: number | null;
  employee: string;
  diasEnLavanderia: number | null;
  antiguedadDias: number | null;
  antiguedadSemanas: number | null;
};

type ColumnKey =
  | "tipo"
  | "tag"
  | "lastSeenAtMs"
  | "createdAtMs"
  | "antiguedadDias"
  | "antiguedadSemanas"
  | "diasEnLavanderia"
  | "location"
  | "status"
  | "employee";

type Column = {
  key: ColumnKey;
  label: string;
};

const DEFAULT_COLUMNS: Column[] = [
  { key: "tipo", label: "Tipo de blancos" },
  { key: "tag", label: "Número RFID" },
  { key: "lastSeenAtMs", label: "Visto por última vez" },
  { key: "createdAtMs", label: "Creado" },
  { key: "antiguedadDias", label: "Antigüedad en días" },
  { key: "antiguedadSemanas", label: "Antigüedad en semanas" },
  { key: "diasEnLavanderia", label: "Días en Lavandería" },
  { key: "location", label: "Ubicación" },
  { key: "status", label: "Estado" },
  { key: "employee", label: "Empleado" },
];

function pickStr(...vals: any[]) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s && s !== "undefined" && s !== "null") return s;
  }
  return "";
}

function pickNum(...vals: any[]) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeKey(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function isCheckOutStatus(v: unknown) {
  const s = normalizeKey(v);

  return (
    s === "out" ||
    s === "check out" ||
    s === "checked out" ||
    s === "salida"
  );
}

function toMs(...vals: any[]) {
  for (const v of vals) {
    if (v === null || v === undefined || v === "") continue;

    const n = Number(v);

    if (Number.isFinite(n) && n > 0) {
      return n > 9_999_999_999 ? n : n * 1000;
    }

    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }

  return null;
}

function formatDateTime(ms: number | null) {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString("es-MX", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function diffDaysFromNow(ms: number | null) {
  if (!ms) return null;
  const diff = Date.now() - ms;
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / 86_400_000);
}

function diffWeeksFromNow(ms: number | null) {
  const days = diffDaysFromNow(ms);
  if (days === null) return null;
  return Math.max(1, Math.floor(days / 7) + 1);
}

export default function AnalysisAgeDetailPage() {
  const router = useRouter();
  const params = useParams<Params>();
  const search = useSearchParams();

  const tenantId = String(params?.tenantId || params?.tenant || "").trim();
  const week = Math.max(1, Number(search.get("week") || 1));

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  const [limit, setLimit] = useState(100);
  const [skip, setSkip] = useState(0);

  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [dragKey, setDragKey] = useState<ColumnKey | null>(null);
  const [downloading, setDownloading] = useState(false);

  function mapRows(items: any[]): Row[] {
    return (items || [])
      .map((a: any) => {
        const createdAtMs = toMs(
          a?.createdAtMs,
          a?.createdAt,
          a?.Created,
          a?.CreatedAt,
          a?.created,
          a?.CreationDate,
          a?.custom?.Created,
          a?.custom?.createdAt,
          a?.custom?.CreatedAt
        );

        const lastSeenAtMs = toMs(
          a?.lastSeenAtMs,
          a?.lastSeenAt,
          a?.LastSeen,
          a?.LastSeenAt,
          a?.lastSeen,
          a?.last_seen_at,
          a?.lastSeenDate,
          a?.LastSeenDate,
          a?.vistoUltimaVez,
          a?.updatedAtMs,
          a?.updatedAt,
          a?.UpdatedAt,
          a?.custom?.LastSeen,
          a?.custom?.lastSeen,
          a?.custom?.LastSeenAt,
          a?.custom?.lastSeenAt
        );

        const status = pickStr(a?.status, a?.Status, a?.estado);

        const antiguedadDias =
          typeof a?.antiguedadDias === "number"
            ? a.antiguedadDias
            : diffDaysFromNow(createdAtMs);

        const antiguedadSemanas =
          typeof a?.antiguedadSemanas === "number"
            ? a.antiguedadSemanas
            : diffWeeksFromNow(createdAtMs);

        const diasLavanderiaRaw = pickNum(
          a?.diasEnLavanderia,
          a?.diasLavanderia,
          a?.DaysInLaundry,
          a?.daysInLaundry
        );

        const diasDesdeLastSeen = diffDaysFromNow(lastSeenAtMs);

        const diasEnLavanderia = isCheckOutStatus(status)
          ? diasDesdeLastSeen ?? diasLavanderiaRaw ?? 0
          : diasLavanderiaRaw ?? 0;

        return {
          _id: pickStr(a?._id, a?.id, a?.tag),
          tag: pickStr(a?.tag, a?.AssetTag, a?._id, a?.id),
          tipo: pickStr(a?.tipo, a?.AssetType, a?.type),
          location: pickStr(a?.location, a?.Location, a?.ubicacion),
          status,
          createdAtMs,
          lastSeenAtMs,
          employee: pickStr(
            a?.employee,
            a?.Employee,
            a?.empleado,
            a?.Empleado,
            a?.PersonnelName,
            a?.personnelName,
            a?.x_employee,
            a?.lastCheckOutBy,
            a?.lastCheckInBy,
            a?.assignedTo,
            a?.AssignedTo
          ),
          diasEnLavanderia,
          antiguedadDias,
          antiguedadSemanas,
        };
      })
      .filter((r) => Number(r.antiguedadSemanas || 0) === week)
      .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
  }

  useEffect(() => {
    setSkip(0);
  }, [week]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        if (!tenantId) throw new Error("No tenantId.");

        const res = await fetchAnalysisDetail(tenantId, {
          mode: "age",
          week,
          limit,
          skip,
        });

        if (!alive) return;

        const mapped = mapRows(res.items || []);

        setRows(mapped);
        setTotalRows(Math.max(Number(res.total ?? 0), mapped.length));
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error");
        setRows([]);
        setTotalRows(0);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [tenantId, week, limit, skip]);

  const count = useMemo(() => totalRows || rows.length, [totalRows, rows.length]);

  const canPrev = skip > 0;
  const canNext = skip + limit < totalRows;

  const showingFrom = totalRows > 0 ? skip + 1 : 0;
  const showingTo = totalRows > 0 ? Math.min(skip + limit, totalRows) : 0;

  function moveColumn(fromKey: ColumnKey, toKey: ColumnKey) {
    if (fromKey === toKey) return;

    setColumns((prev) => {
      const next = [...prev];
      const fromIndex = next.findIndex((c) => c.key === fromKey);
      const toIndex = next.findIndex((c) => c.key === toKey);

      if (fromIndex < 0 || toIndex < 0) return prev;

      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      return next;
    });
  }

  function getCellValue(row: Row, key: ColumnKey) {
    switch (key) {
      case "tipo":
        return row.tipo || "—";
      case "tag":
        return row.tag || "—";
      case "lastSeenAtMs":
        return formatDateTime(row.lastSeenAtMs);
      case "createdAtMs":
        return formatDateTime(row.createdAtMs);
      case "antiguedadDias":
        return row.antiguedadDias ?? diffDaysFromNow(row.createdAtMs) ?? "—";
      case "antiguedadSemanas":
        return row.antiguedadSemanas ?? diffWeeksFromNow(row.createdAtMs) ?? "—";
      case "diasEnLavanderia":
        return row.diasEnLavanderia ?? "—";
      case "location":
        return row.location || "—";
      case "status":
        return row.status || "—";
      case "employee":
        return row.employee || "—";
      default:
        return "—";
    }
  }

  async function downloadExcel() {
    try {
      setDownloading(true);

      const pageSize = 1000;
      let all: Row[] = [];
      let currentSkip = 0;
      let total = totalRows || 0;

      while (true) {
        const res = await fetchAnalysisDetail(tenantId, {
          mode: "age",
          week,
          limit: pageSize,
          skip: currentSkip,
        });

        const mapped = mapRows(res.items || []);
        all = [...all, ...mapped];

        total = Number(res.total ?? total);

        if (!res.items?.length) break;
        if (all.length >= total) break;
        if ((res.items || []).length < pageSize) break;

        currentSkip += pageSize;
      }

      const data = all.map((row) => {
        const obj: Record<string, any> = {};

        columns.forEach((col) => {
          obj[col.label] = getCellValue(row, col.key);
        });

        return obj;
      });

      const worksheet = XLSX.utils.json_to_sheet(data);

      worksheet["!cols"] = columns.map((col) => ({
        wch:
          col.key === "tag"
            ? 30
            : col.key === "lastSeenAtMs" || col.key === "createdAtMs"
            ? 24
            : col.key === "tipo"
            ? 24
            : 22,
      }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Antiguedad");

      XLSX.writeFile(workbook, `antiguedad_semana_${week}.xlsx`);
    } catch (e: any) {
      setErr(e?.message || "Error descargando Excel");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <IdLinensShell tenantId={tenantId} title="Análisis de prendas">
      <div className="space-y-4 px-4 py-4 md:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-neutral-900">
              Antigüedad por semana
            </div>
            <div className="text-sm text-neutral-600">Semana {week}</div>
            <div className="mt-1 text-xs text-neutral-500">
              Prendas visibles: {rows.length} • Total semana: {count}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={downloadExcel}
              disabled={downloading || !totalRows}
            >
              {downloading ? "Descargando…" : "Descargar Excel"}
            </Button>

            <Button variant="outline" onClick={() => router.back()}>
              Regresar
            </Button>
          </div>
        </div>

        {err ? <div className="text-sm text-red-600">{err}</div> : null}
        {loading ? <div className="text-sm opacity-70">Cargando…</div> : null}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="text-neutral-600">
            Mostrando {showingFrom}–{showingTo}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={!canPrev || loading}
              onClick={() => setSkip((s) => Math.max(0, s - limit))}
            >
              Anterior
            </Button>

            <Button
              variant="outline"
              disabled={!canNext || loading}
              onClick={() => setSkip((s) => s + limit)}
            >
              Siguiente
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-neutral-600">Filas:</span>
            <select
              className="h-9 rounded-md border bg-white px-2 text-sm"
              value={limit}
              onChange={(e) => {
                setSkip(0);
                setLimit(Number(e.target.value));
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

        <div className="w-full overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full min-w-[1500px] border-collapse text-sm">
            <thead className="bg-neutral-50">
              <tr className="border-b">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    draggable
                    onDragStart={() => setDragKey(col.key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragKey) moveColumn(dragKey, col.key);
                      setDragKey(null);
                    }}
                    onDragEnd={() => setDragKey(null)}
                    className="whitespace-nowrap px-4 py-3 text-left text-[13px] font-semibold text-neutral-700"
                  >
                    <div className="flex items-center gap-2">
                      <span className="cursor-grab select-none text-xs text-neutral-400 active:cursor-grabbing">
                        ⋮⋮
                      </span>
                      <span>{col.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr
                  key={r._id + "|" + r.tag}
                  className="border-b last:border-b-0 hover:bg-neutral-50"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`whitespace-nowrap px-4 py-3 text-[13px] text-neutral-900 ${
                        col.key === "tag" ? "font-mono text-[12px]" : ""
                      }`}
                    >
                      {col.key === "status" ? (
                        <span className="inline-flex rounded-full border bg-white px-3 py-1 text-xs font-medium text-neutral-700">
                          {getCellValue(r, col.key)}
                        </span>
                      ) : (
                        getCellValue(r, col.key)
                      )}
                    </td>
                  ))}
                </tr>
              ))}

              {!rows.length && !loading ? (
                <tr>
                  <td
                    className="px-4 py-3 text-sm opacity-70"
                    colSpan={columns.length}
                  >
                    Sin datos.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </IdLinensShell>
  );
}