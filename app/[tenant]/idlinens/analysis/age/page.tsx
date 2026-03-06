//app/[tenant]/idlinens/analysis/age/page.tsx

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { fetchAnalysisDetail } from "@/components/idlinens/api";

type Params = { tenant?: string; tenantId?: string };

function toNumberSafe(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

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

export default function AnalysisAgeWeekPage() {
  const router = useRouter();
  const params = useParams<Params>();
  const search = useSearchParams();

  const tenantId = String(params?.tenantId || params?.tenant || "").trim();
  const week = toNumberSafe(search.get("week"), 0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Traemos items de esa semana (desde cache server)
  const [items, setItems] = useState<any[]>([]);

  // paginado simple en esta vista (para no traer 50k a la vez si crece)
  const [limit, setLimit] = useState(500);
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        if (!tenantId) throw new Error("No tenantId.");
        if (!week) throw new Error("Falta ?week=...");

        const res = await fetchAnalysisDetail(tenantId, {
          mode: "age",
          week,
          limit,
          skip,
        });

        if (!alive) return;
        setItems(Array.isArray(res.items) ? res.items : []);
        setTotal(Number(res.total ?? 0));
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tenantId, week, limit, skip]);

  const porTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of items) {
      const tipo = String(a?.tipo ?? "").trim() || "—";
      m.set(tipo, (m.get(tipo) || 0) + 1);
    }
    return [...m.entries()]
      .map(([tipo, value]) => ({ tipo, value }))
      .sort((a, b) => b.value - a.value);
  }, [items]);

  const axisTick = { fontSize: 10, fill: "#525252" };

  const canPrev = skip > 0;
  const canNext = skip + limit < total;

  return (
    <IdLinensShell tenantId={tenantId} title="Análisis de prendas">
      <div className="px-4 md:px-6 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-neutral-900">
              Antigüedad — Semana {week}
            </div>
            <div className="text-xs text-neutral-500">
              Click en un tipo para ver la tabla • Total semana: {total || items.length}
            </div>
          </div>
        </div>

        {err ? <div className="text-sm text-red-600">{err}</div> : null}
        {loading ? <div className="text-sm opacity-70">Cargando…</div> : null}

        {/* Paginado */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="text-neutral-600">
            Mostrando {skip + 1}–{Math.min(skip + limit, total || skip + items.length)}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="h-9 rounded-md border bg-white px-3 text-sm disabled:opacity-50"
              disabled={!canPrev || loading}
              onClick={() => setSkip((s) => Math.max(0, s - limit))}
            >
              Anterior
            </button>
            <button
              className="h-9 rounded-md border bg-white px-3 text-sm disabled:opacity-50"
              disabled={!canNext || loading}
              onClick={() => setSkip((s) => s + limit)}
            >
              Siguiente
            </button>
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
              {[200, 500, 1000, 2000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm font-medium text-neutral-900">Distribución por tipo</div>

          <div className="mt-3 h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porTipo} margin={{ top: 12, right: 16, left: 0, bottom: 85 }}>
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
                      `/${tenantId}/idlinens/analysis/age/detail?week=${week}&tipo=${encodeURIComponent(tipo)}`
                    );
                  }}
                >
                  {porTipo.map((_, idx) => (
                    <Cell key={idx} className="cursor-pointer" fill="#2563EB" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </IdLinensShell>
  );
}