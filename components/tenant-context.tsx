// components/tenant-context.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";

export type TenantContextValue = {
  tenantId: string; // tenant del URL (routing)
  selectedTenantId: string; // tenant para DATA (superadmin)
  setSelectedTenantId: (next: string) => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

function isValidTenant(value: string) {
  const v = (value || "").trim();
  if (!v) return false;
  if (v === "undefined" || v === "null") return false;
  if (v.includes("/") || v.includes(" ")) return false;
  return true;
}

const KEY_URL_TENANT = "cloudTenantId"; // el que ya usas
const KEY_SELECTED_TENANT = "cloudSelectedTenantId"; // ✅ (superadmin)

// ✅ Helper: guarda cookie para que los app/api routes (server) puedan leer el tenant
function setTenantCookie(key: string, value: string) {
  try {
    // 1 año, disponible para todo el sitio
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // ignore
  }
}

export function TenantProvider({
  tenantId,
  children,
}: {
  tenantId: string;
  children: React.ReactNode;
}) {
  // ✅ tenant del URL (routing)
  const [resolvedTenantId, setResolvedTenantId] = useState<string>(
    (tenantId || "").trim()
  );

  // ✅ tenant seleccionado para data (superadmin)
  const [selectedTenantId, _setSelectedTenantId] = useState<string>("");

  // ✅ setter estable (persistente) + cookie
  const setSelectedTenantId = useCallback((next: string) => {
    const v = (next || "").trim();
    if (!isValidTenant(v)) return;

    _setSelectedTenantId(v);

    try {
      localStorage.setItem(KEY_SELECTED_TENANT, v);
    } catch {
      // ignore
    }

    // ✅ NUEVO: cookie para que los route handlers (server) lo pasen al backend
    setTenantCookie(KEY_SELECTED_TENANT, v);
  }, []);

  // 1) Resolver tenant del URL (tu lógica actual)
  useEffect(() => {
    const incoming = (tenantId || "").trim();

    // 1) Si llega por props, lo usamos y lo persistimos
    if (isValidTenant(incoming)) {
      setResolvedTenantId(incoming);
      try {
        localStorage.setItem(KEY_URL_TENANT, incoming);
      } catch {}
      return;
    }

    // 2) Si NO llegó por props, resolvemos desde URL
    try {
      const parts = window.location.pathname.split("/").filter(Boolean);
      const fromPath = (parts[0] || "").trim();

      if (isValidTenant(fromPath)) {
        setResolvedTenantId(fromPath);
        try {
          localStorage.setItem(KEY_URL_TENANT, fromPath);
        } catch {}
        return;
      }
    } catch {}

    // 3) Fallback storage
    try {
      const stored = (localStorage.getItem(KEY_URL_TENANT) || "").trim();
      if (isValidTenant(stored)) setResolvedTenantId(stored);
    } catch {}
  }, [tenantId]);

  // 2) Resolver selectedTenantId (para superadmin)
  // Regla: si no hay seleccionado, usa el tenant del URL como default.
  useEffect(() => {
    // carga desde storage si existe
    try {
      const storedSelected = (
        localStorage.getItem(KEY_SELECTED_TENANT) || ""
      ).trim();
      if (isValidTenant(storedSelected)) {
        _setSelectedTenantId(storedSelected);

        // ✅ NUEVO: asegura cookie alineada con storage
        setTenantCookie(KEY_SELECTED_TENANT, storedSelected);
        return;
      }
    } catch {}

    // default: el tenant del URL
    if (isValidTenant(resolvedTenantId)) {
      _setSelectedTenantId(resolvedTenantId);
      try {
        localStorage.setItem(KEY_SELECTED_TENANT, resolvedTenantId);
      } catch {}

      // ✅ NUEVO: cookie default
      setTenantCookie(KEY_SELECTED_TENANT, resolvedTenantId);
    }
  }, [resolvedTenantId]);

  const value = useMemo(
    () => ({
      tenantId: (resolvedTenantId || "").trim(),
      selectedTenantId:
        (selectedTenantId || "").trim() || (resolvedTenantId || "").trim(),
      setSelectedTenantId,
    }),
    [resolvedTenantId, selectedTenantId, setSelectedTenantId]
  );

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant debe usarse dentro de <TenantProvider>");
  return (ctx.tenantId || "").trim();
}

// ✅ nuevo hook: tenant para DATA (superadmin)
export function useSelectedTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useSelectedTenant debe usarse dentro de <TenantProvider>");
  return {
    selectedTenantId: (ctx.selectedTenantId || "").trim(),
    setSelectedTenantId: ctx.setSelectedTenantId,
  };
}
