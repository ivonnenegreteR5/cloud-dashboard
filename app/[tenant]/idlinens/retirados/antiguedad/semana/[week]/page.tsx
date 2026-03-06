// app/[tenant]/idlinens/retirados/antiguedad/semana/[week]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { fetchRetiradosDetail } from "@/components/idlinens/api";

function trunc(s: string, max = 18) {
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

function calcChartWidth(count: number, pxPerBar = 34, min = 680) {
  return Math.max(min, count * pxPerBar);
}

export default function RetiradosSemanaPage() {
  const router = useRouter();
  const params = useParams<{ tenant?: string; week?: string }>();

  const tenantId = String(params?.tenant || "").trim();
  const week = Number(params?.week || 0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Array<{ tipo: string; value: number }>>([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        if (!tenantId) throw new Error("Tenant inválido.");
        if (!Number.isFinite(week) || week < 1) throw new Error("Semana inválida.");

        const r = await fetchRetiradosDetail(tenantId, {
          // ⚠️ Si tu RetiradosDetailMode no incluye "ageWeekTipos",
          // cámbialo por el que tengas en api.ts (por ejemplo: "ageWeekTipo" o "ageWeekTypes").
          mode: "ageWeekTipos" as any,
          week,
          limit: 9999,
          skip: 0,
          ttlSeconds: 60,
          maxScan: 50_000,
          pageSize: 1000,
        });

        if (!alive) return;

        const mapped = (r.items || [])
          .map((x: any) => ({
            tipo: String(x?.tipo || "").trim(),
            value: Number(x?.count || x?.value || 0),
          }))
          .filter((x: any) => x.tipo && Number.isFinite(x.value) && x.value > 0)
          .sort((a: any, b: any) => b.value - a.value);

        setData(mapped);
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || e));
        setData([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [tenantId, week]);

  const w = useMemo(() => calcChartWidth(data.length), [data.length]);
  const axisTick = { fontSize: 10, fill: "#525252" };

  const goTipo = (tipo: string) => {
    const t = String(tipo || "").trim();
    if (!t) return;

    router.push(
      `/${tenantId}/idlinens/retirados/antiguedad/semana/${week}/tipo/${encodeURIComponent(t)}`
    );
  };

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
          <span className="text-neutral-900">Semana: {week}</span>
          <span className="text-neutral-500">(click en tipo para ver lista)</span>
        </div>

        {err ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Error: {err}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border bg-white p-6 text-sm text-neutral-600">Cargando…</div>
        ) : null}

        {!loading ? (
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-sm font-medium text-neutral-900">
              Categorías dentro de la semana {week}
            </div>

            <div className="mt-3 h-[320px] overflow-x-auto">
              <div style={{ width: w, height: 320 }}>
                <BarChart
                  width={w}
                  height={320}
                  data={data}
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
                    {data.map((row, idx) => (
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

            {!data.length && !loading ? (
              <div className="mt-3 text-sm text-neutral-500">Sin datos para esta semana.</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </IdLinensShell>
  );
}