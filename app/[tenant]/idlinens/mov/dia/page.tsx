//app/[tenant]/idlinens/mov/dia/page.tsx

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import {
  fetchReportsByDate,
  type ReportItem,
} from "@/components/idlinens/api";

function fmtDia(dia: string) {
  if (!dia) return "";
  const [y, m, d] = dia.split("-").map(Number);
  if (!y || !m || !d) return dia;
  return `${d}/${m}/${y}`;
}

function fmtTime(rep: ReportItem) {
  const raw =
    rep.ranAtIso ||
    (rep.ranAt ? new Date(rep.ranAt * 1000).toISOString() : "");

  if (!raw) return rep.id;

  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) return dt.toLocaleString("es-MX");
  return String(raw);
}

export default function MovimientosDiaPage() {
  const tenantId = useTenant();
  const router = useRouter();
  const sp = useSearchParams();
  const dia = (sp.get("dia") || "").slice(0, 10);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!dia) {
        setLoading(false);
        setErr("Falta ?dia=YYYY-MM-DD en la URL");
        return;
      }

      try {
        setLoading(true);
        setErr(null);

        const items = await fetchReportsByDate(tenantId, dia, 100);
        if (!alive) return;

        const sorted = [...items].sort((a, b) => {
          const ta =
            (a.ranAt ? Number(a.ranAt) * 1000 : NaN) ||
            (a.ranAtIso ? new Date(a.ranAtIso).getTime() : NaN) ||
            0;

          const tb =
            (b.ranAt ? Number(b.ranAt) * 1000 : NaN) ||
            (b.ranAtIso ? new Date(b.ranAtIso).getTime() : NaN) ||
            0;

          return tb - ta;
        });

        setReports(sorted);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error cargando reportes del día");
        setReports([]);
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

  async function handleDownload(rep: ReportItem) {
    try {
      setDownloadingId(rep.id);
      setErr(null);

      const idToken =
        typeof window !== "undefined"
          ? localStorage.getItem("cloudIdToken") || ""
          : "";

      if (!idToken) {
        throw new Error("No se encontró cloudIdToken. Vuelve a iniciar sesión.");
      }

      const resp = await fetch(
        `/api/idlinens/reports/download?id=${encodeURIComponent(rep.id)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "x-tenant-id": tenantId,
          },
          cache: "no-store",
        }
      );

      if (!resp.ok) {
        let msg = "Error descargando PDF";

        try {
          const data = await resp.json();
          msg =
            data?.details?.message ||
            data?.details?.error ||
            data?.error ||
            msg;
        } catch {
          // ignore
        }

        throw new Error(msg);
      }

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = rep.filename || `reporte-${rep.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e?.message || "No se pudo descargar el PDF");
    } finally {
      setDownloadingId(null);
    }
  }

  const title = useMemo(() => `Reportes del día ${fmtDia(dia)}`, [dia]);

  return (
    <IdLinensShell tenantId={tenantId} title={title}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <button
            type="button"
            className="rounded-md px-2 py-1 hover:bg-neutral-100"
            onClick={() => router.back()}
          >
            ← Regresar
          </button>
          <span className="text-neutral-400">·</span>
          <span className="text-neutral-700">{fmtDia(dia)}</span>
        </div>

        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Error: {err}
          </div>
        )}

        <div className="rounded-lg border bg-white">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="font-semibold">Listado de recibos Entradas / Salidas</div>
            <div className="text-xs text-neutral-500">{reports.length}</div>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-neutral-600">Cargando…</div>
          ) : (
            <div className="divide-y">
              {reports.map((rep) => (
                <div
                  key={rep.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{fmtTime(rep)}</div>
                    {rep.filename ? (
                      <div
                        className="truncate text-xs text-neutral-500"
                        title={rep.filename}
                      >
                        {rep.filename}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="shrink-0 rounded-md border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
                    onClick={() => handleDownload(rep)}
                    disabled={downloadingId === rep.id}
                    title="Descargar PDF"
                  >
                    {downloadingId === rep.id ? "Descargando..." : "Descargar PDF"}
                  </button>
                </div>
              ))}

              {!reports.length && (
                <div className="p-6 text-sm text-neutral-600">
                  No hay reportes generados para este día.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </IdLinensShell>
  );
}