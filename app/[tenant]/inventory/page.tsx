//app/[tenant]/inventory/page.tsx

import { InventoryDashboard } from "@/components/inventory/inventory-dashboard";
import { InventoryShell } from "@/components/inventory/inventory-shell";

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  return (
    <InventoryShell tenantId={tenant} title="Inventory">
      <InventoryDashboard tenantId={tenant} />
    </InventoryShell>
  );
}
