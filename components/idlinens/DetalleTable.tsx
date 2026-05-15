// components/idlinens/DetalleTable.tsx
"use client";

import React, { useMemo, useState } from "react";
import type { DetalleRow } from "@/components/idlinens/api";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";

import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

type ColumnId =
  | "tipo"
  | "tag"
  | "vistoUltimaVez"
  | "ciclosLavado"
  | "creado"
  | "antiguedadDias"
  | "ubicacion"
  | "diasLavanderia"
  | "estado";

type SortDir = "asc" | "desc";

const DEFAULT_ORDER: ColumnId[] = [
  "tipo",
  "tag",
  "vistoUltimaVez",
  "ciclosLavado",
  "creado",
  "antiguedadDias",
  "ubicacion",
  "diasLavanderia",
  "estado",
];

const COLUMN_LABELS: Record<ColumnId, string> = {
  tipo: "Tipo de blancos",
  tag: "Número RFID",
  vistoUltimaVez: "Visto por última vez",
  ciclosLavado: "Ciclos de lavado",
  creado: "Creado",
  antiguedadDias: "Antigüedad (días)",
  ubicacion: "Ubicación",
  diasLavanderia: "Días en Lavandería",
  estado: "Estado",
};

function toText(v: unknown) {
  return String(v ?? "").trim();
}

