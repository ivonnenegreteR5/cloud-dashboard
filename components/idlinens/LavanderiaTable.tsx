// components/idlinens/LavanderiaTable.tsx
"use client";

import React, { useMemo, useState } from "react";
import { Download, GripVertical } from "lucide-react";
import type { DetalleRow } from "@/components/idlinens/api";

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

type ColumnKey =
  | "rfid"
  | "estado"
  | "tipo"
  | "vistoUltimaVez"
  | "empleado"
  | "ubicacion"
  | "ciclosLavado"
  | "diasLavanderia"
  | "creado"
  | "antiguedadDias";

type ColumnDef = {
  key: ColumnKey;
  label: string;
  width: string;
  getValue: (row: DetalleRow) => string | number;
};

function getAny(row: any, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== "" && value !== "—") {
      return value;
    }
  }
  return "";
}

function parseDateMs(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "—") return 0;

  const n = Number(value);
  if (Number.isFinite(n) && n > 0) {
    return n > 9_999_999_999 ? n : n * 1000;
  }

  const raw = String(value ?? "").trim();
  if (!raw || raw === "—") return 0;

  const iso = Date.parse(raw);
  if (Number.isFinite(iso)) return iso;

  // Formato MX: 17/4/2026, 5:15:34 p.m.
  const m = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i
  );

  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    let hh = Number(m[4]);
    const min = Number(m[5]);
    const sec = Number(m[6] || 0);
    const ap = String(m[7] || "").toLowerCase();

    if (ap === "p" && hh < 12) hh += 12;
    if (ap === "a" && hh === 12) hh = 0;

    return new Date(yy, mm - 1, dd, hh, min, sec).getTime();
  }

  const dateOnly = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dateOnly) {
    const dd = Number(dateOnly[1]);
    const mm = Number(dateOnly[2]);
    const yy = Number(dateOnly[3]);
    return new Date(yy, mm - 1, dd).getTime();
  }

  return 0;
}

function diasDesdeUltimaVez(row: DetalleRow) {
  const ms = parseDateMs(row.vistoUltimaVez);
  if (!ms) return 0;

  const diff = Date.now() - ms;
  if (!Number.isFinite(diff) || diff < 0) return 0;

  return Math.floor(diff / 86_400_000);
}

function estadoLabel(value: unknown) {
  const raw = String(value ?? "").trim();
  const n = raw.toLowerCase();

  if (n === "in" || n === "checked in" || n === "entrada") return "Check in";
  if (n === "out" || n === "checked out" || n === "salida") return "Check out";
  if (n === "created" || n === "creado") return "Creado";

  return raw || "—";
}

