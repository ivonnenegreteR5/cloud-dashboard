"use client";

import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InventoryPlaceholder({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 pb-8 md:px-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-neutral-100 text-neutral-800">
              {icon}
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              <div className="mt-1 text-sm text-neutral-500">{description}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Badge variant="outline">Pendiente de conectar a API</Badge>
          <div className="mt-4 rounded-xl border border-dashed bg-neutral-50 p-4 text-sm text-neutral-600">
            {children || "Aquí conectaremos datos reales cuando agreguemos los endpoints de Inventory en el server."}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
