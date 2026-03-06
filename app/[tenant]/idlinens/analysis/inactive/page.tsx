// app/[tenant]/idlinens/analysis/inactive/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { fetchAnalysisDetail, retireAssetToRetirados } from "@/components/idlinens/api";
import { Button } from "@/components/ui/button";

type Params = { tenant?: string; tenantId?: string };

type Row = {
  _id: string;
  tag: string;
  tipo: string;
  location: string;
  status: string;
  createdAtMs?: number | null;
};

function pickStr(...vals: any[]) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function fmtDateTimeMs(ms?: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("es-MX");
}

export default function AnalysisInactiveDetailPage() {
  const router = useRouter();
  const params = useParams<Params>();
  const search = useSearchParams();

  const tenantId = String(params?.tenantId || params?.tenant || "").trim();
  const tipo = String(search.get("tipo") || "").trim();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  const [limit, setLimit] = useState(100);
  const [skip, setSkip] = useState(0);

  // modal retiro
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [retireErr, setRetireErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        if (!tenantId) throw new Error("No tenantId.");
        if (!tipo) throw new Error("Falta ?tipo=...");

        const res = await fetchAnalysisDetail(tenantId, {
          mode: "inactive",
          tipo,
          limit,
          skip,
        });

        if (!alive) return;

        const mapped: Row[] = (res.items || [])
          .map((a: any) => ({
            _id: pickStr(a?._id, a?.id, a?.tag),
            tag: String(a?.tag ?? ""),
            tipo: String(a?.tipo ?? tipo),
            location: String(a?.location ?? ""),
            status: String(a?.status ?? ""),
            createdAtMs:
              typeof a?.createdAtMs === "number" ? a.createdAtMs : (a?.createdAtMs ?? null),
          }))
          .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

        setRows(mapped);
        setTotalRows(Number(res.total ?? mapped.length));
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [tenantId, tipo, limit, skip]);

  const count = useMemo(() => totalRows || rows.length, [totalRows, rows.length]);

  async function retireSelected() {
    if (!selectedRow) return;

    setRetiring(true);
    setRetireErr(null);

    try {
      const tag = String(selectedRow.tag || "").trim();
      if (!tag) throw new Error("Este asset no trae tag/EPC.");

      await retireAssetToRetirados(tenantId, tag);

      // quitar de UI (solo en esta página)
      setRows((prev) => prev.filter((r) => String(r.tag) !== tag));

      setModalOpen(false);
      setSelectedRow(null);
    } catch (e: any) {
      setRetireErr(e?.message || "Error retirando");
    } finally {
      setRetiring(false);
    }
  }

  const canPrev = skip > 0;
  const canNext = skip + limit < totalRows;

  return (
    <IdLinensShell tenantId={tenantId} title="Análisis de prendas">
      <div className="px-4 md:px-6 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-neutral-900">Sin actividad</div>
            <div className="text-sm text-neutral-600">{tipo}</div>
            <div className="mt-1 text-xs text-neutral-500">Prendas: {count}</div>
          </div>

          <Button variant="outline" onClick={() => router.back()}>
            Regresar
          </Button>
        </div>

        {err ? <div className="text-sm text-red-600">{err}</div> : null}
        {loading ? <div className="text-sm opacity-70">Cargando…</div> : null}

        {/* Paginado */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button
            variant="outline"
            disabled={!canPrev || loading}
            onClick={() => setSkip((s) => Math.max(0, s - limit))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={!canNext || loading}
            onClick={() => setSkip((s) => s + limit)}
          >
            Siguiente
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-neutral-600">Filas:</span>
            <select
              className="h-9 rounded-md border bg-white px-2 text-sm"
              value={limit}
              onChange={(e) => {
                setSkip(0);
                setLimit(Number(e.target.value));
              }}
              disabled={loading}
            >
              {[50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-2xl border bg-white overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white shadow-sm">
              <tr>
                <th className="p-3 text-left">EPC</th>
                <th className="p-3 text-left">Ubicación</th>
                <th className="p-3 text-left">Estado</th>
                <th className="p-3 text-left">Creado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r._id + "|" + r.tag}
                  className="border-t hover:bg-neutral-50 cursor-pointer"
                  onClick={() => {
                    setSelectedRow(r);
                    setRetireErr(null);
                    setModalOpen(true);
                  }}
                  title="Click para retirar"
                >
                  <td className="p-3 font-mono text-[12px]">{r.tag || "—"}</td>
                  <td className="p-3">{r.location || "—"}</td>
                  <td className="p-3">{r.status || "—"}</td>
                  <td className="p-3">{fmtDateTimeMs(r.createdAtMs)}</td>
                </tr>
              ))}

              {!rows.length && !loading ? (
                <tr>
                  <td className="p-3 opacity-70" colSpan={4}>
                    Sin datos.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Modal Retiro */}
        {modalOpen && selectedRow ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
            <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl border">
              <div className="text-lg font-semibold">Retirar de inventario</div>
              <div className="mt-2 text-sm opacity-80">
                Esta prenda se moverá a: <b>Blancos Retirados</b>
              </div>

              <div className="mt-3 rounded-xl border p-3 text-sm">
                <div>
                  <b>Tipo:</b> {selectedRow.tipo}
                </div>
                <div>
                  <b>EPC:</b> <span className="font-mono">{selectedRow.tag}</span>
                </div>
                <div>
                  <b>Creado:</b> {fmtDateTimeMs(selectedRow.createdAtMs)}
                </div>
              </div>

              {retireErr ? <div className="mt-2 text-sm text-red-600">{retireErr}</div> : null}

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setModalOpen(false);
                    setSelectedRow(null);
                  }}
                  disabled={retiring}
                >
                  Cancelar
                </Button>
                <Button onClick={retireSelected} disabled={retiring}>
                  {retiring ? "Retirando…" : "Retirar"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </IdLinensShell>
  );
}