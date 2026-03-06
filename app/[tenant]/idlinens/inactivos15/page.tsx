//app/[tenant]/idlinens/inactivos15/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

import {
  fetchInactivos15ResumenTipos,
  fetchInactivos15DetallePage,
  type Inactivos15TipoResumen,
  type Inactivos15DetalleRow,
} from "@/components/idlinens/api";

import { Inactivos15Bar } from "@/components/idlinens/Inactivos15Bar";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";

type Params = { tenant?: string; tenantId?: string };

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

export default function Inactivos15Page() {
  const router = useRouter();
  const params = useParams<Params>();

  const tenantId = String(params?.tenantId || params?.tenant || "").trim();

  const sp = useSearchParams();
  const estado = String(sp.get("estado") || "todos");
  const selectedTipo = String(sp.get("tipo") || "");

  // ===== Gráfica =====
  const [tipos, setTipos] = useState<Inactivos15TipoResumen[]>([]);
  const [loadingTipos, setLoadingTipos] = useState(true);
  const [errTipos, setErrTipos] = useState<string | null>(null);

  // ===== Tabla (load more) =====
  const LIMIT = 200;
  const MAX_ROWS = 2000;

  const [rows, setRows] = useState<Inactivos15DetalleRow[]>([]);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [loadingRows, setLoadingRows] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errRows, setErrRows] = useState<string | null>(null);

  // ===== Modal =====
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Inactivos15DetalleRow | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [retireErr, setRetireErr] = useState<string | null>(null);

  // ✅ tu ubicación de Firestore (según tu captura)
  const RETIRED_LOCATION_ID = "Blancos Retirados";

  const titleTipo = useMemo(() => (selectedTipo ? selectedTipo : ""), [selectedTipo]);

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

  // ✅ IMPORTANTE: en tu proyecto el ID token está como cloudIdToken
  function getIdToken() {
    return typeof window !== "undefined"
      ? (localStorage.getItem("cloudIdToken") || "").trim()
      : "";
  }

  function goTipo(tipo: string) {
    const base = `/${tenantId}/idlinens/inactivos15`;
    const qs = new URLSearchParams();
    qs.set("estado", estado);
    if (tipo) qs.set("tipo", tipo);
    router.push(`${base}?${qs.toString()}`);
  }

  // ===== 1) Carga gráfica =====
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingTipos(true);
        setErrTipos(null);

        const token = getSessionToken();
        if (!tenantId) throw new Error("No tenantId en la ruta.");
        if (!token) throw new Error("No hay cloudSessionToken (haz login primero).");

        const rTipos = await fetchInactivos15ResumenTipos(tenantId, { estado: estado as any });

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

  // ===== Tabla helpers =====
  async function loadFirst() {
    setLoadingRows(true);
    setErrRows(null);
    setHasMore(true);
    setSkip(0);

    const token = getSessionToken();
    if (!tenantId) throw new Error("No tenantId en la ruta.");
    if (!token) throw new Error("No hay cloudSessionToken (haz login primero).");

    const rDetalle = await fetchInactivos15DetallePage(tenantId, {
      estado: estado as any,
      tipo: selectedTipo || undefined,
      limit: LIMIT,
      skip: 0,
      tiposRef: tipos.length ? tipos : undefined,
    });

    const newRows = rDetalle?.rows || [];
    setRows(newRows);

    const more = newRows.length >= LIMIT && newRows.length < MAX_ROWS;
    setHasMore(more);
    setSkip(newRows.length);

    setLoadingRows(false);
  }

  async function loadMore() {
    if (!hasMore || loadingMore) return;

    setLoadingMore(true);
    setErrRows(null);

    const token = getSessionToken();
    if (!tenantId) throw new Error("No tenantId en la ruta.");
    if (!token) throw new Error("No hay cloudSessionToken (haz login primero).");

    const rDetalle = await fetchInactivos15DetallePage(tenantId, {
      estado: estado as any,
      tipo: selectedTipo || undefined,
      limit: LIMIT,
      skip,
      tiposRef: tipos.length ? tipos : undefined,
    });

    const newRows = rDetalle?.rows || [];

    setRows((prev) => {
      const merged = [...prev, ...newRows];
      return merged.slice(0, MAX_ROWS);
    });

    const nextSkip = skip + newRows.length;
    setSkip(nextSkip);

    const reachedMax = rows.length + newRows.length >= MAX_ROWS;
    const more = newRows.length >= LIMIT && !reachedMax;
    setHasMore(more);

    setLoadingMore(false);
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
  }, [tenantId, estado, selectedTipo, tipos]);

  // ✅ “tabla seccionada” por fecha
  const grouped = useMemo(() => {
    const out: Array<{ dateLabel: string; items: Inactivos15DetalleRow[] }> = [];
    const map = new Map<string, Inactivos15DetalleRow[]>();

    const getVisto = (r: any) => toDateStr(r?.LastSeen ?? r?.lastSeen ?? r?.vistoPorUltimaVez);

    for (const r of rows) {
      const dateLabel = getVisto(r) || "Sin fecha";
      if (!map.has(dateLabel)) {
        map.set(dateLabel, []);
        out.push({ dateLabel, items: map.get(dateLabel)! });
      }
      map.get(dateLabel)!.push(r);
    }
    return out;
  }, [rows]);

  // ✅ alto fijo para que NO crezca toda la pantalla al cargar más
  const mainH = "h-[calc(100vh-260px)]";

  async function retireSelected() {
    if (!selectedAsset) return;

    setRetiring(true);
    setRetireErr(null);

    try {
      const sessionToken = getSessionToken();
      const idToken = getIdToken();

      if (!tenantId) throw new Error("No tenantId en la ruta.");
      if (!sessionToken) throw new Error("No hay cloudSessionToken (haz login primero).");
      if (!idToken) throw new Error("No hay Firebase ID token en localStorage (cloudIdToken).");

      const tag = String((selectedAsset as any)?.tag || "").trim();
      if (!tag) throw new Error("Este asset no trae 'tag' (AssetTag). No puedo moverlo.");

      const res = await fetch("/api/cloud/assets/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": tenantId,
          "x-session-token": sessionToken,
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          // tu endpoint /api/cloud/assets/update usa updateAssetsWithSession
          // ✅ actualizamos SOLO la ubicación
          items: [
            {
              tag,
              locationId: RETIRED_LOCATION_ID,
            },
          ],
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.message || data?.error || "No se pudo retirar";
        throw new Error(msg);
      }

      // ✅ cerrar modal y refrescar tabla
      setModalOpen(false);

      // Si quieres quitarlo de la tabla sin esperar reload:
      setRows((prev) => prev.filter((r) => String((r as any)?.tag || "") !== tag));

      // y por seguridad recargamos primera página
      await loadFirst();
    } catch (e: any) {
      setRetireErr(e?.message || "Error retirando");
    } finally {
      setRetiring(false);
    }
  }

  return (
    <IdLinensShell tenantId={tenantId} title="Prendas con 15+ días sin actividad">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="text-2xl font-semibold">Prendas con 15+ días sin actividad</div>

          {selectedTipo ? (
            <Button variant="outline" className="ml-auto" onClick={() => goTipo("")}>
              Quitar filtro
            </Button>
          ) : null}
        </div>

        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${mainH} min-h-0 overflow-hidden`}>
          {/* TABLA */}
          <div className="border rounded-2xl p-4 flex flex-col h-full min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <div className="font-semibold">
                Detalle {selectedTipo ? `— ${titleTipo}` : "— (todas)"}
              </div>
              <div className="text-sm opacity-70">
                {loadingRows ? "Cargando…" : `Mostrando ${rows.length}`}
              </div>
            </div>

            {errRows ? <div className="text-red-600 text-sm mb-2 shrink-0">{errRows}</div> : null}

            {/* ✅ SOLO ESTE CUADRO SCROLLEA */}
            <div className="border rounded-xl flex-1 min-h-0 overflow-auto">
              <table className="w-full text-sm">
                {/* ✅ sticky header SIN traslape */}
                <thead className="sticky top-0 z-30 bg-white shadow-sm">
                  <tr>
                    <th className="text-left p-2">Tipo de blancos</th>
                    <th className="text-left p-2">Visto por última vez</th>
                    <th className="text-left p-2">Estado</th>
                  </tr>
                </thead>

                <tbody>
                  {grouped.map((g) => (
                    <React.Fragment key={g.dateLabel}>
                      {/* header sección */}
                      <tr className="bg-black/5">
                        <td colSpan={3} className="p-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{g.dateLabel}</span>
                            <span className="inline-flex items-center justify-center rounded-md bg-black/10 px-2 py-0.5 text-xs">
                              {g.items.length}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {g.items.map((r, i) => {
                        const visto = toDateStr(
                          (r as any)?.LastSeen ?? (r as any)?.lastSeen ?? (r as any)?.vistoPorUltimaVez
                        );

                        return (
                          <tr
                            key={`${(r as any)?.tag || r._id}-${g.dateLabel}-${i}`}
                            className="border-t hover:bg-black/5 cursor-pointer"
                            onClick={() => {
                              setSelectedAsset(r);
                              setRetireErr(null);
                              setModalOpen(true);
                            }}
                          >
                            <td className="p-2">{r.tipo || ""}</td>
                            <td className="p-2">{visto}</td>
                            <td className="p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span>{r.estado || ""}</span>
                                <ChevronRight className="h-4 w-4 opacity-50" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}

                  {!rows.length && !loadingRows && (
                    <tr>
                      <td colSpan={3} className="p-3 opacity-70">
                        Sin datos
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ✅ SIN botón refrescar (solo “Cargar más”) */}
            <div className="flex items-center gap-2 mt-3 shrink-0">
              <Button
                className="ml-auto"
                variant="outline"
                disabled={loadingRows || loadingMore || !hasMore}
                onClick={() => loadMore().catch((e: any) => setErrRows(e?.message || "Error cargando más"))}
              >
                {loadingMore ? "Cargando…" : hasMore ? "Cargar más" : "No hay más"}
              </Button>
            </div>
          </div>

          {/* GRÁFICA */}
          <div className="border rounded-2xl p-4 flex flex-col h-full min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <div className="font-semibold">Prendas sin actividad por categoría</div>
              {selectedTipo ? (
                <div className="text-sm opacity-70 truncate max-w-[55%]">Filtrado: {selectedTipo}</div>
              ) : (
                <div className="text-sm opacity-70">Sin filtro</div>
              )}
            </div>

            {loadingTipos ? <div className="text-sm opacity-70 shrink-0">Cargando gráfica…</div> : null}
            {errTipos ? <div className="text-red-600 text-sm shrink-0">{errTipos}</div> : null}

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

        {/* MODAL */}
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

              {retireErr ? (
                <div className="mt-3 text-sm text-red-600">
                  {retireErr}
                </div>
              ) : null}

              <div className="mt-5 flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setModalOpen(false)} disabled={retiring}>
                  Cancelar
                </Button>

                <Button onClick={retireSelected} disabled={retiring}>
                  {retiring ? "Retirando…" : "Retirar"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </IdLinensShell>
  );
}
