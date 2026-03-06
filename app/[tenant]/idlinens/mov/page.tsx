//app/[tenant]/idlinens/mov/page.tsx

"use client";

import React from "react";
import { useTenant } from "@/components/tenant-context";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import MovimientosDiariosDashboard from "@/components/idlinens/MovimientosDiariosDashboard";

export default function MovimientosDiariosPage() {
  const tenantId = useTenant();

  return (
    <IdLinensShell tenantId={tenantId} title="Movimientos Diario">
      <MovimientosDiariosDashboard tenantId={tenantId} />
    </IdLinensShell>
  );
}

