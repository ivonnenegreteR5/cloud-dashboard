//components/idlinens/MovimientosDiariosDashboard.tsx
// components/idlinens/MovimientosDiariosDashboard.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { fetchMovimientosResumenDiario, type MovResumenDia } from "@/components/idlinens/api";

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function fmtDia(dia: string) {
  if (!dia) return "";
  const [y, m, d] = dia.split("-").map((x) => Number(x));
  if (!y || !m || !d) return dia;
  return `${d}/${m}/${y}`;
}

/**
 * Construye SIEMPRE: /{tenant}/idlinens/mov/dia?dia=YYYY-MM-DD
 * aunque el dashboard se renderice en /{tenant}/idlinens o /{tenant}/idlinens/mov
 */
function buildMovDiaHref(pathname: string, dia: string) {
  const clean = String(pathname || "").replace(/\/$/, "");
  const qs = `dia=${encodeURIComponent(dia)}`;

  // Si ya estás dentro de /idlinens/mov
  if (/\/idlinens\/mov$/.test(clean)) {
    return `${clean}/dia?${qs}`;
  }

  // Si estás en /idlinens (u otra subruta), fuerza /idlinens/mov/dia
  const idx = clean.indexOf("/idlinens");
  if (idx >= 0) {
    const base = clean.slice(0, idx) + "/idlinens/mov";
    return `${base}/dia?${qs}`;
  }

  // Fallback: por si algún día cambia el layout
  return `/idlinens/mov/dia?${qs}`;
}

export default function MovimientosDiariosDashboard({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const [days] = useState(7);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<MovResumenDia[]>([]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setErr(null);
        const r = await fetchMovimientosResumenDiario(tenantId, { days });
        if (!alive) return;
        setData(r.filter((x) => x.dia).sort((a, b) => (a.dia < b.dia ? 1 : -1)));
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error cargando movimientos");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [tenantId, days]);

  const chartData = useMemo(() => {
    return [...data].sort((a, b) => (a.dia > b.dia ? 1 : -1));
  }, [data]);

  const totals = useMemo(() => {
    const s = { in: 0, out: 0, created: 0, total: 0 };
    for (const r of data) {
      s.in += r.in;
      s.out += r.out;
      s.created += r.created;
      s.total += r.total;
    }
    return s;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-neutral-600">
        <span className="text-neutral-900 font-medium">Movimientos diarios</span>
        <span className="text-neutral-400">·</span>
        <span className="text-neutral-600">Últimos {days} días</span>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error: {err}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">
        {/* IZQUIERDA: gráfica */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-base font-semibold">Últimos movimientos</div>
            <div className="text-xs text-neutral-500">
              Total: <span className="font-medium">{totals.total}</span>
            </div>
          </div>

          <div className="text-xs text-neutral-500 mb-3">
            in: <span className="font-medium">{totals.in}</span> · out:{" "}
            <span className="font-medium">{totals.out}</span> · created:{" "}
            <span className="font-medium">{totals.created}</span>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-neutral-600">Cargando…</div>
          ) : (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dia" tickFormatter={(v) => fmtDia(String(v))} tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip
                    formatter={(value: any, name: any) => [Number(value || 0), String(name)]}
                    labelFormatter={(label: any) => `Día: ${fmtDia(String(label))}`}
                  />
                  <Legend />
                  <Bar dataKey="in" />
                  <Bar dataKey="out" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-2 text-xs text-neutral-500">
            Tip: toca un día en la lista para ver las transacciones y descargar el reporte.
          </div>
        </div>

        {/* DERECHA: lista de días */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-2 text-base font-semibold">Listado de recibos Entradas / Salidas</div>

          {loading ? (
            <div className="p-6 text-sm text-neutral-600">Cargando…</div>
          ) : (
            <div className="max-h-[420px] overflow-auto divide-y">
              {data.map((r) => (
                <button
                  key={r.dia}
                  type="button"
                  className={cx(
                    "w-full text-left px-2 py-3 hover:bg-neutral-50 rounded-md",
                    "flex items-center justify-between gap-3"
                  )}
                  onClick={() => {
                    const href = buildMovDiaHref(pathname, r.dia);
                    router.push(href);
                  }}
                >
                  <div>
                    <div className="text-sm font-medium">{fmtDia(r.dia)}</div>
                    <div className="text-xs text-neutral-500">
                      in: {r.in} · out: {r.out} · created: {r.created}
                    </div>
                  </div>

                  <div className="text-xs text-neutral-500">
                    total <span className="font-medium text-neutral-900">{r.total}</span>
                  </div>
                </button>
              ))}

              {!data.length && <div className="p-6 text-sm text-neutral-600">Sin movimientos.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}