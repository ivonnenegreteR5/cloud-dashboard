// components/idlinens/idlinens-shell.tsx
// components/idlinens/idlinens-shell.tsx
"use client";

import { ArrowLeft } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  Search,
  PieChart,
  Repeat,
  Package,
  Clock4,
  BarChart3,
  ChevronRight,
} from "lucide-react";

type NavItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  href: string;
};

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readStr(key: string): string {
  try {
    if (typeof window === "undefined") return "";
    return String(window.localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function readAppsFromLocalStorage(): string[] {
  const apps = readJson<any>("cloudApps", []);
  if (Array.isArray(apps)) {
    return apps.map((x) => String(x || "").trim()).filter(Boolean);
  }
  return [];
}

type BrandingState = {
  tenantName: string;
  tenantLogoUrl: string;
  tenantTheme: any;
  apps: string[];
};

function readBrandingFromStorage(): BrandingState {
  return {
    tenantName: readStr("cloudTenantName"),
    tenantLogoUrl: readStr("cloudTenantLogoUrl"),
    tenantTheme: readJson<any>("cloudTenantTheme", null),
    apps: readAppsFromLocalStorage(),
  };
}

export function IdLinensShell({
  tenantId,
  title,
  children,
}: {
  tenantId: string;
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // ✅ FIX: tenant robusto (si tenantId viene vacío, lo toma de la URL)
  const safeTenant = useMemo(() => {
    const fromProp = String(tenantId || "").trim();
    if (fromProp) return fromProp;

    const path = String(pathname || "");
    const seg = path.split("/").filter(Boolean)[0]; // primer segmento
    return (seg || "demo").trim();
  }, [tenantId, pathname]);

  // ✅ Branding reactivo (para que al entrar desde superadmin se pinte)
  const [branding, setBranding] = useState<BrandingState>(() =>
    readBrandingFromStorage()
  );

  useEffect(() => {
    const refresh = () => setBranding(readBrandingFromStorage());
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [safeTenant]);

  // extra: refresh cuando cambia pathname (misma pestaña)
  useEffect(() => {
    setBranding(readBrandingFromStorage());
  }, [pathname]);

  const tenantName = branding.tenantName;
  const tenantLogoUrl = branding.tenantLogoUrl;
  const tenantTheme = branding.tenantTheme;
  const primary = tenantTheme?.primary || "";

  const apps = branding.apps;
  const canUseIdlinens = apps.includes("idlinens");

  // 🔹 Rutas base
  const base = `/${safeTenant}/idlinens`;
  const mainMenuHref = `/${safeTenant}`;

  // ✅ en desktop: rail colapsado/expandido
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // ✅ en móvil: drawer overlay
  const [mobileOpen, setMobileOpen] = useState(false);

  // 🔥 ÍCONOS MÁS GRANDES (sin cloneElement, no rompe TS)
  const items: NavItem[] = useMemo(
    () => [
      {
        key: "dist",
        label: "Distribución de prendas",
        icon: <PieChart className="h-6 w-6" />,
        href: base,
      },
      {
        key: "inv",
        label: "Inventario en Lavandería",
        icon: <Package className="h-6 w-6" />,
        href: `${base}/inv`,
      },
      {
        key: "mov",
        label: "Movimientos Diario",
        icon: <Repeat className="h-6 w-6" />,
        href: `${base}/mov`,
      },
      {
        key: "inactivos15",
        label: "Prendas con 15 o más días sin actividad",
        icon: <Clock4 className="h-6 w-6" />,
        href: `${base}/inactivos15`,
      },
      {
        key: "analysis",
        label: "Análisis de prendas",
        icon: <BarChart3 className="h-6 w-6" />,
        href: `${base}/analysis`,
      },
      {
        key: "retirados",
        label: "Retirados de Inventario",
        icon: <ChevronRight className="h-6 w-6" />,
        href: `${base}/retirados`,
      },
    ],
    [base]
  );

  // ✅ activo por URL
  const activeItem = useMemo(() => {
    if (!pathname) return items[0];

    const exact = items.find((it) => pathname === it.href);
    if (exact) return exact;

    const prefix = items.find((it) => pathname.startsWith(it.href + "/"));
    if (prefix) return prefix;

    if (pathname.startsWith(base)) return items[0];
    return items[0];
  }, [pathname, items, base]);

  const activeLabel = activeItem?.label || "Distribución de prendas";
  const activeKey = activeItem?.key || "dist";

  const onSelect = (key: string) => {
    const it = items.find((x) => x.key === key);
    if (!it) return;

    router.push(it.href);
    setMobileOpen(false);
  };

  const SidebarInner = ({ expanded }: { expanded: boolean }) => {
    return (
      <div className="flex h-full flex-col bg-white">
        {/* Encabezado del sidebar */}
        <div className={cx("p-3", expanded ? "pb-2" : "pb-3")}>
          {expanded ? (
            <div className="px-3 text-xs font-semibold text-neutral-500">
              Menú
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="h-10 w-10" />
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 pb-2">
          <ul className="space-y-1">
            {items.map((it) => {
              const active = it.key === activeKey;

              // Rail colapsado (solo iconos) -> BOTONES MÁS GRANDES
              if (!expanded) {
                return (
                  <li key={it.key} className="flex justify-center py-1">
                    <button
                      type="button"
                      onClick={() => onSelect(it.key)}
                      title={it.label}
                      aria-label={it.label}
                      className={cx(
                        "grid h-14 w-14 place-items-center rounded-2xl transition",
                        active
                          ? "bg-neutral-200 text-neutral-900"
                          : "text-neutral-700 hover:bg-neutral-100"
                      )}
                    >
                      {it.icon}
                    </button>
                  </li>
                );
              }

              // Expandido (icono + texto)
              return (
                <li key={it.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(it.key)}
                    className={cx(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                      active
                        ? "bg-neutral-200 text-neutral-900"
                        : "text-neutral-800 hover:bg-neutral-50"
                    )}
                  >
                    <span
                      className={cx(
                        "grid h-10 w-10 place-items-center rounded-lg",
                        active
                          ? "bg-white text-neutral-900"
                          : "bg-neutral-100 text-neutral-700"
                      )}
                    >
                      {it.icon}
                    </span>
                    <span className="leading-5">{it.label}</span>
                  </button>
                </li>
              );
            })}

            {/* Separador */}
            <li className="pt-2">
              <div className="border-t" />
            </li>

            {/* Regresar al menú principal */}
            {!expanded ? (
              <li className="flex justify-center pt-2">
                <Link
                  href={mainMenuHref}
                  title="Regresar al menú principal"
                  aria-label="Regresar al menú principal"
                  className="grid h-14 w-14 place-items-center rounded-2xl text-neutral-700 hover:bg-neutral-100"
                  onClick={() => setMobileOpen(false)}
                >
                  <ChevronRight className="h-6 w-6" />
                </Link>
              </li>
            ) : (
              <li className="pt-2">
                <Link
                  href={mainMenuHref}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-neutral-100 text-neutral-900">
                    <ChevronRight className="h-6 w-6" />
                  </span>
                  <span className="leading-5">Regresar al menú principal</span>
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* TOP BAR */}
      <header
        className="sticky top-0 z-20 border-b bg-white overflow-hidden"
        style={
          primary
            ? { borderBottomColor: primary, borderBottomWidth: 2 }
            : undefined
        }
      >
        {/* FULL WIDTH GRID: botón pegado a la izquierda */}
        <div className="grid w-full grid-cols-[144px_1fr] items-center h-25">
          {/* Col 1: botón del menú pegado (MISMO ANCHO QUE SIDEBAR) */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.innerWidth < 768) {
                setMobileOpen(true);
                return;
              }
              setSidebarExpanded((v) => !v);
            }}
            className={cx(
              "inline-flex h-16 w-[144px] items-center justify-center",
              "border-r border-neutral-200",
              "bg-white hover:bg-neutral-50"
            )}
            aria-label="Abrir menú"
            title="Menú"
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* Col 2: aquí sí centramos el contenido */}
          <div className="mx-auto w-full max-w-[1400px] px-4">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 h-25">
              {/* LEFT (back + logo) */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="inline-flex h-15 w-10 items-center justify-center rounded-md border bg-white hover:bg-neutral-50"
                  aria-label="Regresar"
                  title="Regresar"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>

                {tenantLogoUrl ? (
                  <img
                    src={tenantLogoUrl}
                    alt={tenantName || safeTenant}
                    className="h-27 w-auto object-contain"
                  />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-md bg-neutral-900 text-white font-bold">
                    IA
                  </div>
                )}
              </div>

              {/* CENTER */}
              <div className="min-w-0 px-2 text-center leading-tight">
                <div className="truncate text-2xl font-extrabold text-neutral-900">
                  {tenantName || safeTenant.toUpperCase()}
                </div>
                <div className="truncate text-sm text-neutral-500">{title}</div>
              </div>

              {/* RIGHT */}
              <div className="flex items-center justify-end gap-3">
                <div className="hidden w-[520px] items-center gap-2 rounded-full border bg-neutral-50 px-4 py-2 md:flex">
                  <Search className="h-4 w-4 text-neutral-500" />
                  <input
                    className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-500"
                    placeholder={`Search ${activeLabel}`}
                  />
                </div>

                <div className="grid h-10 w-10 place-items-center rounded-full bg-neutral-900 text-white font-semibold">
                  I
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Drawer móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[320px] border-r bg-white shadow-xl">
            <div className="border-b px-4 py-3 text-sm font-semibold">
              {title}
            </div>
            <SidebarInner expanded />
          </div>
        </div>
      )}

      {/* BODY */}
      <div className="flex">
        {/* Sidebar desktop */}
        <aside
          className={cx(
            "sticky top-[64px] hidden h-[calc(100vh-64px)] shrink-0 border-r bg-white md:block",
            "transition-all duration-200",
            sidebarExpanded ? "w-[280px]" : "w-[144px]"
          )}
        >
          <SidebarInner expanded={sidebarExpanded} />
        </aside>

        {/* MAIN */}
        <main className="w-full py-2">
          {/* ✅ que use todo el ancho disponible */}
          <div className="w-full">
            {/* ✅ título con padding pero contenido al ras */}
            <div className="px-4 md:px-6 mb-4">
              <div className="text-lg font-semibold">{activeLabel}</div>
            </div>

            {!canUseIdlinens ? (
              <div className="px-4 md:px-6">
                <div className="rounded-xl border bg-white p-4 text-sm text-neutral-700">
                  Este tenant no tiene habilitada la app <b>IDLinens</b>.
                </div>
              </div>
            ) : (
              // ✅ children sin max-width ni padding extra
              <div className="w-full">{children}</div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
