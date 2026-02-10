// app/lib/apps.ts
export type AppModule =
  | "main"          // dashboard principal
  | "dline"         // graficas/reportes para hospitales
  | string;         // por si agregas nuevos

export function readAppsFromLocalStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("cloudApps") || "[]";
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function hasApp(apps: string[], key: string) {
  const a = (key || "").trim().toLowerCase();
  return apps.map((x) => String(x).toLowerCase()).includes(a);
}

