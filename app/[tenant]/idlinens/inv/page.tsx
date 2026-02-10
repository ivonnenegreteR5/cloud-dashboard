// app/[tenant]/idlinens/inv/page.tsx
"use client";

import React from "react";
import { useTenant } from "@/components/tenant-context";
import { IdLinensShell } from "@/components/idlinens/idlinens-shell";
import { LavanderiaDashboard } from "../../../../components/idlinens/LavanderiaDashboard";

export default function IdLinensInvPage() {
  const tenantId = useTenant();
  const siteTitle = "ID Linens - HA Chihuahua";

  return (
    <IdLinensShell tenantId={tenantId} title={siteTitle}>
      <LavanderiaDashboard tenantId={tenantId} />
    </IdLinensShell>
  );
}
