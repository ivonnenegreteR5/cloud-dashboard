
// components/idlinens/TipoPie.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { EstadoKey, TipoResumen } from "@/components/idlinens/api";

function hashColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 45%)`;
}

export function TipoPie({
  tenantId,
  estado,
  data,
}: {
  tenantId: string;
  estado: EstadoKey;
  data: TipoResumen[];
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  // ✅ orden consistente (mayor a menor)
  const sorted = useMemo(() => {
    return [...(data || [])].sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [data]);

  // ✅ cuando cambia estado o cambia la data, resetea ocultos
  useEffect(() => {
    setHidden({});
  }, [estado, sorted.length]);

  const visibleData = useMemo(() => {
    return sorted
      .filter((d) => !hidden[d.tipo])
      .map((d) => ({ ...d, name: d.tipo }));
  }, [sorted, hidden]);

  const onToggle = (tipo: string) => {
    setHidden((p) => ({ ...p, [tipo]: !p[tipo] }));
  };

  /**
   * ✅ Navegación correcta:
   * - usamos rawTipo (tipo REAL en BD) si viene
   * - fallback a tipo canonizado si no hay rawTipo
   */
  const goToTipo = (row?: TipoResumen) => {
    const raw = row?.rawTipo ?? row?.tipo;
    if (!raw) return;

    router.push(
      `/${tenantId}/idlinens/estado/${estado}/tipo/${encodeURIComponent(raw)}`
    );
  };

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-2 text-base font-semibold">
        Distribución por Tipo de blancos
      </div>

      {/* Leyenda clickeable */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {sorted.map((d) => {
          const off = !!hidden[d.tipo];
          const c = hashColor(d.tipo);
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
                style={{ background: c }}
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
              formatter={(value: any, _name: any, props: any) => {
                const tipo = props?.payload?.tipo ?? "";
                return [`${value}`, tipo];
              }}
            />
            <Pie
              data={visibleData}
              dataKey="count"
              nameKey="name"
              outerRadius={220}
              // ✅ Recharts pasa el payload del slice en entry.payload (a veces) o directo
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
