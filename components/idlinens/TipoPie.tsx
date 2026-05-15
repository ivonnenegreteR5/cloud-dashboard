// components/idlinens/TipoPie.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { TipoResumen } from "@/components/idlinens/api";

function hashColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue} 70% 45%)`;
}

export function TipoPie({
  tenantId,
  location,
  data,
}: {
  tenantId: string;
  location: string;
  data: TipoResumen[];
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const sorted = useMemo(() => {
    return [...(data || [])].sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [data]);

  useEffect(() => {
    setHidden({});
  }, [location, sorted.length]);

  const visibleData = useMemo(() => {
    return sorted
      .filter((d) => !hidden[d.tipo])
      .map((d) => ({
        ...d,
        name: d.tipo,
      }));
  }, [sorted, hidden]);

  const onToggle = (tipo: string) => {
    setHidden((prev) => ({ ...prev, [tipo]: !prev[tipo] }));
  };

  const goToTipo = (row?: TipoResumen) => {
    const raw = row?.rawTipo ?? row?.tipo;
    if (!raw || !location) return;

    router.push(
      `/${tenantId}/idlinens/estado/${encodeURIComponent(
        location
      )}/tipo/${encodeURIComponent(raw)}`
    );
  };

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-2 text-base font-semibold">
        Distribución por Tipo de blancos
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {sorted.map((d) => {
          const off = !!hidden[d.tipo];
          const color = hashColor(d.tipo);

          return (
            <button
              key={d.tipo}
              type="button"
              onClick={() => onToggle(d.tipo)}
              className={[
                "inline-flex items-center gap-2 rounded-full border px-2 py-1",
                off ? "opacity-40" : "",
              ].join(" ")}
              title={off ? "Mostrar" : "Ocultar"}
            >
              <span
                className="inline-block h-3 w-5 rounded"
                style={{ background: color }}
              />
              <span className="text-neutral-800">{d.tipo}</span>
              <span className="text-neutral-500">· {d.count}</span>
            </button>
          );
        })}
      </div>

      <div className="h-[520px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              formatter={(value, _name, props) => {
                const tipo = props?.payload?.tipo ?? "";
                return [String(value ?? 0), tipo];
              }}
            />

            <Pie
              data={visibleData}
              dataKey="count"
              nameKey="name"
              outerRadius={220}
              minAngle={2}
              stroke="#ffffff"
              strokeWidth={2}
              onClick={(entry: any) => {
                const row: TipoResumen | undefined =
                  entry?.payload ?? entry ?? undefined;
                goToTipo(row);
              }}
            >
              {visibleData.map((d) => (
                <Cell key={d.tipo} fill={hashColor(d.tipo)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 text-xs text-neutral-500">
        Tip: toca un tipo para ver la tabla detalle.
      </div>
    </div>
  );
}