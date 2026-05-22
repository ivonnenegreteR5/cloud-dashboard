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
    localStorage.removeItem("cloudSelectedTenantId");

    sessionStorage.clear();

    document.cookie = "cloudSelectedTenantId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "cloudApps=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  } catch {}
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;

  clearClientSession();
  window.location.replace("/login");
}

function isJwtExpired(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] || ""));
    const exp = Number(payload?.exp || 0);

    if (!exp) return false;

    const now = Math.floor(Date.now() / 1000);

    // margen de 30 segundos para evitar que falle justo en la llamada
    return exp <= now + 30;
  } catch {
    return false;
  }
}

function textHasExpiredTokenError(value: any) {
  const raw = JSON.stringify(value || {}).toLowerCase();

  return (
    raw.includes("token expired") ||
    raw.includes("jwt expired") ||
    raw.includes("session expired") ||
    raw.includes("unauthorized") ||
    raw.includes("unauthenticated") ||
    raw.includes("invalid token") ||
    raw.includes("expired") ||
    raw.includes("token inválido") ||
    raw.includes("token invalido") ||
    raw.includes("token expirado") ||
    raw.includes("sesión expirada") ||
    raw.includes("sesion expirada")
  );
}

async function shouldLogoutFromResponse(resp: Response) {
  if (resp.status === 401 || resp.status === 403) return true;

  try {
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return false;

    const data = await resp.clone().json().catch(() => null);
    return textHasExpiredTokenError(data);
  } catch {
    return false;
  }
}

export default function SessionExpiredGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let redirecting = false;

    const safeRedirect = () => {
      if (redirecting) return;
      redirecting = true;
      redirectToLogin();
    };

    const checkStoredToken = () => {
      if (window.location.pathname === "/login") return;

      const idToken = String(localStorage.getItem("cloudIdToken") || "").trim();
      const sessionToken = String(localStorage.getItem("cloudSessionToken") || "").trim();

      // Si estás dentro del dashboard y ya no hay tokens, saca al login
      if (!idToken || !sessionToken) {
        safeRedirect();
        return;
      }

      // Si el JWT Firebase ya caducó, saca al login aunque estés en IdLinens o Inventory
      if (isJwtExpired(idToken)) {
        safeRedirect();
      }
    };

    checkStoredToken();

    const interval = window.setInterval(checkStoredToken, 30000);

    window.addEventListener("focus", checkStoredToken);
    document.addEventListener("visibilitychange", checkStoredToken);

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const resp = await originalFetch(...args);

      if (window.location.pathname === "/login") return resp;

      const requestUrl =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof Request
          ? args[0].url
          : "";

      if (requestUrl.includes("/api/auth/session")) return resp;

      const mustLogout = await shouldLogoutFromResponse(resp);

      if (mustLogout) {
        safeRedirect();
      }

      return resp;
    };

    return () => {
      window.fetch = originalFetch;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkStoredToken);
      document.removeEventListener("visibilitychange", checkStoredToken);
    };
  }, []);

  return null;
}