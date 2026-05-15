"use client";

import { useEffect } from "react";

function clearClientSession() {
  try {
    localStorage.removeItem("cloudSessionToken");
    localStorage.removeItem("cloudIdToken");
    localStorage.removeItem("cloudUserEmail");
    localStorage.removeItem("cloudTenantId");
    localStorage.removeItem("cloudUserRole");
    localStorage.removeItem("cloudIsSuperAdmin");
    localStorage.removeItem("cloudApps");
    localStorage.removeItem("cloudTenantName");
    localStorage.removeItem("cloudTenantLogoUrl");
    localStorage.removeItem("cloudTenantTheme");
    localStorage.removeItem("cloudLastTenant");
    localStorage.removeItem("cloudSelectedTenantId");

    sessionStorage.clear();

    // limpiar cookies que usa tu app
    document.cookie =
      "cloudSelectedTenantId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie =
      "cloudApps=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  } catch {
    // ignore
  }
}

async function shouldLogoutFromResponse(resp: Response) {
  if (resp.status === 401 || resp.status === 403) return true;

  try {
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return false;

    const data = await resp.clone().json().catch(() => null);
    const rawMessage = String(
      data?.error || data?.message || data?.raw || ""
    ).toLowerCase();

    return (
      rawMessage.includes("token expired") ||
      rawMessage.includes("jwt expired") ||
      rawMessage.includes("session expired") ||
      rawMessage.includes("unauthorized") ||
      rawMessage.includes("unauthenticated") ||
      rawMessage.includes("invalid token") ||
      rawMessage.includes("token inválido") ||
      rawMessage.includes("token expirado") ||
      rawMessage.includes("sesión expirada") ||
      rawMessage.includes("sesion expirada")
    );
  } catch {
    return false;
  }
}

export default function SessionExpiredGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const originalFetch = window.fetch.bind(window);
    let redirecting = false;

    window.fetch = async (...args) => {
      const resp = await originalFetch(...args);

      const pathname = window.location.pathname;

      // evitar bucles cuando ya estás en login
      if (pathname === "/login") return resp;

      // evitar reaccionar al propio login
      const requestUrl =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof Request
          ? args[0].url
          : "";

      const isLoginRequest = requestUrl.includes("/api/auth/session");
      if (isLoginRequest) return resp;

      const mustLogout = await shouldLogoutFromResponse(resp);

      if (mustLogout && !redirecting) {
        redirecting = true;
        clearClientSession();
        window.location.replace("/login");
      }

      return resp;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}