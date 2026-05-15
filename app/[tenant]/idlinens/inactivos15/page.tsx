// app/[tenant]/idlinens/inactivos15/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronRight, Download } from "lucide-react";
import * as XLSX from "xlsx";

import {
  fetchInactivos15UltimaActividadResumenTipos,
  fetchInactivos15UltimaActividadDetallePage,
  type Inactivos15TipoResumen,
  type Inactivos15DetalleRow,
} from "@/components/idlinens/api";

import { Inactivos15Bar } from "@/components/idlinens/Inactivos15Bar";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";

type Params = { tenant?: string; tenantId?: string };

type TableCol = {
  key: string;
  label: string;
  fixed?: boolean;
};

const TABLE_COLS: TableCol[] = [
  { key: "select", label: "", fixed: true },
  { key: "tipo", label: "Tipo" },
  { key: "tag", label: "Número RFID" },
  { key: "visto", label: "Visto por última vez" },
  { key: "ubicacion", label: "Ubicación" },
  { key: "ciclos", label: "Ciclosde lavado" },
  { key: "estado", label: "Estado" },
];

const COL_STORAGE_KEY = "inactivos15TableColOrder";

function toDateStr(v: any) {
  if (!v) return "";
  const n = Number(v);

  if (Number.isFinite(n) && n > 0) {
    const ms = n > 9999999999 ? n : n * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("es-MX");
  }

  const d2 = new Date(v);
  if (!isNaN(d2.getTime())) return d2.toLocaleDateString("es-MX");
  return String(v);
}

function rowKey(r: any) {
  return String(r?.tag || r?.AssetTag || r?._id || r?.id || "").trim();
}

export default function Inactivos15Page() {
  const router = useRouter();
  const params = useParams<Params>();
  const tenantId = String(params?.tenantId || params?.tenant || "").trim();

  const sp = useSearchParams();
  const estado = String(sp.get("estado") || "todos");
  const selectedTipo = String(sp.get("tipo") || "");

  const [tipos, setTipos] = useState<Inactivos15TipoResumen[]>([]);
  const [loadingTipos, setLoadingTipos] = useState(true);
  const [errTipos, setErrTipos] = useState<string | null>(null);

  const LIMIT = 10000;

  const [rows, setRows] = useState<Inactivos15DetalleRow[]>([]);
  const [searchRfid, setSearchRfid] = useState("");
  const [loadingRows, setLoadingRows] = useState(true);
  const [errRows, setErrRows] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] =
    useState<Inactivos15DetalleRow | null>(null);

  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [retiring, setRetiring] = useState(false);
  const [retireErr, setRetireErr] = useState<string | null>(null);

  const [colOrder, setColOrder] = useState<string[]>(
    TABLE_COLS.map((c) => c.key)
  );

  const RETIRED_LOCATION_ID = "Blancos Retirados";

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = localStorage.getItem(COL_STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return;

      const valid = parsed.filter((k) =>
        TABLE_COLS.some((c) => c.key === String(k))
      );

      const missing = TABLE_COLS.map((c) => c.key).filter(
        (k) => !valid.includes(k)
      );

      setColOrder([...valid, ...missing]);
    } catch {}
  }, []);

  const orderedCols = useMemo(() => {
    return colOrder
      .map((key) => TABLE_COLS.find((c) => c.key === key))
      .filter(Boolean) as TableCol[];
  }, [colOrder]);

  const titleTipo = useMemo(
    () => (selectedTipo ? selectedTipo : ""),
    [selectedTipo]
  );

const selectedRows = useMemo(
  () => rows.filter((r: any) => selectedKeys.includes(rowKey(r))),
  [rows, selectedKeys]
);

const filteredRows = useMemo(() => {
  const q = searchRfid.trim().toLowerCase();

  if (!q) return rows;

  return rows.filter((r: any) => {
    const tag = String(r?.tag || r?.AssetTag || "").toLowerCase();
    return tag.includes(q);
  });
}, [rows, searchRfid]);

