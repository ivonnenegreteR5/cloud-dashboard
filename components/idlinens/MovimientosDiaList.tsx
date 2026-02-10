//components/idlinens/MovimientosDiaList.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  buildMovimientoPdfUrl,
  fetchMovimientosDiaPage,
  type MovimientoItem,
} from "@/components/idlinens/api";

function fmtDia(dia: string) {
  if (!dia) return "";
  const [y, m, d] = dia.split("-").map((x) => Number(x));
  if (!y || !m || !d) return dia;
  return `${d}/${m}/${y}`;
}

export default function MovimientosDiaList({ tenantId }: { tenantId: string }) {
  const params = useSearchParams();
  const router = useRouter();

  const dia = String(params.get("dia") || "").slice(0, 10);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<MovimientoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const limit = 30;

  const canLoadMore = useMemo(() => items.length < total, [items.length, total]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setErr(null);
        setItems([]);
        setSkip(0);

        if (!dia) {
          setErr("Falta el parámetro 'dia' (YYYY-MM-DD).");
          return;
        }

        const page = await fetchMovimientosDiaPage(tenantId, dia, limit, 0);
        if (!alive) return;

        setItems(page.items);
        setTotal(page.total);
        setSkip(page.items.length);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error cargando movimientos del día");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [tenantId, dia]);

  async function loadMore() {
    try {
      const page = await fetchMovimientosDiaPage(tenantId, dia, limit, skip);
      setItems((p) => [...p, ...page.items]);
      setTotal(page.total);
      setSkip((s) => s + page.items.length);
    } catch (e: any) {
      setErr(e?.message || "Error cargando más");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-neutral-600">
        <button
          type="button"
          className="rounded-md px-2 py-1 hover:bg-neutral-100"
          onClick={() => router.back()}
        >
          ← Regresar
        </button>
        <span className="text-neutral-900 font-medium">Transacciones del día</span>
        <span className="text-neutral-400">·</span>
        <span className="text-neutral-700">{fmtDia(dia)}</span>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error: {err}
        </div>
      )}

      <div className="rounded-lg border bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold">Listado</div>
          <div className="text-xs text-neutral-500">
            {items.length}
            {total ? ` / ${total}` : ""}
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-neutral-600">Cargando…</div>
        ) : (
          <div className="divide-y">
            {items.map((m) => (
              <div key={m._id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{m.fechaHora}</div>
                  <div className="text-xs text-neutral-500">
                    estado: <span className="font-medium">{m.estado}</span>
                    {m.empleado ? <> · empleado: {m.empleado}</> : null}
                    {m.ubicacion ? <> · ubicación: {m.ubicacion}</> : null}
                  </div>
                </div>

                <a
                  className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
                  href={buildMovimientoPdfUrl(tenantId, m._id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Descargar PDF
                </a>
              </div>
            ))}

            {!items.length && <div className="p-6 text-sm text-neutral-600">Sin transacciones.</div>}
          </div>
        )}

        <div className="px-4 py-3 border-t flex justify-end">
          <button
            type="button"
            onClick={loadMore}
            disabled={!canLoadMore}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50 hover:bg-neutral-50"
          >
            {canLoadMore ? "Cargar más" : "Fin"}
          </button>
        </div>
      </div>
    </div>
  );
}
