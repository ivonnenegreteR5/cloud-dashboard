// components/app-header.tsx
"use client";

import React, { useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ✅ helper: leer apps (módulos) desde localStorage
function readAppsFromLocalStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("cloudApps") || "[]";
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function hasApp(apps: string[], key: string) {
  const k = String(key || "").trim().toLowerCase();
  return apps.some((x) => String(x || "").trim().toLowerCase() === k);
}

export function AppHeader() {
  const tenantId = useTenant() as string;
  const router = useRouter();
  const pathname = usePathname();

  const base = `/${tenantId}`;

  const go = (path: string) => router.push(path);

  const isActive = (path: string) => {
    if (path === base) return pathname === base;
    return pathname.startsWith(path);
  };

  // ✅ Rol (viene de tu API y lo guardas en login como "cloudUserRole")
  const role =
    (typeof window !== "undefined"
      ? localStorage.getItem("cloudUserRole")
      : null) || "user";

  const roleLower = role.toLowerCase();

  // ✅ Los 3 roles deben tener los mismos permisos
  const isAdminLike =
    roleLower === "admin" ||
    roleLower === "admin_location" ||
    roleLower === "superadmin";

  // ✅ Apps habilitadas para este tenant (guardadas en login o superadmin select)
  const apps = useMemo(() => readAppsFromLocalStorage(), []);
  const showIdLinens = hasApp(apps, "idlinens");

  // 👉 Cerrar sesión y regresar al login
  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    router.push("/login");
  };

  return (
    <header className="border-b bg-white">
      {/* Barra superior */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <span className="text-xl font-semibold tracking-tight">Cloud API</span>

        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-600">Cliente:</span>
          <span className="rounded-md border bg-neutral-50 px-3 py-1 text-sm">
            {tenantId}
          </span>
        </div>
      </div>

      {/* Barra de menús */}
      <div className="border-t">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
         {/* Menú 1 (SIEMPRE visible) */}
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button
      variant="outline"
      className="justify-between gap-2 bg-white px-5 py-2 text-sm shadow-sm"
    >
      <span className="font-semibold">Menú</span>
      <ChevronDown className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>

  <DropdownMenuContent className="w-64">
    <DropdownMenuLabel>Opciones</DropdownMenuLabel>
    <DropdownMenuSeparator />

    <DropdownMenuItem
      className={isActive(base) ? "bg-neutral-100 font-semibold" : ""}
      onClick={() => go(base)}
    >
      Pantalla principal
    </DropdownMenuItem>

    <DropdownMenuItem
      className={
        isActive(`${base}/ubicaciones`)
          ? "bg-neutral-100 font-semibold"
          : ""
      }
      onClick={() => go(`${base}/ubicaciones`)}
    >
      Ubicaciones
    </DropdownMenuItem>

    <DropdownMenuItem
      className={
        isActive(`${base}/transactions`)
          ? "bg-neutral-100 font-semibold"
          : ""
      }
      onClick={() => go(`${base}/transactions`)}
    >
      Transacciones
    </DropdownMenuItem>

    <DropdownMenuItem
      className={
        isActive(`${base}/activos`)
          ? "bg-neutral-100 font-semibold"
          : ""
      }
      onClick={() => go(`${base}/activos`)}
    >
      Administrar activos
    </DropdownMenuItem>

    {/* 🔥 IDLINENS – APARTADO ESPECIAL */}
    {showIdLinens && (
      <>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          className={
            `
            font-semibold text-neutral-900
            bg-neutral-50
            hover:bg-neutral-200
            focus:bg-neutral-200
            border border-neutral-300
            mx-2 my-1 rounded-md
            ` +
            (isActive(`${base}/idlinens`)
              ? " bg-neutral-900 text-white hover:bg-neutral-900"
              : "")
          }
          onClick={() => go(`${base}/idlinens`)}
        >
          IDLinens
        </DropdownMenuItem>

        <DropdownMenuSeparator />
      </>
    )}
  </DropdownMenuContent>
</DropdownMenu>


          {/* Menú 2 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="justify-between gap-2 bg-white px-5 py-2 text-sm shadow-sm"
              >
                <span className="font-semibold">Menú principal</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-80">
              <DropdownMenuLabel>Opciones de usuario</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* ✅ Siempre visible */}
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-600 focus:text-red-600"
              >
                Cerrar sesión
              </DropdownMenuItem>

              {/* ✅ Admin / Admin_location / Super_admin ven el resto */}
              {isAdminLike && (
                <>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    className={
                      isActive(`${base}/usuarios/nuevo`)
                        ? "bg-neutral-100 font-semibold"
                        : ""
                    }
                    onClick={() => go(`${base}/usuarios/nuevo`)}
                  >
                    Alta de Usuarios
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className={
                      isActive(`${base}/config/campos-personalizados`)
                        ? "bg-neutral-100 font-semibold"
                        : ""
                    }
                    onClick={() => go(`${base}/config/campos-personalizados`)}
                  >
                    Alta Campos personalizados
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
