"use client";

import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

type InventoryShellProps = {
  tenantId: string;
  title?: string;
  children: ReactNode;
};

export function InventoryShell({
  tenantId,
  title = "Inventory",
  children,
}: InventoryShellProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#fafafa] text-neutral-950">
      <header className="flex h-[104px] items-center border-b bg-white px-9 relative">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/${tenantId}`)}
            className="flex h-[60px] w-[42px] items-center justify-center rounded-lg border bg-white hover:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-950 text-sm font-bold text-white">
            IN
          </div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 text-center">
          <h1 className="text-2xl font-bold leading-tight">{tenantId}</h1>
          <p className="text-sm text-neutral-500">{title}</p>
        </div>
      </header>

      <main className="w-full px-8 py-5">
        {children}
      </main>
    </div>
  );
}