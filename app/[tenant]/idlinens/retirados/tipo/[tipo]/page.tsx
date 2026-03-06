// app/[tenant]/idlinens/retirados/tipo/[tipo]/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { fetchRetiradosDetail, type AnalysisDetailItem } from "@/components/idlinens/api";

type Params = { tenant?: string; tipo?: string };

function fmtDate(ms?: number | null) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleDateString("es-MX");
  } catch {
    return "—";
  }
}

function ageDays(createdAtMs?: number | null) {
  if (!createdAtMs) return 0;
  const now = Date.now();
  return Math.max(0, Math.floor((now - createdAtMs) / 86_400_000));
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
  const [err, setErr] = useState<string | null>(null);

  const limit = 200;
  const canLoadMore = rows.length < total;

  const loadPage = useCallback(
    async (nextSkip: number, append: boolean) => {
      const r = await fetchRetiradosDetail(tenantId, {
        mode: "tipo",
        tipo,
        limit,
        skip: nextSkip,

        // opcional (no rompe si server lo ignora)
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
    // orden opcional (más reciente primero si hay createdAtMs)
    const arr = Array.isArray(rows) ? [...rows] : [];
    arr.sort((a, b) => Number(b?.createdAtMs ?? 0) - Number(a?.createdAtMs ?? 0));
    return arr.map((r) => ({
      ...r,
      _ageDays: ageDays(r.createdAtMs ?? null),
      _cycles: Number(r.ciclosLavado ?? 0) || 0,
    }));
  }, [rows]);

  return (
    <IdLinensShell tenantId={tenantId} title="Retirados de inventario">
      <div className="px-4 md:px-6 py-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
          <button
            type="button"
            onClick={() => router.push(`/${tenantId}/idlinens/retirados`)}
            className="rounded-md px-2 py-1 hover:bg-neutral-100"
          >
            ← Volver
          </button>

          <span>·</span>
          <span className="text-neutral-900">Tipo: {tipo || "—"}</span>
          <span className="text-neutral-500">
            (mostrando {rows.length} de {total})
          </span>
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
            {/* ✅ TABLA INLINE (como análisis) */}
            <div className="rounded-2xl border bg-white overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white shadow-sm">
                  <tr>
                    <th className="p-3 text-left">EPC</th>
                    <th className="p-3 text-left">Tipo</th>
                    <th className="p-3 text-left">Ubicación</th>
                    <th className="p-3 text-left">Estado</th>
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
                      <td className="p-3">{String(r.status || "—")}</td>
                      <td className="p-3">{fmtDate(r.createdAtMs ?? null)}</td>
                      <td className="p-3">{Number(r._ageDays || 0)} días</td>
                      <td className="p-3">{Number(r._cycles || 0)}</td>
                    </tr>
                  ))}

                  {!computedRows.length ? (
                    <tr>
                      <td className="p-3 opacity-70" colSpan={7}>
                        Sin datos.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-neutral-500">Paginado para abrir rápido.</div>
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