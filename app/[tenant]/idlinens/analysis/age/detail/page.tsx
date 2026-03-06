// app/[tenant]/idlinens/analysis/age/detail/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { fetchAnalysisDetail, type AnalysisDetailItem } from "@/components/idlinens/api";
import { Button } from "@/components/ui/button";

type Params = { tenant?: string; tenantId?: string };

function fmtDate(ms?: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("es-MX");
}

function toAgeDays(createdAtMs?: number | null) {
  if (!createdAtMs) return 0;
  const now = Date.now();
  return Math.max(0, Math.floor((now - createdAtMs) / 86_400_000));
}

export default function AnalysisAgeDetailPage() {
  const router = useRouter();
  const params = useParams<Params>();
  const search = useSearchParams();

  const tenantId = String(params?.tenantId || params?.tenant || "").trim();
  const week = Number(search.get("week") || 0);
  const tipo = String(search.get("tipo") || "").trim();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<AnalysisDetailItem[]>([]);
  const [total, setTotal] = useState(0);

  const [pageSize, setPageSize] = useState(200);
  const [pageIndex, setPageIndex] = useState(0);

  const skip = pageIndex * pageSize;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        if (!tenantId) throw new Error("No tenantId.");
        if (!week) throw new Error("Falta ?week=...");
        if (!tipo) throw new Error("Falta ?tipo=...");

        // ✅ CLAVE: mode=ageTipo (filtra en server, paginación correcta)
        const resp = await fetchAnalysisDetail(tenantId, {
          mode: "ageTipo",
          week,
          tipo,
          limit: pageSize,
          skip,

          // opcional: por si no hay cache aún
          ttlSeconds: 60,
          maxScan: 50000,
          pageSize: 1000,
        });

        if (!alive) return;
        setRows(resp.items || []);
        setTotal(Number(resp.total || 0));
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error");
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
    return rows.map((r) => ({
      ...r,
      antiguedadDias: toAgeDays(r.createdAtMs ?? null),
    }));
  }, [rows]);

  return (
    <IdLinensShell tenantId={tenantId} title="Distribución de prendas">
      <div className="px-4 md:px-6 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-neutral-900">
              Antigüedad — Semana {week}
            </div>
            <div className="text-sm text-neutral-700">{tipo}</div>
            <div className="text-xs text-neutral-500 mt-1">
              Mostrando {showingFrom}–{showingTo} • Filas en página: {rows.length} • Total: {total}
            </div>
          </div>

          <Button variant="outline" onClick={() => router.back()}>
            Regresar
          </Button>
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
                setPageIndex(0); // ✅ reinicia al cambiar tamaño
              }}
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
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white shadow-sm">
              <tr>
                <th className="p-3 text-left">EPC</th>
                <th className="p-3 text-left">Ubicación</th>
                <th className="p-3 text-left">Creado</th>
                <th className="p-3 text-left">Antigüedad</th>
              </tr>
            </thead>
            <tbody>
              {computedRows.map((r, idx) => (
                <tr key={(r._id || r.tag || idx) + ""} className="border-t hover:bg-neutral-50">
                  <td className="p-3 font-mono text-[12px]">{String(r.tag || "—")}</td>
                  <td className="p-3">{String(r.location || "—")}</td>
                  <td className="p-3">{fmtDate(r.createdAtMs ?? null)}</td>
                  <td className="p-3">{(r as any).antiguedadDias} días</td>
                </tr>
              ))}

              {!computedRows.length && !loading ? (
                <tr>
                  <td className="p-3 opacity-70" colSpan={4}>
                    Sin datos (en esta página).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* ✅ ya no hace falta la nota de "no existe endpoint" porque ya existe (ageTipo) */}
      </div>
    </IdLinensShell>
  );
}