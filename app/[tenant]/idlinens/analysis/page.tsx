// app/[tenant]/idlinens/analysis/page.tsx
// app/[tenant]/idlinens/analysis/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { fetchAnalysisSummary } from "@/components/idlinens/api";

type Params = { tenant?: string; tenantId?: string };

function trunc(s: string, max = 16) {
  const t = String(s || "");
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow">
      <div className="font-medium">{String(label || "")}</div>
      <div className="opacity-80">{payload?.[0]?.value ?? 0}</div>
    </div>
  );
}

// ✅ helper para hacer chart “ancho” según cantidad de barras
function calcChartWidth(count: number, pxPerBar = 34, min = 640) {
  return Math.max(min, count * pxPerBar);
}

export default function AnalysisPage() {
  const router = useRouter();
  const params = useParams<Params>();
  const tenantId = String(params?.tenantId || params?.tenant || "").trim();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [summary, setSummary] = useState<{
    cyclesByType: Array<{ tipo: string; totalCycles: number }>;
    ageByWeek: Array<{ week: number; count: number }>;
    inactiveByType: Array<{ tipo: string; count: number }>;
    meta?: any;
  }>({
    cyclesByType: [],
    ageByWeek: [],
    inactiveByType: [],
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        if (!tenantId) throw new Error("No tenantId en la ruta.");

        const s = await fetchAnalysisSummary(tenantId, {
          ttlSeconds: 60,
          maxScan: 50_000,
          pageSize: 1000,
        });

        if (!alive) return;
        setSummary({
          cyclesByType: s.cyclesByType || [],
          ageByWeek: s.ageByWeek || [],
          inactiveByType: s.inactiveByType || [],
          meta: s.meta,
        });
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error cargando análisis");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [tenantId]);

  const ciclosPorTipo = useMemo(() => {
    return (summary.cyclesByType || [])
      .map((x) => ({
        tipo: String(x?.tipo ?? ""),
        value: Number(x?.totalCycles ?? 0),
      }))
      .filter((x) => x.tipo)
      .sort((a, b) => b.value - a.value);
  }, [summary.cyclesByType]);

  const antigPorSemana = useMemo(() => {
    return (summary.ageByWeek || [])
      .map((x) => ({ week: Number(x?.week ?? 1), count: Number(x?.count ?? 0) }))
      .filter((x) => Number.isFinite(x.week) && x.week >= 1)
      .sort((a, b) => a.week - b.week);
  }, [summary.ageByWeek]);

  const sinActividadPorTipo = useMemo(() => {
    return (summary.inactiveByType || [])
      .map((x) => ({ tipo: String(x?.tipo ?? ""), value: Number(x?.count ?? 0) }))
      .filter((x) => x.tipo)
      .sort((a, b) => b.value - a.value);
  }, [summary.inactiveByType]);

  const axisTick = { fontSize: 10, fill: "#525252" };

  const ciclosChartW = calcChartWidth(ciclosPorTipo.length);
  const inactiveChartW = calcChartWidth(sinActividadPorTipo.length);

  return (
    <IdLinensShell tenantId={tenantId} title="Análisis de prendas">
      <div className="px-4 md:px-6 py-4 space-y-4">
        {err ? <div className="text-sm text-red-600">{err}</div> : null}
        {loading ? <div className="text-sm opacity-70">Cargando…</div> : null}

        {!loading && summary?.meta ? (
          <div className="text-[12px] text-neutral-500">
            {summary.meta?.cacheHit ? "Cache" : "Fresh"} • scanned:{" "}
            {summary.meta?.scanned ?? "?"}
            {summary.meta?.truncated ? " • truncated" : ""}
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 1) Ciclos por categoría */}
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-neutral-900">
              Promedio de Ciclos de Lavado por Categoría
            </div>

            {/* ✅ scroll horizontal para muchas categorías */}
            <div className="mt-3 h-[320px] overflow-x-auto">
              <div style={{ width: ciclosChartW, height: 320 }}>
                <BarChart
                  width={ciclosChartW}
                  height={320}
                  data={ciclosPorTipo}
                  margin={{ top: 12, right: 16, left: 0, bottom: 85 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="tipo"
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={95}
                    tick={axisTick}
                    tickFormatter={(v) => trunc(String(v), 18)}
                  />
                  <YAxis tick={axisTick} />
                  <Tooltip content={<TooltipBox />} />
                  <Bar
                    dataKey="value"
                    onClick={(d: any) => {
                      const tipo = String(d?.tipo || "");
                      router.push(
                        `/${tenantId}/idlinens/analysis/cycles?tipo=${encodeURIComponent(tipo)}`
                      );
                    }}
                  >
                    {ciclosPorTipo.map((_, idx) => (
                      <Cell key={idx} className="cursor-pointer" fill="#10B981" />
                    ))}
                  </Bar>
                </BarChart>
              </div>
            </div>
          </div>

          {/* 2) Antigüedad por semana */}
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-neutral-900">
              Antigüedad por semana
            </div>

            <div className="mt-3 h-[320px]">
              {/* ✅ aquí normalmente son pocas barras, sin scroll */}
              <BarChart
                width={640}
                height={320}
                data={antigPorSemana}
                margin={{ top: 12, right: 16, left: 0, bottom: 18 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={axisTick} />
                <YAxis tick={axisTick} />
                <Tooltip content={<TooltipBox />} />
                <Bar
                  dataKey="count"
                  onClick={(d: any) => {
                    const week = Number(d?.week || 1);
                    router.push(`/${tenantId}/idlinens/analysis/age?week=${week}`);
                  }}
                >
                  {antigPorSemana.map((_, idx) => (
                    <Cell key={idx} className="cursor-pointer" fill="#2563EB" />
                  ))}
                </Bar>
              </BarChart>

              {!loading && antigPorSemana.length === 0 ? (
                <div className="mt-2 text-xs text-neutral-500">
                  No hay datos de antigüedad (revisa que el endpoint esté detectando CreatedAt/createdAt/creado).
                </div>
              ) : null}
            </div>
          </div>

          {/* 3) Sin actividad por categoría */}
          <div className="rounded-2xl border bg-white p-4 lg:col-span-1">
            <div className="text-sm font-medium text-neutral-900">
              Prendas sin actividad por categoría
            </div>

            {/* ✅ scroll horizontal para muchas categorías */}
            <div className="mt-3 h-[320px] overflow-x-auto">
              <div style={{ width: inactiveChartW, height: 320 }}>
                <BarChart
                  width={inactiveChartW}
                  height={320}
                  data={sinActividadPorTipo}
                  margin={{ top: 12, right: 16, left: 0, bottom: 85 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="tipo"
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={95}
                    tick={axisTick}
                    tickFormatter={(v) => trunc(String(v), 18)}
                  />
                  <YAxis tick={axisTick} />
                  <Tooltip content={<TooltipBox />} />
                  <Bar
                    dataKey="value"
                    onClick={(d: any) => {
                      const tipo = String(d?.tipo || "");
                      router.push(
                        `/${tenantId}/idlinens/analysis/inactive?tipo=${encodeURIComponent(tipo)}`
                      );
                    }}
                  >
                    {sinActividadPorTipo.map((_, idx) => (
                      <Cell key={idx} className="cursor-pointer" fill="#2563EB" />
                    ))}
                  </Bar>
                </BarChart>
              </div>
            </div>
          </div>

          <div className="hidden lg:block" />
        </div>
      </div>
    </IdLinensShell>
  );
}