const visibleKeys = useMemo(
  () => filteredRows.map((r: any) => rowKey(r)).filter(Boolean),
  [filteredRows]
);

  const allSelected =
    visibleKeys.length > 0 &&
    visibleKeys.every((k) => selectedKeys.includes(k));

  const assetLabel = useMemo(() => {
    if (!selectedAsset) return "";

    const id = selectedAsset._id || "";
    const tipo = selectedAsset.tipo || "";
    const est = selectedAsset.estado || "";
    const visto = toDateStr(
      (selectedAsset as any)?.LastSeen ??
        (selectedAsset as any)?.lastSeen ??
        (selectedAsset as any)?.vistoPorUltimaVez
    );

    return `${id} | ${tipo} | ${est} | ${visto}`;
  }, [selectedAsset]);

  function getSessionToken() {
    return typeof window !== "undefined"
      ? (localStorage.getItem("cloudSessionToken") || "").trim()
      : "";
  }

  function getIdToken() {
    return typeof window !== "undefined"
      ? (localStorage.getItem("cloudIdToken") || "").trim()
      : "";
  }

  function goTipo(tipo: string) {
    const nextTipo = String(tipo || "").trim();
    const currentTipo = String(selectedTipo || "").trim();
    const currentEstado = String(estado || "todos").trim();

    if (nextTipo === currentTipo) return;

    const base = `/${tenantId}/idlinens/inactivos15`;
    const qs = new URLSearchParams();
    qs.set("estado", currentEstado);

    if (nextTipo) qs.set("tipo", nextTipo);

    router.push(`${base}?${qs.toString()}`);
  }

  function toggleOne(key: string) {
    if (!key) return;

    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  }

  function toggleAll() {
    setSelectedKeys((prev) =>
      allSelected
        ? prev.filter((x) => !visibleKeys.includes(x))
        : Array.from(new Set([...prev, ...visibleKeys]))
    );
  }

  function moveColumn(fromKey: string, toKey: string) {
    if (!fromKey || !toKey) return;
    if (fromKey === toKey) return;
    if (fromKey === "select") return;
    if (toKey === "select") return;

    setColOrder((prev) => {
      const next = [...prev];
      const fromIndex = next.indexOf(fromKey);
      const toIndex = next.indexOf(toKey);

      if (fromIndex < 0 || toIndex < 0) return prev;

      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      if (typeof window !== "undefined") {
        localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(next));
      }

      return next;
    });
  }

  function downloadExcel() {
    if (!rows.length) return;

    const data = rows.map((r: any) => {
      const lastSeenRaw =
        r?.lastMovementAt ??
        r?.LastSeen ??
        r?.lastSeen ??
        r?.vistoPorUltimaVez ??
        "";

      return {
        Tipo: r?.tipo || "",
        Tag: r?.tag || r?.AssetTag || "",
        "Visto por última vez": toDateStr(lastSeenRaw),
        Ubicación: r?.ubicacion || r?.Location || r?.locationId || "",
        "Ciclos de lavado": r?.ciclosLavado ?? 0,
        Estado: r?.estado || r?.status || r?.Status || "",
        ID: r?._id || "",
        "Antigüedad (días)": r?.antiguedadDias ?? "",
        "Días en lavandería": r?.diasLavanderia ?? "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 22 },
      { wch: 28 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 28 },
      { wch: 16 },
      { wch: 18 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inactivos15");

    const safeTenant = String(tenantId || "tenant").replace(
      /[\\/:*?"<>|]/g,
      "-"
    );
    const safeTipo = String(selectedTipo || "todas").replace(
      /[\\/:*?"<>|]/g,
      "-"
    );

    XLSX.writeFile(wb, `inactivos15_${safeTenant}_${safeTipo}.xlsx`);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingTipos(true);
        setErrTipos(null);

        const token = getSessionToken();
        if (!tenantId) throw new Error("No tenantId en la ruta.");
        if (!token)
          throw new Error("No hay cloudSessionToken (haz login primero).");

        const rTipos = await fetchInactivos15UltimaActividadResumenTipos(
          tenantId,
          15
        );

        if (!alive) return;
        setTipos(rTipos || []);
      } catch (e: any) {
        if (!alive) return;
        setErrTipos(e?.message || "Error cargando gráfica");
      } finally {
        if (!alive) return;
        setLoadingTipos(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [tenantId, estado]);

  async function loadFirst() {
    setLoadingRows(true);
    setErrRows(null);

    const token = getSessionToken();
    if (!tenantId) throw new Error("No tenantId en la ruta.");
    if (!token)
      throw new Error("No hay cloudSessionToken (haz login primero).");

    if (!selectedTipo) {
      setRows([]);
      setSelectedKeys([]);
      setLoadingRows(false);
      return;
    }

    const rDetalle = await fetchInactivos15UltimaActividadDetallePage(tenantId, {
      tipo: selectedTipo || undefined,
      limit: LIMIT,
      skip: 0,
      days: 15,
    });

    setRows(rDetalle?.rows || []);
    setSelectedKeys([]);
    setLoadingRows(false);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await loadFirst();
      } catch (e: any) {
        if (!alive) return;
        setErrRows(e?.message || "Error cargando tabla");
        setLoadingRows(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, estado, selectedTipo]);

  const grouped = useMemo(() => {
    const out: Array<{ dateLabel: string; items: Inactivos15DetalleRow[] }> =
      [];
    const map = new Map<string, Inactivos15DetalleRow[]>();

    const getVisto = (r: any) =>
      toDateStr(
        r?.lastMovementAt ?? r?.LastSeen ?? r?.lastSeen ?? r?.vistoPorUltimaVez
      );

   for (const r of filteredRows) {
      const dateLabel = getVisto(r) || "Sin fecha";

      if (!map.has(dateLabel)) {
        map.set(dateLabel, []);
        out.push({ dateLabel, items: map.get(dateLabel)! });
      }

      map.get(dateLabel)!.push(r);
    }

    return out;
 }, [filteredRows]);
  const mainH = "h-[calc(100vh-220px)]";

  async function retireMany(targetRows: Inactivos15DetalleRow[]) {
    setRetiring(true);
    setRetireErr(null);

    try {
      const sessionToken = getSessionToken();
      const idToken = getIdToken();

      if (!tenantId) throw new Error("No tenantId en la ruta.");
      if (!sessionToken)
        throw new Error("No hay cloudSessionToken (haz login primero).");
      if (!idToken)
        throw new Error(
          "No hay Firebase ID token en localStorage (cloudIdToken)."
        );

      const items = targetRows
        .map((r: any) => ({
          tag: String(r?.tag || r?.AssetTag || "").trim(),
          locationId: RETIRED_LOCATION_ID,
        }))
        .filter((x) => x.tag);

      if (!items.length) throw new Error("No hay prendas válidas para retirar.");

      const res = await fetch("/api/cloud/assets/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": tenantId,
          "x-session-token": sessionToken,
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ items }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.message || data?.error || "No se pudo retirar";
        throw new Error(msg);
      }

      const removed = new Set(items.map((x) => x.tag));

      setRows((prev) =>
        prev.filter(
          (r: any) => !removed.has(String(r?.tag || r?.AssetTag || "").trim())
        )
      );

      setSelectedKeys([]);
      setModalOpen(false);
      setConfirmBulkOpen(false);

      await loadFirst();
    } catch (e: any) {
      setRetireErr(e?.message || "Error retirando");
    } finally {
      setRetiring(false);
    }
  }

  async function retireSelected() {
    if (!selectedAsset) return;
    await retireMany([selectedAsset]);
  }

  async function retireBulkSelected() {
    if (!selectedRows.length) return;
    await retireMany(selectedRows);
  }

  function renderCell(colKey: string, r: any, checked: boolean, key: string) {
    const visto = toDateStr(
      r?.lastMovementAt ?? r?.LastSeen ?? r?.lastSeen ?? r?.vistoPorUltimaVez
    );

    switch (colKey) {
      case "select":
        return (
          <td key={colKey} className="p-2" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleOne(key)}
              aria-label="Seleccionar prenda"
            />
          </td>
        );

      case "tipo":
        return (
          <td key={colKey} className="p-2">
            {r.tipo || ""}
          </td>
        );

      case "tag":
        return (
          <td key={colKey} className="p-2">
            {r.tag || r.AssetTag || ""}
          </td>
        );

      case "visto":
        return (
          <td key={colKey} className="p-2">
            {visto}
          </td>
        );

      case "ubicacion":
        return (
          <td key={colKey} className="p-2">
            {r.ubicacion || r.Location || r.locationId || ""}
          </td>
        );

      case "ciclos":
        return (
          <td key={colKey} className="p-2">
            {r.ciclosLavado ?? 0}
          </td>
        );

      case "estado":
        return (
          <td key={colKey} className="p-2">
            <div className="flex items-center justify-between gap-2">
              <span>{r.estado || r.status || r.Status || ""}</span>
              <ChevronRight className="h-4 w-4 opacity-50" />
            </div>
          </td>
        );

      default:
        return null;
    }
  }

  return (
    <IdLinensShell tenantId={tenantId} title="Prendas con 15+ días sin actividad">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="text-2xl font-semibold">
            Prendas con 15+ días sin actividad
          </div>

          {selectedTipo ? (
            <Button variant="outline" className="ml-auto" onClick={() => goTipo("")}>
              Quitar filtro
            </Button>
          ) : null}
        </div>

        <div
          className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${mainH} min-h-0 overflow-hidden`}
        >
          <div className="border rounded-2xl p-4 flex flex-col h-full min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2 shrink-0 gap-2">
              <div className="font-semibold">
                Detalle{" "}
                {selectedTipo ? `— ${titleTipo}` : "— selecciona una categoría"}
              </div>

              <div className="flex items-center gap-2">
                <div className="text-sm opacity-70">
                  {loadingRows
  ? "Cargando…"
  : `Mostrando ${filteredRows.length} de ${rows.length}`}
                </div>

                <Button
                  variant="outline"
                  onClick={downloadExcel}
                  disabled={loadingRows || !rows.length}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Descargar
                </Button>

                <Button
                  disabled={loadingRows || retiring || selectedRows.length === 0}
                  onClick={() => {
                    setRetireErr(null);
                    setConfirmBulkOpen(true);
                  }}
                >
                  Retirar ({selectedRows.length})
                </Button>
              </div>
            </div>

            <div className="text-xs opacity-60 mb-2">
              Puedes arrastrar los encabezados para mover columnas.
            </div>

            <div className="mb-2 flex items-center gap-2">
  <input
    value={searchRfid}
    onChange={(e) => setSearchRfid(e.target.value)}
    placeholder="Buscar RFID..."
    className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20"
  />

  {searchRfid ? (
    <Button variant="outline" onClick={() => setSearchRfid("")}>
      Limpiar
    </Button>
  ) : null}
</div>

            {errRows ? (
              <div className="text-red-600 text-sm mb-2 shrink-0">{errRows}</div>
            ) : null}

            <div className="border rounded-xl flex-1 min-h-0 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-30 bg-white shadow-sm">
                  <tr>
                    {orderedCols.map((col) => (
                      <th
                        key={col.key}
                    className={`text-left p-2 ${
  col.key === "select" ? "w-10" : ""
}`}
                        onDragOver={(e) => {
                          if (!col.fixed) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromKey = e.dataTransfer.getData("text/plain");
                          moveColumn(fromKey, col.key);
                        }}
                        title={!col.fixed ? "Arrastra para mover esta columna" : ""}
                      >
                        {col.key === "select" ? (
  <input
    type="checkbox"
    checked={allSelected}
    disabled={!visibleKeys.length || loadingRows}
    onChange={toggleAll}
    aria-label="Seleccionar todas"
  />
) : (
 <div className="flex items-center gap-2">
  <span
    className="text-gray-400 text-xs select-none"
    draggable
    onDragStart={(e) => {
      e.dataTransfer.setData("text/plain", col.key);
      e.dataTransfer.effectAllowed = "move";
    }}
    onDragEnd={() => {
      document.body.style.cursor = "default";
    }}
    style={{ cursor: "default" }}
    title="Arrastrar columna"
  >
    ⋮⋮
  </span>

  <span>{col.label}</span>
</div>
)}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {grouped.map((g) => (
                    <React.Fragment key={g.dateLabel}>
                      <tr className="bg-black/5">
                        <td colSpan={orderedCols.length} className="p-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{g.dateLabel}</span>
                            <span className="inline-flex items-center justify-center rounded-md bg-black/10 px-2 py-0.5 text-xs">
                              {g.items.length}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {g.items.map((r, i) => {
                        const key = rowKey(r);
                        const checked = selectedKeys.includes(key);

                        return (
                          <tr
                            key={`${key}-${g.dateLabel}-${i}`}
                            className={`border-t hover:bg-black/5 cursor-pointer ${
                              checked ? "bg-red-50" : ""
                            }`}
                            onClick={() => {
                              setSelectedAsset(r);
                              setRetireErr(null);
                              setModalOpen(true);
                            }}
                          >
                            {orderedCols.map((col) =>
                              renderCell(col.key, r, checked, key)
                            )}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}

                 {!filteredRows.length && !loadingRows && (
                    <tr>
                      <td colSpan={orderedCols.length} className="p-3 opacity-70">
                        {selectedTipo
  ? searchRfid
    ? "No se encontró ese RFID"
    : "Sin datos"
  : "Selecciona una categoría para cargar la tabla"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border rounded-2xl p-4 flex flex-col h-full min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <div className="font-semibold">
                Prendas sin actividad por categoría
              </div>

              {selectedTipo ? (
                <div className="text-sm opacity-70 truncate max-w-[55%]">
                  Filtrado: {selectedTipo}
                </div>
              ) : (
                <div className="text-sm opacity-70">Sin filtro</div>
              )}
            </div>

            {loadingTipos ? (
              <div className="text-sm opacity-70 shrink-0">Cargando gráfica…</div>
            ) : null}

            {errTipos ? (
              <div className="text-red-600 text-sm shrink-0">{errTipos}</div>
            ) : null}

            <div className="flex-1 min-h-0">
              {!loadingTipos && !errTipos ? (
                <Inactivos15Bar
                  tenantId={tenantId}
                  estado={estado}
                  data={tipos}
                  selectedTipo={selectedTipo || undefined}
                  onSelectTipo={(tipo) => goTipo(tipo)}
                />
              ) : null}
            </div>
          </div>
        </div>

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Cerrar"
              onClick={() => setModalOpen(false)}
            />

            <div className="relative w-[560px] max-w-[92vw] rounded-2xl bg-white p-5 shadow-xl">
              <div className="text-lg font-semibold">Retirar de inventario</div>

              <div className="text-sm mt-3">
                Asset seleccionado:
                <div className="mt-2 p-2 rounded-lg bg-black/5 font-mono text-xs break-all">
                  {assetLabel}
                </div>
              </div>

              <div className="text-sm mt-3">
                Se moverá a ubicación:{" "}
                <span className="font-medium">{RETIRED_LOCATION_ID}</span>
              </div>

              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                ¿Estás segura de retirar esta prenda del inventario?
              </div>

              {retireErr ? (
                <div className="mt-3 text-sm text-red-600">{retireErr}</div>
              ) : null}

              <div className="mt-5 flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                  disabled={retiring}
                >
                  Cancelar
                </Button>

                <Button onClick={retireSelected} disabled={retiring}>
                  {retiring ? "Retirando…" : "Sí, retirar"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {confirmBulkOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Cerrar"
              onClick={() => setConfirmBulkOpen(false)}
            />

            <div className="relative w-[560px] max-w-[92vw] rounded-2xl bg-white p-5 shadow-xl">
              <div className="text-lg font-semibold">
                Retirar prendas seleccionadas
              </div>

              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                ¿Estás segura de retirar {selectedRows.length} prenda(s) del
                inventario?
                <br />
                Se moverán a{" "}
                <span className="font-semibold">{RETIRED_LOCATION_ID}</span>.
              </div>

              {retireErr ? (
                <div className="mt-3 text-sm text-red-600">{retireErr}</div>
              ) : null}

              <div className="mt-5 flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setConfirmBulkOpen(false)}
                  disabled={retiring}
                >
                  Cancelar
                </Button>

                <Button
                  onClick={retireBulkSelected}
                  disabled={retiring || !selectedRows.length}
                >
                  {retiring ? "Retirando…" : "Sí, retirar seleccionadas"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </IdLinensShell>
  );
}