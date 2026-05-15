// components/idlinens/TipoBar.tsx
"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
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
import type { TipoResumen } from "@/components/idlinens/api";

function ellipsize(s: string, max = 14) {
  const t = String(s || "");
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

export function TipoBar({
  tenantId,
  data,
}: {
  tenantId: string;
  data: TipoResumen[];
}) {
  const router = useRouter();

  const safeData = useMemo(() => {
    return (data || []).map((d: any) => ({
      ...d,
      tipo: String(d?.tipo ?? ""),
      rawTipo: d?.rawTipo ? String(d.rawTipo) : undefined,
      count: Number(d?.count ?? 0),
    }));
  }, [data]);

  const goToTipo = (row: any) => {
    const tipo = row?.rawTipo ?? row?.tipo;
    if (!tipo) return;
    router.push(`/${tenantId}/idlinens/tipo/${encodeURIComponent(tipo)}`);
  };

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-2 text-base font-semibold">
        Total de prendas 
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {safeData.map((d, idx) => {
          const tipo = d.rawTipo ?? d.tipo;

          return (
            <button
              key={`${tipo}-${idx}`}
              type="button"
              onClick={() => goToTipo(d)}
              className="inline-flex items-center gap-2 rounded-full border px-2 py-1 hover:bg-neutral-50"
              title="Ver tabla detalle"
            >
              <span className="inline-block h-3 w-5 rounded bg-neutral-800" />
              <span className="text-neutral-800">{d.tipo}</span>
              <span className="text-neutral-500">· {d.count}</span>
            </button>
          );
        })}
      </div>

      <div className="h-[520px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={safeData}
            margin={{ top: 10, right: 10, left: 22, bottom: 120 }}
          >
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis
              dataKey="tipo"
              interval={0}
              angle={-45}
              textAnchor="end"
              height={120}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => ellipsize(String(v), 18)}
            />

            <YAxis />

            <Tooltip
              formatter={(value: any) => [value, "Total"]}
              labelFormatter={(label: any) => String(label)}
            />

            <Bar dataKey="count" cursor="pointer" minPointSize={6}>
              {safeData.map((row, idx) => (
                <Cell
                  key={`cell-${idx}`}
                  cursor="pointer"
                  onClick={() => goToTipo(row)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 text-xs text-neutral-500">
        Tip: toca una barra o un tipo del menú para ir al detalle.
      </div>
    </div>
  );
}