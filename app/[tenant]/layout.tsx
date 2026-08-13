// app/[tenant]/layout.tsx
import type { ReactNode } from "react";
import { TenantProvider } from "@/components/tenant-context";
import AssistantChat from "@/components/AssistantChat";

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  return (
    <TenantProvider tenantId={tenant}>
      {children}
      <AssistantChat />
    </TenantProvider>
  );
}