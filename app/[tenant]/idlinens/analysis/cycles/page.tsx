//app/[tenant]/idlinens/analysis/cycles/page.tsx
// app/[tenant]/idlinens/analysis/cycles/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { fetchAnalysisDetail } from "@/components/idlinens/api";
import { Button } from "@/components/ui/button";

type Params = { tenant?: string; tenantId?: string };

type Row = {
  _id: string;
  tag: string;
  tipo: string;
  location: string;
  status: string;
  ciclosLavado: number;
};

function pickStr(...vals: any[]) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

export default function AnalysisCyclesDetailPage() {
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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        if (!tenantId) throw new Error("No tenantId.");
        if (!tipo) throw new Error("Falta ?tipo=...");

        const res = await fetchAnalysisDetail(tenantId, {
          mode: "cycles",
          tipo,
          limit,
          skip,
        });

        if (!alive) return;

        const mapped: Row[] = (res.items || [])
          .map((a: any) => ({
            _id: pickStr(a?._id, a?.id, a?.tag),
            tag: pickStr(a?.tag, a?.AssetTag, a?._id, a?.id),
            tipo: String(a?.tipo ?? tipo),
            location: String(a?.location ?? a?.Location ?? ""),
            status: String(a?.status ?? a?.Status ?? ""),
            ciclosLavado: Number(a?.ciclosLavado ?? a?.custom?.ciclosLavado ?? 0) || 0,
          }))
          .sort((a, b) => (b.ciclosLavado || 0) - (a.ciclosLavado || 0));

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

  const totalCiclos = useMemo(
    () => rows.reduce((acc, r) => acc + (r.ciclosLavado || 0), 0),
    [rows]
  );

  const canPrev = skip > 0;
  const canNext = skip + limit < totalRows;

  return (
    <IdLinensShell tenantId={tenantId} title="Análisis de prendas">
      <div className="px-4 md:px-6 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-neutral-900">
              Ciclos por categoría
            </div>
            <div className="text-sm text-neutral-600">{tipo}</div>
            <div className="mt-1 text-xs text-neutral-500">
              Total ciclos (página): {totalCiclos} • Prendas (página): {rows.length} • Total prendas:{" "}
              {totalRows}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              Regresar
            </Button>
          </div>
        </div>

        {err ? <div className="text-sm text-red-600">{err}</div> : null}
        {loading ? <div className="text-sm opacity-70">Cargando…</div> : null}

        {/* Controles paginado */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="text-neutral-600">
            Mostrando {skip + 1}–{Math.min(skip + limit, totalRows || skip + rows.length)}
          </div>

          <div className="flex items-center gap-2">
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
          </div>

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
                <th className="p-3 text-left">Ciclos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id + "|" + r.tag} className="border-t hover:bg-neutral-50">
                  <td className="p-3 font-mono text-[12px]">{r.tag}</td>
                  <td className="p-3">{r.location || "—"}</td>
                  <td className="p-3">{r.status || "—"}</td>
                  <td className="p-3">{r.ciclosLavado}</td>
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
      </div>
    </IdLinensShell>
  );
}