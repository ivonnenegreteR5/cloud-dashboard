// app/[tenant]/idlinens/retirados/page.tsx
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
  ResponsiveContainer,
} from "recharts";

import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { fetchRetiradosSummary } from "@/components/idlinens/api";

type Params = { tenant?: string; tenantId?: string };

function trunc(s: string, max = 18) {
  const t = String(s || "");
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload?.[0]?.value ?? 0;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow">
      <div className="font-medium">{String(label || "")}</div>
      <div className="opacity-80">{v}</div>
    </div>
  );
}

function calcChartWidth(count: number, pxPerBar = 34, min = 680) {
  return Math.max(min, count * pxPerBar);
}

export default function RetiradosPage() {
  const router = useRouter();
  const params = useParams<Params>();
  const tenantId = String(params?.tenantId || params?.tenant || "").trim();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [summary, setSummary] = useState<{
    totalesByType: Array<{ tipo: string; count: number }>;
    avgCyclesByType: Array<{ tipo: string; avgCycles: number; count: number }>;
    ageByWeek: Array<{ week: number; count: number }>;
    meta?: any;
  }>({
    totalesByType: [],
    avgCyclesByType: [],
    ageByWeek: [],
  });

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        if (!tenantId) throw new Error("No tenantId en la ruta.");

        const s = await fetchRetiradosSummary(tenantId, {
          ttlSeconds: 60,
          maxScan: 50_000,
          pageSize: 1000,
        });

        if (!alive) return;

        setSummary({
          totalesByType: s.totalesByType || [],
          avgCyclesByType: s.avgCyclesByType || [],
          ageByWeek: s.ageByWeek || [],
          meta: s.meta,
        });
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error cargando retirados");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [tenantId]);

  // 1) Totales por tipo
  const totales = useMemo(() => {
    return (summary.totalesByType || [])
      .map((x) => ({ tipo: String(x?.tipo ?? "").trim(), value: Number(x?.count ?? 0) }))
      .filter((x) => x.tipo && x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [summary.totalesByType]);

  // 2) Antigüedad por semana
  const porSemana = useMemo(() => {
    return (summary.ageByWeek || [])
      .map((x) => ({ week: Number(x?.week ?? 1), value: Number(x?.count ?? 0) }))
      .filter((x) => Number.isFinite(x.week) && x.week >= 1 && x.value > 0)
      .sort((a, b) => a.week - b.week);
  }, [summary.ageByWeek]);

  // 3) Promedio de ciclos por tipo
  const ciclosProm = useMemo(() => {
    return (summary.avgCyclesByType || [])
      .map((x) => ({ tipo: String(x?.tipo ?? "").trim(), value: Number(x?.avgCycles ?? 0) }))
      .filter((x) => x.tipo && Number.isFinite(x.value))
      .sort((a, b) => b.value - a.value);
  }, [summary.avgCyclesByType]);

  const axisTick = { fontSize: 10, fill: "#525252" };

  const wTot = calcChartWidth(totales.length);
  const wCic = calcChartWidth(ciclosProm.length);

  const goTipo = (tipo: string) => {
    const t = String(tipo || "").trim();
    if (!t) return;
    router.push(`/${tenantId}/idlinens/retirados/tipo/${encodeURIComponent(t)}`);
  };

  const goSemana = (week: number) => {
    const w = Number(week);
    if (!Number.isFinite(w) || w < 1) return;
    // ✅ TU RUTA REAL (por carpeta)
    router.push(`/${tenantId}/idlinens/retirados/antiguedad/semana/${w}`);
  };

  const goCyclesTipo = (tipo: string) => {
    const t = String(tipo || "").trim();
    if (!t) return;
    router.push(`/${tenantId}/idlinens/retirados/cycles/tipo/${encodeURIComponent(t)}`);
  };

  return (
    <IdLinensShell tenantId={tenantId} title="Retirados de inventario">
      <div className="px-4 md:px-6 py-4 space-y-4">
        {err ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Error: {err}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border bg-white p-6 text-sm text-neutral-600">
            Cargando…
          </div>
        ) : null}

        {!loading && summary?.meta ? (
          <div className="text-[12px] text-neutral-500">
        
            {summary.meta?.truncated ? " • truncated" : ""}
          </div>
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* 1) Totales por categoría */}
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-neutral-900">
              Totales de retirados por categoría
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Solo prendas con ubicación: <b>Blancos Retirados</b>
            </div>

            <div className="mt-3 h-[320px] overflow-x-auto">
              <div style={{ width: wTot, height: 320 }}>
                <BarChart
                  width={wTot}
                  height={320}
                  data={totales}
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
                  <Bar dataKey="value">
                    {totales.map((row, idx) => (
                      <Cell
                        key={idx}
                        className="cursor-pointer"
                        fill="#111827"
                        onClick={() => goTipo(row.tipo)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </div>
            </div>

            <div className="mt-2 text-xs text-neutral-500">
              Click en una barra = ver lista de prendas retiradas de esa categoría.
            </div>
          </div>

          {/* 2) Antigüedad por semana */}
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-neutral-900">
              Antigüedad (semanas desde creación)
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Click en semana = ver categorías dentro de esa semana.
            </div>

            <div className="mt-3 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porSemana} margin={{ top: 12, right: 16, left: 0, bottom: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" tick={axisTick} tickFormatter={(v) => `Sem ${String(v)}`} />
                  <YAxis tick={axisTick} />
                  <Tooltip content={<TooltipBox />} />
                  <Bar dataKey="value">
                    {porSemana.map((row, idx) => (
                      <Cell
                        key={idx}
                        className="cursor-pointer"
                        fill="#3B82F6"
                        onClick={() => goSemana(row.week)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3) Promedio ciclos por categoría */}
          <div className="rounded-2xl border bg-white p-4 xl:col-span-2">
            <div className="text-sm font-medium text-neutral-900">
              Promedio de lavados por categoría (ciclos)
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Click en categoría = ver lista de prendas retiradas (ordenadas por ciclos).
            </div>

            <div className="mt-3 h-[320px] overflow-x-auto">
              <div style={{ width: wCic, height: 320 }}>
                <BarChart
                  width={wCic}
                  height={320}
                  data={ciclosProm}
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
                  <Bar dataKey="value">
                    {ciclosProm.map((row, idx) => (
                      <Cell
                        key={idx}
                        className="cursor-pointer"
                        fill="#10B981"
                        onClick={() => goCyclesTipo(row.tipo)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </div>
            </div>
          </div>
        </div>
      </div>
    </IdLinensShell>
  );
}