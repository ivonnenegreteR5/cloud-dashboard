// components/idlinens/StatusPie.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { UbicacionResumen } from "@/components/idlinens/api";

const COLORS = [
  "#2563EB",
  "#16A34A",
  "#6D28D9",
  "#EA580C",
  "#DC2626",
  "#0891B2",
  "#7C3AED",
  "#65A30D",
  "#0F766E",
  "#C026D3",
  "#D97706",
  "#0EA5E9",
  "#84CC16",
  "#F97316",
  "#14B8A6",
  "#A855F7",
];

function buildColorMap(items: UbicacionResumen[]) {
  const map: Record<string, string> = {};

  items.forEach((item, idx) => {
    map[item.id] = COLORS[idx % COLORS.length];
  });

  return map;
}

export function StatusPie({
  tenantId,
  data,
}: {
  tenantId: string;
  data: UbicacionResumen[];
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  // usa TODAS las ubicaciones para que el color no cambie entre leyenda y pie
  const colorMap = useMemo(() => buildColorMap(data), [data]);

  const visibleData = useMemo(() => {
    return data
      .filter((d) => !hidden[d.id])
      .map((d) => ({
        ...d,
        name: d.nombre,
      }));
  }, [data, hidden]);

  const onToggle = (id: string) => {
    setHidden((p) => ({ ...p, [id]: !p[id] }));
  };

  const goToDetalle = (item?: UbicacionResumen) => {
    if (!item?.nombre) return;

    router.push(
      `/${tenantId}/idlinens/estado/${encodeURIComponent(item.nombre)}`
    );
  };

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-2 text-base font-semibold">
        Distribución de Prendas por Localidad
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        {data.map((item) => {
          const off = !!hidden[item.id];

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 ${
                off ? "opacity-40" : ""
              }`}
              title={off ? "Mostrar" : "Ocultar"}
            >
              <span
                className="inline-block h-3 w-6 rounded"
                style={{ background: colorMap[item.id] }}
              />
              <span className="text-neutral-800">
                {item.nombre} ({item.count})
              </span>
            </button>
          );
        })}
      </div>

      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              formatter={(value, _name, entry) => [
                Number(value ?? 0),
                entry?.payload?.nombre ?? "Ubicación",
              ]}
            />
            <Pie
              data={visibleData}
              dataKey="count"
              nameKey="name"
              innerRadius={0}
              outerRadius={140}
              minAngle={3}
              stroke="#ffffff"
              strokeWidth={2}
              onClick={(entry: any) => {
                const row: UbicacionResumen | undefined =
                  entry?.payload ?? entry ?? undefined;
                goToDetalle(row);
              }}
            >
              {visibleData.map((d) => (
                <Cell key={d.id} fill={colorMap[d.id]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 text-xs text-neutral-500">
        Tip: toca una localidad en la leyenda para ocultarla o mostrarla. También puedes tocar la gráfica para ir al detalle.
      </div>
    </div>
  );
}