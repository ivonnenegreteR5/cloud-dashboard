// components/idlinens/DetalleTable.tsx
"use client";

import React from "react";
import type { DetalleRow } from "@/components/idlinens/api";

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

export function DetalleTable({
  rows,
  onRowClick,
  rowClassName,
}: {
  rows: DetalleRow[];
  onRowClick?: (row: DetalleRow) => void;
  rowClassName?: string;
}) {
  const clickable = typeof onRowClick === "function";

  return (
    <div className="rounded-lg border bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
              <th>Tipo de blancos</th>
              <th>_id</th>
              <th>tag</th>
              <th>Visto por última vez</th>
              <th>Ciclos de lavado</th>
              <th>Creado</th>
              <th>Ubicación</th>
              <th>Antigüedad en días</th>
              <th>Días en Lavandería</th>
              <th>Estado</th>
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
                  // ✅ quita el “cuadro” de focus
                  clickable && "outline-none focus:outline-none focus-visible:outline-none",
                  rowClassName
                )}
              >
                <td className="whitespace-nowrap">{r.tipo}</td>
                <td className="whitespace-nowrap">{r._id}</td>
                <td className="whitespace-nowrap">{r.tag ?? ""}</td>
                <td className="whitespace-nowrap">{r.vistoUltimaVez}</td>
                <td className="whitespace-nowrap">{r.ciclosLavado}</td>
                <td className="whitespace-nowrap">{r.creado}</td>
                <td className="whitespace-nowrap">{r.ubicacion ?? ""}</td>
                <td className="whitespace-nowrap">{r.antiguedadDias}</td>
                <td className="whitespace-nowrap">{r.diasLavanderia}</td>
                <td className="whitespace-nowrap">{r.estado ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
