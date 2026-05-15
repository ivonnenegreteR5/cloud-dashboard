// components/idlinens/LavanderiaDashboard.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  fetchResumenTipos,
  fetchDetallePage,
  type DetalleRow,
  type TipoResumen,
} from "@/components/idlinens/api";
import { LavanderiaTable } from "@/components/idlinens/LavanderiaTable";

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  const s = nums.reduce((a, b) => a + b, 0);
  return s / nums.length;
}

function parseDateValue(s: string): number {
  const t = String(s || "").trim();
  if (!t) return 0;
  const iso = Date.parse(t);
  if (Number.isFinite(iso)) return iso;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    const d = new Date(Date.UTC(yy, mm - 1, dd));
    return d.getTime();
  }
  return 0;
}

type AvgRow = { tipo: string; avgDias: number };

export function LavanderiaDashboard({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const tableRef = useRef<HTMLDivElement | null>(null);

  const [loadingTipos, setLoadingTipos] = useState(true);
  const [tipos, setTipos] = useState<TipoResumen[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // Tabla
  const [selectedTipo, setSelectedTipo] = useState<string>("");
  const [rows, setRows] = useState<DetalleRow[]>([]);
  const [baseRows, setBaseRows] = useState<DetalleRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Promedio días (por tipo)
  const [avgData, setAvgData] = useState<AvgRow[]>([]);
  const [loadingAvg, setLoadingAvg] = useState(false);

  const canLoadMore = useMemo(() => rows.length < total, [rows.length, total]);

  function scrollToTable() {
    requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* =========================================================
     1) TIPOS (GRÁFICA DE CONTEO) - CARGA INDEPENDIENTE
     ========================================================= */
  useEffect(() => {
    let alive = true;

    async function loadTipos() {
      try {
        setLoadingTipos(true);
        setErr(null);
        setTipos([]);
        setAvgData([]); // igual que antes: limpia promedio al cambiar tenant

        const t = await fetchResumenTipos(tenantId, "lavanderia");
        if (!alive) return;
        setTipos(t);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error cargando inventario en lavandería");
      } finally {
        if (!alive) return;
        setLoadingTipos(false);
      }
    }

    loadTipos();
    return () => {
      alive = false;
    };
  }, [tenantId]);

  /* =========================================================
     2) PROMEDIO (GRÁFICA DE AVG) - CARGA INDEPENDIENTE
        Depende de "tipos", pero NO depende de la tabla.
     ========================================================= */
  useEffect(() => {
    let alive = true;

    async function loadAvg() {
      try {
        setLoadingAvg(true);
        setErr(null);

        const topForAvg = tipos.slice(0, 18);
        const avgRows = await Promise.all(
          topForAvg.map(async (x) => {
            const page = await fetchDetallePage(
              tenantId,
              "lavanderia",
              x.tipo,
              300,
              0,
              tipos // ✅ AQUI: para resolver rawTipo correctamente
            );
            const dias = page.rows
              .map((r) => toNum(r.diasLavanderia))
              .filter((n) => n >= 0);
            return { tipo: x.tipo, avgDias: avg(dias) };
          })
        );

        if (!alive) return;
        setAvgData(
          avgRows
            .map((r) => ({ ...r, avgDias: Number(r.avgDias.toFixed(2)) }))
            .sort((a, b) => b.avgDias - a.avgDias)
        );
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error calculando promedio");
      } finally {
        if (!alive) return;
        setLoadingAvg(false);
      }
    }

    if (tipos.length) loadAvg();

    return () => {
      alive = false;
    };
  }, [tipos, tenantId]);

  /* =========================================================
     3) TABLA (MUESTRA RÁPIDA) - CARGA INDEPENDIENTE
        Depende de "tipos", pero NO bloquea las gráficas.
     ========================================================= */
  useEffect(() => {
    let alive = true;

    async function loadTableSeed() {
      try {
        setLoadingRows(true);
        setErr(null);

        const seedTipos = tipos.slice(0, 8);
        if (!seedTipos.length) return;

        const pages = await Promise.all(
          seedTipos.map((x) =>
            fetchDetallePage(
              tenantId,
              "lavanderia",
              x.tipo,
              40,
              0,
              tipos // ✅ AQUI: para resolver rawTipo correctamente
            ).catch(() => ({
              rows: [] as DetalleRow[],
              total: 0,
              limit: 40,
              skip: 0,
            }))
          )
        );

        if (!alive) return;

        const merged = pages.flatMap((p) => p.rows);
        merged.sort(
          (a, b) =>
            parseDateValue(b.vistoUltimaVez) - parseDateValue(a.vistoUltimaVez)
        );

        setBaseRows(merged);
        setRows(merged);
        setTotal(merged.length);
        setSelectedTipo("");
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error cargando tabla");
      } finally {
        if (!alive) return;
        setLoadingRows(false);
      }
    }

    if (tipos.length) loadTableSeed();

    return () => {
      alive = false;
    };
  }, [tipos, tenantId]);

  async function loadTipo(tipo: string) {
    setSelectedTipo(tipo);
    setRows([]);
    setTotal(0);
    setErr(null);
    setLoadingRows(true);

    try {
      const page = await fetchDetallePage(
        tenantId,
        "lavanderia",
        tipo,
        200,
        0,
        tipos // ✅ AQUI: para resolver rawTipo (BAÑO vs BANO)
      );
      setRows(page.rows);
      setTotal(page.total);
      scrollToTable();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoadingRows(false);
    }
  }

  async function loadMore() {
    if (loadingMore || !canLoadMore || !selectedTipo) return;
    setLoadingMore(true);
    try {
      const page = await fetchDetallePage(
        tenantId,
        "lavanderia",
        selectedTipo,
        200,
        rows.length,
        tipos // ✅ AQUI: para que el paginado siga consultando con rawTipo correcto
      );
      setRows((p) => [...p, ...page.rows]);
      setTotal(page.total);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-neutral-600">
        <button
          type="button"
          onClick={() => router.push("./")}
          className="rounded-md px-1 py-0.5 hover:bg-neutral-100 focus:outline-none focus-visible:outline-none"
        >
          Inventario en Lavandería
        </button>
        <span>›</span>
        <span className="text-neutral-900">
          {selectedTipo ? `Tipo: ${selectedTipo}` : "Lista de Blancos en Lavandería"}
        </span>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error: {err}
        </div>
      )}

      {/* ✅ Tabla principal arriba (como tu imagen) */}
     <div ref={tableRef} className="min-w-0 w-full max-w-full overflow-hidden rounded-lg border bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-base font-semibold">Lista de Blancos en Lavandería</div>
          <div className="flex items-center gap-2">
            {selectedTipo && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTipo("");
                  setRows(baseRows);
                  setTotal(baseRows.length);
                }}
                className="rounded-md border px-2 py-1 text-sm hover:bg-neutral-50"
              >
                Quitar filtro
              </button>
            )}
          </div>
        </div>

        {loadingRows ? (
          <div className="p-6 text-sm text-neutral-600">Cargando tabla…</div>
        ) : (
          <>
            <LavanderiaTable rows={rows} />

            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-neutral-500">
                {selectedTipo
                  ? `${rows.length}${total ? ` / ${total}` : ""}`
                  : `${rows.length}.  `}
              </div>
              {selectedTipo ? (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={!canLoadMore || loadingMore}
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50 hover:bg-neutral-50"
                >
                  {loadingMore ? "Cargando…" : canLoadMore ? "Cargar más" : "Fin"}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* ✅ Gráficas abajo */}
      <div className={cx("grid grid-cols-1 gap-4 lg:grid-cols-2", "items-start")}>
        {/* Conteo por tipo */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-2 text-base font-semibold">
            Blancos por Categoría en Lavandería
          </div>

          {loadingTipos ? (
            <div className="p-6 text-sm text-neutral-600">Cargando…</div>
          ) : (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={tipos}
                  margin={{ top: 10, right: 10, left: 10, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="tipo"
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    minPointSize={4}
                    className="cursor-pointer"
                    onClick={(payload: any) => {
                      const tipo = payload?.tipo as string | undefined;
                      if (!tipo) return;
                      loadTipo(tipo);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-2 text-xs text-neutral-500">
            Toca una barra para ver la lista de esa prenda.
          </div>
        </div>

        {/* Promedio de días */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-2 text-base font-semibold">Promedio de Días en Lavandería</div>

          {loadingAvg ? (
            <div className="p-6 text-sm text-neutral-600">Calculando…</div>
          ) : (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
           <BarChart
  data={avgData}
  margin={{ top: 10, right: 10, left: 10, bottom: 60 }}
>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis
    dataKey="tipo"
    interval={0}
    angle={-45}
    textAnchor="end"
    height={70}
    tick={{ fontSize: 11 }}
  />
  <YAxis />

  <Tooltip
    formatter={(value) => [`${value}`, "Días"]}
  />

  <Bar dataKey="avgDias" minPointSize={3} />
</BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-2 text-xs text-neutral-500">
            Calculado con los assets que siguen en <span className="font-medium">Status: out</span> (aún no regresan con{" "}
            <span className="font-medium">Status: in</span>).
          </div>
        </div>
      </div>
    </div>
  );
}
