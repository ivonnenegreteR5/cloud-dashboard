// components/use-apps.ts
"use client";

import { useEffect, useState } from "react";
import { readAppsFromLocalStorage } from "@/lib/apps";

export function useApps() {
  const [apps, setApps] = useState<string[]>([]);

  useEffect(() => {
    const load = () => setApps(readAppsFromLocalStorage());

    load();

    // Si cambias tenant o vuelves a loguear, se actualiza
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, []);

  return apps;
}
