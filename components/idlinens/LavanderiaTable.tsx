// components/idlinens/LavanderiaTable.tsx
"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import type { DetalleRow } from "@/components/idlinens/api";

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export function LavanderiaTable({
  rows,
  maxHeight = 340,
  onRowClick,
}: {
  rows: DetalleRow[];
  maxHeight?: number;
  onRowClick?: (row: DetalleRow) => void;
}) {
  const clickable = typeof onRowClick === "function";

  return (
    <div className="rounded-lg border bg-white">
      <div
        className="overflow-auto"
        style={{ maxHeight }}
      >
        <table className="min-w-[980px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-50 text-neutral-700">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
              <th>Tipo de blancos</th>
              <th>Visto por última vez</th>
              <th>Empleado</th>
              <th>Ubicación</th>
              <th>Ciclos de lavado</th>
              <th>Días en Lavandería</th>
              <th>Creado</th>
              <th>Antigüedad en días</th>
              <th className="w-[42px]"></th>
            </tr>
          </thead>

          <tbody className="text-neutral-900">
            {rows.map((r) => (
              <tr
                key={r._id}
                onClick={() => onRowClick?.(r)}
                tabIndex={clickable ? 0 : -1}
                onKeyDown={(e) => {
                  if (!clickable) return;
                  if (e.key === "Enter" || e.key === " ") onRowClick?.(r);
                }}
                className={cx(
                  "border-t [&>td]:px-3 [&>td]:py-2",
                  clickable && "cursor-pointer hover:bg-neutral-50",
                  clickable &&
                    "outline-none focus:outline-none focus-visible:outline-none"
                )}
              >
                <td className="whitespace-nowrap">{r.tipo}</td>
                <td className="whitespace-nowrap">{r.vistoUltimaVez}</td>
                <td className="whitespace-nowrap">{r.empleado}</td>
                <td className="whitespace-nowrap">{r.ubicacion ?? ""}</td>
                <td className="whitespace-nowrap">{r.ciclosLavado}</td>
                <td className="whitespace-nowrap">{r.diasLavanderia}</td>
                <td className="whitespace-nowrap">{r.creado}</td>
                <td className="whitespace-nowrap">{r.antiguedadDias}</td>
                <td className="text-right">
                  <ChevronRight className="inline-block h-4 w-4 text-neutral-500" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
