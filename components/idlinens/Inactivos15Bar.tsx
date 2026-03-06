// components/idlinens/Inactivos15Bar.tsx
"use client";

import React, { useMemo, useCallback } from "react";
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
import type { Inactivos15TipoResumen } from "./api";

function trunc(s: string, max = 18) {
  const t = String(s || "");
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

function canonTipo(v: any) {
  const noAccents = String(v ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const compact = noAccents.replace(/\s+/g, " ").trim();
  return compact.toUpperCase();
}

/**
 * Tick personalizado:
 * - fuente pequeña
 * - rotado
 * - con <title> para hover (texto completo)
 */
function TickLabel(props: any) {
  const { x, y, payload } = props;
  const full = String(payload?.payload?.tipo ?? payload?.value ?? "");
  const shown = String(payload?.value ?? "");
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{full}</title>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor="end"
        transform="rotate(-35)"
        style={{ fontSize: 10 }}
        fill="currentColor"
      >
        {shown}
      </text>
    </g>
  );
}

export function Inactivos15Bar({
  tenantId,
  estado,
  data,
  selectedTipo,
  onSelectTipo,
}: {
  tenantId: string;
  estado: string;
  data: Inactivos15TipoResumen[];
  selectedTipo?: string;
  onSelectTipo?: (tipo: string) => void;
}) {
  const router = useRouter();

  const safe = useMemo(() => {
    const arr = Array.isArray(data) ? data : [];
    return arr
      .map((d) => {
        const tipo = String((d as any)?.tipo ?? "");
        const total = Number((d as any)?.count ?? 0);
        return {
          tipo,
          key: canonTipo(tipo),
          label: trunc(tipo, 18),
          total: Number.isFinite(total) ? total : 0,
        };
      })
      .filter((x) => x.tipo && Number.isFinite(x.total));
  }, [data]);

  const selectedKey = useMemo(
    () => (selectedTipo ? canonTipo(selectedTipo) : ""),
    [selectedTipo]
  );

  // ✅ mostrar solo 1 de cada N labels para que se alcancen a ver “los numeritos”
  // regla simple: si hay muchas barras, salta labels.
  const tickEvery = useMemo(() => {
    const n = safe.length;
    if (n <= 10) return 1;
    if (n <= 16) return 2;
    if (n <= 24) return 3;
    if (n <= 32) return 4;
    return 5;
  }, [safe.length]);

  const goToTipo = useCallback(
    (tipo: string) => {
      const t = String(tipo || "").trim();
      if (!t) return;

      if (onSelectTipo) return onSelectTipo(t);

      router.push(
        `/${tenantId}/idlinens/inactivos15?estado=${encodeURIComponent(
          estado
        )}&tipo=${encodeURIComponent(t)}`
      );
    },
    [onSelectTipo, router, tenantId, estado]
  );

  return (
    <div className="w-full h-full min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={safe}
          // ✅ más espacio abajo para los labels rotados
          margin={{ top: 8, right: 10, left: 8, bottom: 110 }}
        >
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis
            dataKey="label"
            interval={tickEvery - 1} // ✅ 0 = todos, 1 = 1 sí / 1 no, etc.
            height={110}
            tick={<TickLabel />}
          />

          {/* ✅ números del eje Y más visibles */}
          <YAxis allowDecimals={false} width={52} tick={{ fontSize: 12 }} />

          <Tooltip
            formatter={(v: any) => [v, "Total"]}
            labelFormatter={(_, payload) =>
              String(payload?.[0]?.payload?.tipo ?? "")
            }
          />

          <Bar
            dataKey="total"
            isAnimationActive={false}
            onClick={(dataPoint: any, index: number) => {
              const byIndex = safe?.[index]?.tipo;
              if (byIndex) return goToTipo(byIndex);

              const byPayload = String(
                dataPoint?.payload?.tipo ?? dataPoint?.tipo ?? ""
              );
              if (byPayload) return goToTipo(byPayload);
            }}
          >
            {safe.map((row, idx) => (
              <Cell
                key={`${row.key}-${idx}`}
                cursor="pointer"
                strokeWidth={0}
                opacity={selectedKey && row.key !== selectedKey ? 0.35 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
