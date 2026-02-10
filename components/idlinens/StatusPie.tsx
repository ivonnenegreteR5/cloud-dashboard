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
import type { EstadoResumen, EstadoKey } from "@/components/idlinens/api";

const COLORS: Record<EstadoKey, string> = {
  circulacion: "#6D28D9", // morado
  lavanderia: "#16A34A",  // verde
  nuevos: "#2563EB",      // azul
};

function labelFromKey(k: EstadoKey) {
  return k === "circulacion" ? "Circulación" : k === "lavanderia" ? "Lavandería" : "Nuevos";
}

export function StatusPie({
  tenantId,
  data,
}: {
  tenantId: string;
  data: EstadoResumen[];
}) {
  const router = useRouter();

  const [hidden, setHidden] = useState<Record<EstadoKey, boolean>>({
    circulacion: false,
    lavanderia: false,
    nuevos: false,
  });

  const visibleData = useMemo(() => {
    return data
      .filter((d) => !hidden[d.estado])
      .map((d) => ({ ...d, name: d.label }));
  }, [data, hidden]);

  const onToggle = (estado: EstadoKey) => {
    setHidden((p) => ({ ...p, [estado]: !p[estado] }));
  };

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-2 text-base font-semibold">Distribución de Prendas</div>

      {/* Leyenda clickeable (oculta/muestra) */}
      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        {(["circulacion", "lavanderia", "nuevos"] as EstadoKey[]).map((k) => {
          const off = hidden[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => onToggle(k)}
              className={`inline-flex items-center gap-2 rounded-full px-2 py-1 border ${
                off ? "opacity-40" : ""
              }`}
              title={off ? "Mostrar" : "Ocultar"}
            >
              <span
                className="inline-block h-3 w-6 rounded"
                style={{ background: COLORS[k] }}
              />
              <span className="text-neutral-800">{labelFromKey(k)}</span>
            </button>
          );
        })}
      </div>

      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip />
            <Pie
              data={visibleData}
              dataKey="count"
              nameKey="name"
              innerRadius={0}
              outerRadius={140}
              onClick={(entry: any) => {
                const estado = entry?.estado as EstadoKey | undefined;
                if (!estado) return;
                router.push(`/${tenantId}/idlinens/estado/${estado}`);
              }}
            >
              {visibleData.map((d) => (
                <Cell key={d.estado} fill={COLORS[d.estado]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 text-xs text-neutral-500">
        Tip: toca “Circulación/Lavandería/Nuevos” para ir al detalle por tipo.
      </div>
    </div>
  );
}