const columns: ColumnDef[] = [
  {
    key: "rfid",
    label: "RFID",
    width: "w-[17%]",
    getValue: (r) =>
      getAny(r, ["tag", "rfid", "RFID", "epc", "EPC", "Tag", "tagId", "tag_id"]),
  },
  {
    key: "estado",
    label: "Estado",
    width: "w-[9%]",
    getValue: (r) =>
      estadoLabel(getAny(r, ["estado", "Estado", "status", "Status", "estatus", "Estatus"])),
  },
  {
    key: "tipo",
    label: "Tipo",
    width: "w-[13%]",
    getValue: (r) => r.tipo ?? "",
  },
  {
    key: "vistoUltimaVez",
    label: "Visto por última vez",
    width: "w-[14%]",
    getValue: (r) => r.vistoUltimaVez ?? "",
  },
  {
    key: "empleado",
    label: "Empleado",
    width: "w-[10%]",
    getValue: (r) => r.empleado ?? "",
  },
  {
    key: "ubicacion",
    label: "Ubicación",
    width: "w-[9%]",
    getValue: (r) => r.ubicacion ?? "",
  },
  {
    key: "ciclosLavado",
    label: "Ciclos",
    width: "w-[7%]",
    getValue: (r) =>
      getAny(r as any, [
        "ciclosLavado",
        "CiclosLavado",
        "washCycles",
        "WashCycles",
        "cycles",
        "Cycles",
        "ciclos",
        "Ciclos",
      ]) || 0,
  },
  {
    key: "diasLavanderia",
    label: "Días en lav.",
    width: "w-[8%]",
    getValue: (r) => diasDesdeUltimaVez(r),
  },
  {
    key: "creado",
    label: "Creado",
    width: "w-[10%]",
    getValue: (r) => r.creado ?? "",
  },
  {
    key: "antiguedadDias",
    label: "Antiguedad en dias.",
    width: "w-[6%]",
    getValue: (r) => r.antiguedadDias ?? 0,
  },
];

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadExcel(rows: DetalleRow[], orderedColumns: ColumnDef[]) {
  const headers = orderedColumns.map((c) => c.label);
  const body = rows.map((row) =>
    orderedColumns.map((c) => escapeCsv(c.getValue(row))).join(",")
  );

  const csv = [headers.map(escapeCsv).join(","), ...body].join("\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `inventario-lavanderia-${new Date().toISOString().slice(0, 10)}.csv`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function LavanderiaTable({
  rows,
  onRowClick,
}: {
  rows: DetalleRow[];
  maxHeight?: number;
  onRowClick?: (row: DetalleRow) => void;
}) {
  const clickable = typeof onRowClick === "function";

  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(
    columns.map((c) => c.key)
  );

  const [draggingColumn, setDraggingColumn] = useState<ColumnKey | null>(null);

  const orderedColumns = useMemo(() => {
    return columnOrder
      .map((key) => columns.find((c) => c.key === key))
      .filter(Boolean) as ColumnDef[];
  }, [columnOrder]);

  function moveColumn(from: ColumnKey, to: ColumnKey) {
    if (from === to) return;

    setColumnOrder((prev) => {
      const next = [...prev];
      const fromIndex = next.indexOf(from);
      const toIndex = next.indexOf(to);

      if (fromIndex === -1 || toIndex === -1) return prev;

      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);

      return next;
    });
  }

  return (
    <div className="min-w-0 w-full max-w-full overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-neutral-900">
            Inventario en lavandería
          </h3>
          <p className="text-sm text-neutral-500">
            {rows.length} registros en la tabla
          </p>
        </div>

        <button
          type="button"
          onClick={() => downloadExcel(rows, orderedColumns)}
          disabled={rows.length === 0}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Descargar Excel
        </button>
      </div>

      <div className="min-w-0 w-full max-w-full overflow-hidden">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-neutral-50 text-neutral-700">
            <tr>
              {orderedColumns.map((col) => (
                <th
                  key={col.key}
                  draggable
                  onDragStart={() => setDraggingColumn(col.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggingColumn) moveColumn(draggingColumn, col.key);
                    setDraggingColumn(null);
                  }}
                  onDragEnd={() => setDraggingColumn(null)}
                  className={cx(
                    col.width,
                    "min-w-0 select-none px-2 py-2 text-left font-semibold",
                    "cursor-grab active:cursor-grabbing",
                    draggingColumn === col.key && "opacity-50"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1">
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    <span className="truncate">{col.label}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="text-neutral-900">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={orderedColumns.length}
                  className="px-4 py-8 text-center text-sm text-neutral-500"
                >
                  No hay registros para mostrar.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r._id}
                  onClick={() => onRowClick?.(r)}
                  tabIndex={clickable ? 0 : -1}
                  onKeyDown={(e) => {
                    if (!clickable) return;
                    if (e.key === "Enter" || e.key === " ") onRowClick?.(r);
                  }}
                  className={cx(
                    "border-t",
                    clickable && "cursor-pointer hover:bg-neutral-50",
                    clickable &&
                      "outline-none focus:outline-none focus-visible:outline-none"
                  )}
                >
                  {orderedColumns.map((col) => {
                    const value = col.getValue(r) || "—";

                    return (
                      <td
                        key={col.key}
                        title={String(value)}
                        className="min-w-0 truncate px-2 py-2"
                      >
                        {col.key === "estado" ? (
                          <span className="inline-block max-w-full truncate rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                            {value}
                          </span>
                        ) : (
                          value
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}