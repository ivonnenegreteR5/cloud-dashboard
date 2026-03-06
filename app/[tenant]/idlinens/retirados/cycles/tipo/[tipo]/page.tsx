"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { fetchRetiradosDetail, type AnalysisDetailItem } from "@/components/idlinens/api";

type Params = { tenant?: string; tenantId?: string; tipo?: string };

function fmtDate(ms?: number | null) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleDateString("es-MX");
  } catch {
    return "—";
  }
}

function toAgeDays(createdAtMs?: number | null) {
  if (!createdAtMs) return 0;
  const now = Date.now();
  return Math.max(0, Math.floor((now - createdAtMs) / 86_400_000));
}

export default function RetiradosCyclesTipoPage() {
  const router = useRouter();
  const params = useParams<Params>();

  const tenantId = String(params?.tenantId || params?.tenant || "").trim();

  const tipo = useMemo(() => {
    const raw = String(params?.tipo || "");
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [params?.tipo]);

  const [rows, setRows] = useState<AnalysisDetailItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState(200);
  const [pageIndex, setPageIndex] = useState(0);
  const skip = pageIndex * pageSize;

  const canPrev = pageIndex > 0;
  const canNext = skip + pageSize < total;

  useEffect(() => {
    if (!tenantId || !tipo) return;

    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const r = await fetchRetiradosDetail(tenantId, {
          mode: "cyclesTipo", // ✅ correcto
          tipo,
          limit: pageSize,
          skip,
          ttlSeconds: 60,
          maxScan: 50_000,
          pageSize: 1000,
        });

        if (!alive) return;
        setRows(r.items || []);
        setTotal(Number(r.total || 0));
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || e));
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
  }, [tenantId, tipo, pageSize, skip]);

  const showingFrom = total ? skip + 1 : 0;
  const showingTo = Math.min(skip + rows.length, total);

  const computedRows = useMemo(() => {
    // opcional: ordenar por ciclos desc (por si el server no lo hace)
    const arr = Array.isArray(rows) ? [...rows] : [];
    arr.sort((a: any, b: any) => Number(b?.ciclosLavado ?? 0) - Number(a?.ciclosLavado ?? 0));
    return arr.map((r) => ({
      ...r,
      antiguedadDias: toAgeDays(r.createdAtMs ?? null),
    }));
  }, [rows]);

  return (
    <IdLinensShell tenantId={tenantId} title="Retirados de inventario">
      <div className="px-4 md:px-6 py-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
          <button
            type="button"
            onClick={() => router.push(`/${tenantId}/idlinens/retirados/cycles`)}
            className="rounded-md px-2 py-1 hover:bg-neutral-100"
          >
            ← Volver
          </button>
          <span>·</span>
          <span className="text-neutral-900">Ciclos — Tipo: {tipo}</span>
          <span className="text-neutral-500">
            Mostrando {showingFrom}–{showingTo} • Total {total}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              className="h-9 rounded-md border bg-white px-3 text-sm disabled:opacity-50"
              disabled={!canPrev || loading}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            >
              Anterior
            </button>
            <button
              className="h-9 rounded-md border bg-white px-3 text-sm disabled:opacity-50"
              disabled={!canNext || loading}
              onClick={() => setPageIndex((p) => p + 1)}
            >
              Siguiente
            </button>
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
          <div className="rounded-2xl border bg-white overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white shadow-sm">
                <tr>
                  <th className="p-3 text-left">EPC</th>
                  <th className="p-3 text-left">Tipo</th>
                  <th className="p-3 text-left">Ubicación</th>
                  <th className="p-3 text-left">Creado</th>
                  <th className="p-3 text-left">Antigüedad</th>
                  <th className="p-3 text-left">Ciclos</th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((r: any, idx: number) => (
                  <tr key={(r._id || r.tag || idx) + ""} className="border-t hover:bg-neutral-50">
                    <td className="p-3 font-mono text-[12px]">{String(r.tag || "—")}</td>
                    <td className="p-3">{String(r.tipo || "—")}</td>
                    <td className="p-3">{String(r.location || "—")}</td>
                    <td className="p-3">{fmtDate(r.createdAtMs ?? null)}</td>
                    <td className="p-3">{(r as any).antiguedadDias} días</td>
                    <td className="p-3">{Number(r.ciclosLavado ?? 0) || 0}</td>
                  </tr>
                ))}

                {!computedRows.length ? (
                  <tr>
                    <td className="p-3 opacity-70" colSpan={6}>
                      Sin datos (en esta página).
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </IdLinensShell>
  );
}