function toNumber(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseDateMs(v: unknown) {
  const raw = String(v ?? "").trim();
  if (!raw || raw === "-") return 0;

  const n = Number(raw);
  if (Number.isFinite(n)) return n > 10_000_000_000 ? n : n * 1000;

  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? 0 : ms;
}

function getSortValue(row: DetalleRow, key: ColumnId) {
  switch (key) {
    case "tipo":
      return toText(row.tipo);
    case "tag":
      return toText(row.tag);
    case "vistoUltimaVez":
      return parseDateMs(row.vistoUltimaVez);
    case "ciclosLavado":
      return toNumber(row.ciclosLavado);
    case "creado":
      return parseDateMs(row.creado);
    case "antiguedadDias":
      return toNumber(row.antiguedadDias);
    case "ubicacion":
      return toText(row.ubicacion);
    case "diasLavanderia":
      return toNumber(row.diasLavanderia);
    case "estado":
      return toText(row.estado);
    default:
      return "";
  }
}

function estadoLabel(value?: string | null) {
  const raw = String(value ?? "").trim();
  const n = raw.toLowerCase();

  if (n === "in" || n === "checked in" || n === "entrada") return "Check in";
  if (n === "out" || n === "checked out" || n === "salida") return "Check out";
  if (n === "created" || n === "creado") return "Creado";

  return raw || "—";
}

function EstadoBadge({ value }: { value?: string | null }) {
  const label = estadoLabel(value);
  const n = String(value ?? "").toLowerCase();

  const isIn = n === "in" || n === "checked in" || n === "entrada";
  const isOut = n === "out" || n === "checked out" || n === "salida";

  return (
    <span
      className={cx(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        isIn && "bg-black text-white",
        isOut && "bg-neutral-100 text-neutral-700",
        !isIn && !isOut && "bg-neutral-50 text-neutral-700"
      )}
    >
      {label}
    </span>
  );
}

function SortableHeaderCell({
  id,
  children,
}: {
  id: ColumnId;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="px-3 py-2 text-left font-semibold"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab rounded p-1 text-neutral-400 hover:bg-neutral-200 active:cursor-grabbing"
          title="Mover columna"
        >
          ⋮⋮
        </button>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </th>
  );
}

function excelEscape(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getExcelValue(row: DetalleRow, key: ColumnId) {
  switch (key) {
    case "tipo":
      return row.tipo;
    case "tag":
      return row.tag ?? "";
    case "vistoUltimaVez":
      return row.vistoUltimaVez;
    case "ciclosLavado":
      return row.ciclosLavado;
    case "creado":
      return row.creado;
    case "antiguedadDias":
      return row.antiguedadDias ?? 0;
    case "ubicacion":
      return row.ubicacion ?? "";
    case "diasLavanderia":
      return row.diasLavanderia ?? 0;
    case "estado":
      return estadoLabel(row.estado);
    default:
      return "";
  }
}

function downloadExcelFile(rows: DetalleRow[], columns: ColumnId[]) {
  const headers = columns.map((c) => COLUMN_LABELS[c]);

  const html = `
    <html>
      <head>
        <meta charset="UTF-8" />
      </head>
      <body>
        <table border="1">
          <thead>
            <tr>
              ${headers.map((h) => `<th>${excelEscape(h)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    ${columns
                      .map(
                        (col) =>
                          `<td>${excelEscape(getExcelValue(row, col))}</td>`
                      )
                      .join("")}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  const fecha = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `detalle-prendas-${fecha}.xls`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export function DetalleTable({
  rows,
  onRowClick,
  rowClassName,
  onDownloadAll,
}: {
  rows: DetalleRow[];
  onRowClick?: (row: DetalleRow) => void;
  rowClassName?: string;
  onDownloadAll?: () => void;
}) {
  const clickable = typeof onRowClick === "function";

  const [sortKey, setSortKey] = useState<ColumnId>("vistoUltimaVez");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(DEFAULT_ORDER);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    setColumnOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id) as ColumnId);
      const newIndex = prev.indexOf(String(over.id) as ColumnId);

      if (oldIndex < 0 || newIndex < 0) return prev;

      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);

      let cmp = 0;

      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv), "es", {
          numeric: true,
          sensitivity: "base",
        });
      }

      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const changeSort = (key: ColumnId) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDir(
      key === "vistoUltimaVez" ||
        key === "creado" ||
        key === "antiguedadDias" ||
        key === "ciclosLavado" ||
        key === "diasLavanderia"
        ? "desc"
        : "asc"
    );
  };

  const renderHeader = (id: ColumnId) => {
    const active = sortKey === id;

    return (
      <button
        type="button"
        onClick={() => changeSort(id)}
        className="inline-flex items-center gap-1 whitespace-nowrap font-semibold hover:text-black"
      >
        {COLUMN_LABELS[id]}
        {active && <span className="text-xs">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    );
  };

  const renderCell = (r: DetalleRow, id: ColumnId) => {
    switch (id) {
      case "tipo":
        return (
          <td className="whitespace-nowrap px-3 py-2 font-medium">{r.tipo}</td>
        );

      case "tag":
        return (
          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
            {r.tag ?? ""}
          </td>
        );

      case "vistoUltimaVez":
        return (
          <td className="whitespace-nowrap px-3 py-2">
            {r.vistoUltimaVez}
          </td>
        );

      case "ciclosLavado":
        return (
          <td className="whitespace-nowrap px-3 py-2">{r.ciclosLavado}</td>
        );

      case "creado":
        return <td className="whitespace-nowrap px-3 py-2">{r.creado}</td>;

      case "antiguedadDias":
        return (
          <td className="whitespace-nowrap px-3 py-2">
            {r.antiguedadDias ?? 0}
          </td>
        );

      case "ubicacion":
        return (
          <td className="whitespace-nowrap px-3 py-2">{r.ubicacion ?? ""}</td>
        );

      case "diasLavanderia":
        return (
          <td className="whitespace-nowrap px-3 py-2">
            {r.diasLavanderia ?? 0}
          </td>
        );

      case "estado":
        return (
          <td className="whitespace-nowrap px-3 py-2">
            <EstadoBadge value={r.estado} />
          </td>
        );

      default:
        return null;
    }
  };

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex items-center justify-end border-b bg-white px-3 py-2">
        
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleColumnDragEnd}
      >
        <div className="overflow-x-auto">
          <table className="min-w-[1150px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-700">
              <tr>
                <SortableContext
                  items={columnOrder}
                  strategy={horizontalListSortingStrategy}
                >
                  {columnOrder.map((id) => (
                    <SortableHeaderCell key={id} id={id}>
                      {renderHeader(id)}
                    </SortableHeaderCell>
                  ))}
                </SortableContext>
              </tr>
            </thead>

            <tbody className="text-neutral-900">
              {sortedRows.map((r, idx) => (
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
                    idx % 2 ? "bg-neutral-50" : "bg-white",
                    clickable && "cursor-pointer hover:bg-neutral-100",
                    clickable &&
                      "outline-none focus:outline-none focus-visible:outline-none",
                    rowClassName
                  )}
                >
                  {columnOrder.map((id) => (
                    <React.Fragment key={id}>{renderCell(r, id)}</React.Fragment>
                  ))}
                </tr>
              ))}

              {sortedRows.length === 0 && (
                <tr>
                  <td
                    colSpan={columnOrder.length}
                    className="border-t px-3 py-6 text-center text-sm text-neutral-500"
                  >
                    No hay prendas para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DndContext>
    </div>
  );
}