// app/[tenant]/activos/page.tsx

"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTenant } from "@/components/tenant-context";
import { AppHeader } from "@/components/app-header";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Edit2,
  Trash2,
  EllipsisVertical,
  ArrowUp,
  ArrowDown,
  Filter as FilterIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";
import type { DragEndEvent } from "@dnd-kit/core";

// ===================== Tipos =====================

interface Asset {
  id?: string;
  _id?: string;
  AssetTag?: string;
  AssetType?: string;
  Location?: string;
  locationId?: string;
  Status?: string;
  status?: string;
  ts?: number;
  Created?: number;
  LastSeen?: number;
  updatedAt?: number;
  PersonnelName?: string;
  raw?: any;
  custom?: Record<string, any>;
  [key: string]: any;
}

interface Row {
  id: string;
  docId: string;
  epc: string;
  tipo: string;
  ubicacion: string;
  activo: string;
  empleado: string;
  creado: string;
  ultima: string;
  createdSec: number;
  lastSeenSec: number;
  custom?: Record<string, any>;
}

type FilterMode = "contains" | "startsWith" | "endsWith" | null;

type ColumnId =
  | "estado"
  | "ubicacion"
  | "nombreActivo"
  | "rfid"
  | "empleado"
  | "creado"
  | "ultima";

interface ColumnDef {
  id: ColumnId;
  label: string;
  getValue: (row: Row) => string;
}

const columns: ColumnDef[] = [
  { id: "estado", label: "Estado", getValue: (r) => r.tipo },
  { id: "ubicacion", label: "Nombre Ubicación", getValue: (r) => r.ubicacion },
  { id: "nombreActivo", label: "Nombre de Activo", getValue: (r) => r.activo },
  { id: "rfid", label: "Número RFID", getValue: (r) => r.epc },
  { id: "empleado", label: "Empleado Nombre", getValue: (r) => r.empleado },
  { id: "creado", label: "Creado", getValue: (r) => r.creado },
  { id: "ultima", label: "Última vez vista", getValue: (r) => r.ultima },
];

interface ColumnFilter {
  mode: FilterMode;
  value: string;
}

type AnyColumnKey = string;
type DisplayColumnKey = `base:${ColumnId}` | `custom:${string}`;
type FiltersState = Partial<Record<AnyColumnKey, ColumnFilter>>;

type SortDirection = "asc" | "desc" | null;
interface SortState {
  column: AnyColumnKey | null;
  direction: SortDirection;
}

interface AssetCustomFieldDef {
  key: string;
  label: string;
  type?: string;
  readOnly?: boolean;
}

// ===================== Helpers =====================

function normalizeCustomFieldType(
  t?: string
): "text" | "number" | "date" | "boolean" {
  const v = String(t || "").toLowerCase().trim();
  if (v === "number" || v === "numeric" || v === "int" || v === "float") {
    return "number";
  }
  if (v === "date" || v === "datetime") return "date";
  if (v === "boolean" || v === "bool") return "boolean";
  return "text";
}

function sanitizeCustom(
  defs: AssetCustomFieldDef[],
  values: Record<string, any>
): Record<string, any> {
  const out: Record<string, any> = {};
  const defMap = new Map(defs.map((d) => [d.key, d]));

  for (const [k, raw] of Object.entries(values || {})) {
    const def = defMap.get(k);
    const t = normalizeCustomFieldType(def?.type);

    if (raw === undefined || raw === null) continue;

    if (t === "boolean") {
      out[k] = Boolean(raw);
      continue;
    }

    if (typeof raw === "string") {
      const s = raw.trim();
      if (!s) continue;

      if (t === "number") {
        const n = Number(s);
        if (Number.isFinite(n)) out[k] = n;
        continue;
      }

      out[k] = s;
      continue;
    }

    if (t === "number") {
      const n = Number(raw);
      if (Number.isFinite(n)) out[k] = n;
      continue;
    }

    out[k] = raw;
  }

  return out;
}

const FIXED_TIMEZONE = "America/Mexico_City";

function normalizeEpochSeconds(ts: any): number | null {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 1e12) return Math.floor(n / 1000);
  return Math.floor(n);
}

function formatUnix(tsSecAny: any): string {
  const sec = normalizeEpochSeconds(tsSecAny);
  if (!sec) return "-";

  const d = new Date(sec * 1000);

  return new Intl.DateTimeFormat("es-MX", {
    timeZone: FIXED_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function resolveEstadoFromAsset(a: any): "nuevos" | null {
  const loc = String(
    a?.Location ?? a?.locationId ?? a?.raw?.Location ?? a?.raw?.locationId ?? ""
  )
    .trim()
    .toLowerCase();

  const st = String(
    a?.status ?? a?.Status ?? a?.raw?.status ?? a?.raw?.Status ?? ""
  )
    .trim()
    .toLowerCase();

  if (loc === "nuevos" && st === "created") return "nuevos";

  return null;
}
function getUbicacionVisual(a: any): string {
  const loc = String(
    a?.Location ??
      a?.locationId ??
      a?.raw?.Location ??
      a?.raw?.locationId ??
      "Sin ubicación"
  ).trim();

  return loc || "Sin ubicación";
}

function getEstadoVisual(a: any): string {
  const raw = String(
    a?.status ?? a?.Status ?? a?.raw?.status ?? a?.raw?.Status ?? ""
  ).trim();

  const lower = raw.toLowerCase();

  if (lower === "created") return "Creado";
  if (lower === "in" || lower === "checked in" || lower === "entrada") return "Entrada";
  if (lower === "out" || lower === "checked out" || lower === "salida") return "Salida";

  return raw || "N/A";
}

function FilterTextBox({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <Input
      placeholder="Escribe el texto a buscar…"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          onCommit(localValue);
        }
      }}
      onBlur={() => onCommit(localValue)}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

// ===================== Página =====================

export default function AdministrarActivosPage() {
  const tenantFromContext = useTenant() as string | undefined;

  const tenantForRequests =
    tenantFromContext && tenantFromContext.trim().length > 0
      ? tenantFromContext
      : "demo";

  const router = useRouter();

  const role =
    (typeof window !== "undefined"
      ? localStorage.getItem("cloudUserRole")
      : null) || "user";

  const roleLower = role.toLowerCase();
  const isAdmin =
    roleLower === "admin" ||
    roleLower === "admin_location" ||
    roleLower === "superadmin";

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const COLUMN_ORDER_STORAGE_KEY = `cloud:columnOrder:${tenantForRequests}:assets`;
  const [columnOrder, setColumnOrder] = useState<DisplayColumnKey[]>([]);

  const [filters, setFilters] = useState<FiltersState>({});
  const [sort, setSort] = useState<SortState>({
    column: "base:ultima",
    direction: "desc",
  });

  const [pageSize, setPageSize] = useState<number>(100);
  const [page, setPage] = useState<number>(1);
  const [totalApiAssets, setTotalApiAssets] = useState<number | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const [newCustom, setNewCustom] = useState<Record<string, any>>({});

  const [customFieldsFromApi, setCustomFieldsFromApi] = useState<
    AssetCustomFieldDef[]
  >([]);
  const [customFieldsError, setCustomFieldsError] = useState<string | null>(null);

  const openMenusCountRef = useRef(0);
  const [isAnyMenuOpen, setIsAnyMenuOpen] = useState(false);
  const refreshNowRef = useRef<() => void>(() => {});

  const handleAnyMenuOpenChange = useCallback((open: boolean) => {
    if (open) openMenusCountRef.current += 1;
    else openMenusCountRef.current = Math.max(0, openMenusCountRef.current - 1);

    const anyOpen = openMenusCountRef.current > 0;
    setIsAnyMenuOpen(anyOpen);

    if (!anyOpen) {
      setTimeout(() => {
        try {
          refreshNowRef.current?.();
        } catch {
          // ignore
        }
      }, 0);
    }
  }, []);

  const HIDDEN_BASECOLS_STORAGE_KEY = `cloud:hiddenBaseColumns:${tenantForRequests}:assets`;
  const [hiddenBaseCols, setHiddenBaseCols] = useState<Set<ColumnId>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_BASECOLS_STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const clean = arr
          .map((x) => String(x))
          .filter((x) =>
            [
              "estado",
              "ubicacion",
              "nombreActivo",
              "rfid",
              "empleado",
              "creado",
              "ultima",
            ].includes(x)
          ) as ColumnId[];
        setHiddenBaseCols(new Set(clean));
      }
    } catch {
      // ignore
    }
  }, [tenantForRequests]);

  useEffect(() => {
    try {
      localStorage.setItem(
        HIDDEN_BASECOLS_STORAGE_KEY,
        JSON.stringify(Array.from(hiddenBaseCols))
      );
    } catch {
      // ignore
    }
  }, [hiddenBaseCols, tenantForRequests]);

  const isHiddenBase = (id: ColumnId) => hiddenBaseCols.has(id);

  const toggleBaseColumn = (id: ColumnId) => {
    setHiddenBaseCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const HIDDEN_CF_STORAGE_KEY = `cloud:hiddenCustomFields:${tenantForRequests}:assets`;
  const [hiddenCustomKeys, setHiddenCustomKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_CF_STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        setHiddenCustomKeys(new Set(arr.map((x) => String(x))));
      }
    } catch {
      // ignore
    }
  }, [tenantForRequests]);

  useEffect(() => {
    try {
      localStorage.setItem(
        HIDDEN_CF_STORAGE_KEY,
        JSON.stringify(Array.from(hiddenCustomKeys))
      );
    } catch {
      // ignore
    }
  }, [hiddenCustomKeys, tenantForRequests]);

  const isHiddenCustom = (key: string) => hiddenCustomKeys.has(String(key));

  const toggleCustomColumn = (key: string) => {
    const k = String(key);
    setHiddenCustomKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const showAllColumns = () => {
    setHiddenBaseCols(new Set());
    setHiddenCustomKeys(new Set());
  };

  const baseKey = (id: ColumnId) => `base:${id}`;
  const customKey = (key: string) => `custom:${String(key)}`;

  const getValueByKey = (row: Row, key: AnyColumnKey) => {
    if (key.startsWith("base:")) {
      const id = key.replace("base:", "") as ColumnId;
      const col = columns.find((c) => c.id === id);
      return col ? String(col.getValue(row) ?? "") : "";
    }
    if (key.startsWith("custom:")) {
      const k = key.replace("custom:", "");
      const raw =
        row.custom && Object.prototype.hasOwnProperty.call(row.custom, k)
          ? row.custom[k]
          : "";
      return raw === undefined || raw === null ? "" : String(raw);
    }
    return "";
  };

  const hayFiltrosActivos = useMemo(
    () =>
      Object.values(filters).some((f) => f && f.mode && f.value.trim() !== ""),
    [filters]
  );

  const fetchAssets = async (
    tenantId: string,
    sToken: string,
    iToken: string,
    opts?: { preserveUi?: boolean; silent?: boolean; page?: number; pageSize?: number }
  ) => {
    const preserveUi = Boolean(opts?.preserveUi);
    const silent = Boolean(opts?.silent);
    const p = Math.max(1, Number(opts?.page ?? page));
    const ps = Math.max(1, Math.min(Number(opts?.pageSize ?? pageSize), 500));
    const skip = (p - 1) * ps;

    const isSearching = Object.values(filters).some(
      (f) => f && f.mode && f.value.trim() !== ""
    );

    const url = isSearching
      ? `/api/cloud/assets/search?limit=${ps}&skip=${skip}&_ts=${Date.now()}`
      : `/api/cloud/assets?limit=${ps}&skip=${skip}&_ts=${Date.now()}`;

    try {
      if (!silent) setLoading(true);
      setError(null);

      const resp = await fetch(url, {
        method: isSearching ? "POST" : "GET",
        cache: "no-store",
        headers: {
          "x-session-token": sToken,
          Authorization: `Bearer ${iToken}`,
          "x-tenant-id": tenantId,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
        body: isSearching ? JSON.stringify({ filters }) : undefined,
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data.ok) {
        throw new Error(data.error || "Error cargando activos");
      }

      const lista = Array.isArray(data.assets) ? data.assets : [];

      lista.sort((a: any, b: any) => {
        const va =
          Number(
            a?.LastSeen ??
              a?.lastSeen ??
              a?.updatedAt ??
              a?.raw?.LastSeen ??
              a?.raw?.lastSeen ??
              a?.raw?.updatedAt ??
              0
          ) || 0;

        const vb =
          Number(
            b?.LastSeen ??
              b?.lastSeen ??
              b?.updatedAt ??
              b?.raw?.LastSeen ??
              b?.raw?.lastSeen ??
              b?.raw?.updatedAt ??
              0
          ) || 0;

        if (vb !== va) return vb - va;

        const ca =
          Number(a?.Created ?? a?.ts ?? a?.raw?.Created ?? a?.raw?.ts ?? 0) || 0;
        const cb =
          Number(b?.Created ?? b?.ts ?? b?.raw?.Created ?? b?.raw?.ts ?? 0) || 0;

        return cb - ca;
      });

      setAssets(lista);
      setTotalApiAssets(typeof data.total === "number" ? data.total : null);

      if (!preserveUi) setSelectedIds(new Set());
    } catch (err: any) {
      console.error("Error cargando assets (administrar):", err);
      setError(err.message || "Error al cargar activos");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchCustomFields = async (
    tenantId: string,
    sToken: string,
    iToken: string
  ) => {
    try {
      setCustomFieldsError(null);

      const resp = await fetch(
        `/api/cloud/custom-fields?tenantId=${encodeURIComponent(
          String(tenantId)
        )}&_ts=${Date.now()}`,
        {
          cache: "no-store",
          headers: {
            "x-session-token": sToken,
            Authorization: `Bearer ${iToken}`,
            "x-tenant-id": String(tenantId),
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        }
      );

      const text = await resp.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setCustomFieldsError("No se pudieron cargar los campos personalizados.");
        setCustomFieldsFromApi([]);
        return;
      }

      if (!resp.ok || data.ok === false) {
        setCustomFieldsError(
          data.error || "No se pudieron cargar los campos personalizados."
        );
        setCustomFieldsFromApi([]);
      } else {
        setCustomFieldsFromApi(Array.isArray(data.items) ? data.items : []);
      }
    } catch (err: any) {
      console.error("Error cargando custom fields:", err);
      setCustomFieldsError(
        err?.message || "No se pudieron cargar los campos personalizados."
      );
      setCustomFieldsFromApi([]);
    }
  };

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [pageSize, tenantFromContext]);

  useEffect(() => {
    const sToken = localStorage.getItem("cloudSessionToken");
    const iToken = localStorage.getItem("cloudIdToken");

    if (!sToken || !iToken) {
      router.push("/login");
      return;
    }

    setSessionToken(sToken);
    setIdToken(iToken);

    const tenantStr = tenantForRequests;

    fetchAssets(tenantStr, sToken, iToken, { preserveUi: false, page, pageSize });
    fetchCustomFields(tenantStr, sToken, iToken);
  }, [router, tenantForRequests, page, filters]);

  useEffect(() => {
    if (!sessionToken || !idToken) return;
    if (hayFiltrosActivos) return;

    let cancelled = false;
    let running = false;

    const run = async () => {
      if (cancelled || running) return;
      if (isAnyMenuOpen) return;

      running = true;
      try {
        await fetchAssets(String(tenantForRequests), sessionToken, idToken, {
          preserveUi: true,
          silent: true,
          page,
          pageSize,
        });
      } finally {
        running = false;
      }
    };

    refreshNowRef.current = run;

    const interval = window.setInterval(run, 2_000);

    const onFocus = () => run();
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    run();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      refreshNowRef.current = () => {};
    };
  }, [
    sessionToken,
    idToken,
    tenantForRequests,
    isAnyMenuOpen,
    page,
    pageSize,
    hayFiltrosActivos,
  ]);

  const EXTRA_EDITABLE_CUSTOM_FIELDS: AssetCustomFieldDef[] = useMemo(() => {
    return [
      {
        key: "ciclosLavado",
        label: "Ciclos de lavado",
        type: "number",
        readOnly: false,
      },
    ];
  }, []);

  const customFieldsForForms: AssetCustomFieldDef[] = useMemo(() => {
    const map = new Map<string, AssetCustomFieldDef>();

    for (const cf of customFieldsFromApi || []) {
      if (!cf?.key) continue;
      map.set(String(cf.key), {
        key: String(cf.key),
        label: cf.label || String(cf.key),
        type: cf.type,
        readOnly: cf.readOnly,
      });
    }

    for (const cf of EXTRA_EDITABLE_CUSTOM_FIELDS) {
      const k = String(cf.key);
      if (!map.has(k)) map.set(k, cf);
    }

    return Array.from(map.values()).sort((a, b) =>
      String(a.label || a.key).localeCompare(String(b.label || b.key))
    );
  }, [customFieldsFromApi, EXTRA_EDITABLE_CUSTOM_FIELDS]);

  useEffect(() => {
    if (!customFieldsForForms || customFieldsForForms.length === 0) return;

    setNewCustom((prev) => {
      const next = { ...prev };
      for (const cf of customFieldsForForms) {
        if (!cf?.key) continue;
        if (isHiddenCustom(cf.key)) continue;
        if (Object.prototype.hasOwnProperty.call(next, cf.key)) continue;

        const t = normalizeCustomFieldType(cf.type);
        if (t === "boolean") next[cf.key] = false;
        else next[cf.key] = "";
      }
      return next;
    });
  }, [customFieldsForForms, hiddenCustomKeys]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setColumnOrder(parsed as DisplayColumnKey[]);
      }
    } catch {
      // ignore
    }
  }, [COLUMN_ORDER_STORAGE_KEY]);

  useEffect(() => {
    try {
      localStorage.setItem(
        COLUMN_ORDER_STORAGE_KEY,
        JSON.stringify(columnOrder)
      );
    } catch {
      // ignore
    }
  }, [COLUMN_ORDER_STORAGE_KEY, columnOrder]);

  const allCustomFields: AssetCustomFieldDef[] = useMemo(() => {
    const map = new Map<string, AssetCustomFieldDef>();

    for (const cf of customFieldsFromApi || []) {
      if (!cf?.key) continue;
      map.set(String(cf.key), {
        key: String(cf.key),
        label: cf.label || String(cf.key),
        type: cf.type,
        readOnly: cf.readOnly,
      });
    }

    for (const cf of EXTRA_EDITABLE_CUSTOM_FIELDS) {
      const k = String(cf.key);
      if (!map.has(k)) map.set(k, cf);
    }

    for (const a of assets || []) {
      const c =
        (a && a.custom) ||
        (a && a.raw && (a.raw.custom as Record<string, any>)) ||
        null;
      if (!c || typeof c !== "object") continue;

      for (const k of Object.keys(c)) {
        const key = String(k || "").trim();
        if (!key) continue;
        if (key === "lastCicloAt") continue;

        if (!map.has(key)) {
          map.set(key, { key, label: key });
        }
      }
    }

    const items = Array.from(map.values()).filter((cf) => {
      const k = String(cf.key || "").trim();
      if (!k) return false;
      if (k.toLowerCase() === "undefined") return false;
      return true;
    });

    items.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return items;
  }, [assets, customFieldsFromApi, EXTRA_EDITABLE_CUSTOM_FIELDS]);

  const visibleCustomFields = useMemo(
    () => allCustomFields.filter((cf) => !isHiddenCustom(cf.key)),
    [allCustomFields, hiddenCustomKeys]
  );

  const allVisibleColumnKeys = useMemo<DisplayColumnKey[]>(() => {
    const baseKeys = columns
      .filter((c) => !isHiddenBase(c.id))
      .map((c) => `base:${c.id}` as DisplayColumnKey);

    const customKeys = visibleCustomFields.map(
      (cf) => `custom:${cf.key}` as DisplayColumnKey
    );

    return [...baseKeys, ...customKeys];
  }, [visibleCustomFields, hiddenBaseCols]);

  useEffect(() => {
    setColumnOrder((prev) => {
      if (!prev.length) return allVisibleColumnKeys;

      const validPrev = prev.filter((k) => allVisibleColumnKeys.includes(k));
      const missing = allVisibleColumnKeys.filter((k) => !validPrev.includes(k));

      return [...validPrev, ...missing];
    });
  }, [allVisibleColumnKeys]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    setColumnOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id) as DisplayColumnKey);
      const newIndex = prev.indexOf(String(over.id) as DisplayColumnKey);

      if (oldIndex < 0 || newIndex < 0) return prev;

      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const orderedVisibleColumns = useMemo(() => {
    return columnOrder
      .map((key) => {
        if (key.startsWith("base:")) {
          const id = key.replace("base:", "") as ColumnId;
          const col = columns.find((c) => c.id === id);
          if (!col || isHiddenBase(id)) return null;

          return {
            key,
            kind: "base" as const,
            col,
          };
        }

        if (key.startsWith("custom:")) {
          const customId = key.replace("custom:", "");
          const cf = visibleCustomFields.find((x) => x.key === customId);
          if (!cf) return null;

          return {
            key,
            kind: "custom" as const,
            cf,
          };
        }

        return null;
      })
      .filter(Boolean);
  }, [columnOrder, visibleCustomFields, hiddenBaseCols]);

  const baseRows: Row[] = useMemo(() => {
    return (assets || []).map((a: Asset) => {
      const docId = String(a._id || a.id || "").trim();

      const statusRaw =
        (a.status || a.Status || a.raw?.status || a.raw?.Status || "")?.toString() || "";

      const statusLower = statusRaw.toLowerCase();

      const tipo =
        statusLower === "in" ||
        statusLower === "checked in" ||
        statusLower === "entrada"
          ? "Entrada"
          : statusLower === "out" ||
              statusLower === "checked out" ||
              statusLower === "salida"
            ? "Salida"
            : statusLower === "created"
              ? "Creado"
              : statusRaw || "N/A";

      const tag =
        a.AssetTag || a.tag || a.code || a.raw?.AssetTag || a.raw?.tag || "-";

      const type =
        a.AssetType || a.type || a.raw?.AssetType || a.raw?.type || "-";

      const loc = getUbicacionVisual(a);

      const empleado =
        a.PersonnelName || a.raw?.PersonnelName || a.raw?.personnelName || "-";

      const createdTs = a.Created ?? a.raw?.Created ?? a.ts ?? a.raw?.ts ?? 0;
      const lastSeenTs =
        a.LastSeen ??
        a.raw?.LastSeen ??
        a.lastSeen ??
        a.raw?.lastSeen ??
        a.updatedAt ??
        a.raw?.updatedAt ??
        0;

      const createdSecNum = normalizeEpochSeconds(createdTs) ?? 0;
      const lastSeenSecNum = normalizeEpochSeconds(lastSeenTs) ?? 0;

      const creado = formatUnix(createdTs);
      const ultima = formatUnix(lastSeenTs);

      const customFromAsset: Record<string, any> =
        a.custom || (a.raw?.custom as Record<string, any>) || {};

      const uiId = docId || String(tag || "sin-id");

      return {
        id: uiId,
        docId,
        epc: tag,
        tipo,
        ubicacion: loc,
        activo: type,
        empleado,
        creado,
        ultima,
        createdSec: createdSecNum,
        lastSeenSec: lastSeenSecNum,
        custom: customFromAsset,
      };
    });
  }, [assets]);

  const dataFiltradaYOrdenada = useMemo(() => {
    let rows = [...baseRows];

    rows = rows.filter((row) => {
      return Object.entries(filters).every(([key, filter]) => {
        if (!filter || !filter.mode || !filter.value.trim()) return true;

        const raw = getValueByKey(row, key);
        const v = raw.toString().toLowerCase();
        const target = filter.value.toLowerCase();

        switch (filter.mode) {
          case "contains":
            return v.includes(target);
          case "startsWith":
            return v.startsWith(target);
          case "endsWith":
            return v.endsWith(target);
          default:
            return true;
        }
      });
    });

    if (sort.column && sort.direction) {
      rows.sort((a, b) => {
        const col = sort.column!;

        if (col === "base:creado") {
          const va = a.createdSec || 0;
          const vb = b.createdSec || 0;
          return sort.direction === "asc" ? va - vb : vb - va;
        }

        if (col === "base:ultima") {
          const va = a.lastSeenSec || 0;
          const vb = b.lastSeenSec || 0;
          return sort.direction === "asc" ? va - vb : vb - va;
        }

        const va = getValueByKey(a, col).toLowerCase();
        const vb = getValueByKey(b, col).toLowerCase();
        if (va < vb) return sort.direction === "asc" ? -1 : 1;
        if (va > vb) return sort.direction === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      rows.sort((a, b) => {
        const aKey = (a.lastSeenSec || 0) || (a.createdSec || 0);
        const bKey = (b.lastSeenSec || 0) || (b.createdSec || 0);
        return bKey - aKey;
      });
    }

    return rows;
  }, [baseRows, filters, sort]);

  const totalParaCard = totalApiAssets ?? baseRows.length;

  const totalSeleccionados = dataFiltradaYOrdenada.filter((r) =>
    selectedIds.has(r.id)
  ).length;

  const handleSetFilterMode = (columnKey: AnyColumnKey, mode: FilterMode) => {
    setFilters((prev) => ({
      ...prev,
      [columnKey]: { mode, value: prev[columnKey]?.value ?? "" },
    }));
    setPage(1);
    setSelectedIds(new Set());
  };

const handleSetFilterValue = (columnKey: AnyColumnKey, value: string) => {
  setFilters((prev) => {
    const nextValue = value.trim();

    if (!nextValue) {
      const next = { ...prev };
      delete next[columnKey];
      return next;
    }

    return {
      ...prev,
      [columnKey]: {
        mode: prev[columnKey]?.mode ?? "contains",
        value,
      },
    };
  });

  setPage(1);
  setSelectedIds(new Set());
};

  const handleClearFilters = () => {
    setFilters({});
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleSort = (columnKey: AnyColumnKey, direction: SortDirection) => {
    setSort({ column: columnKey, direction });
  };

  const handleClearSort = () => {
    setSort({ column: null, direction: null });
  };

  const handleEdit = (uiId: string) => {
    const row = dataFiltradaYOrdenada.find((r) => r.id === uiId);
    const realId = row?.docId;
    if (!realId) {
      alert("Este registro no tiene ID de documento (no se puede editar).");
      return;
    }
    router.push(`/${tenantForRequests}/activos/${realId}`);
  };

  const deleteIds = async (docIds: string[]) => {
    if (!sessionToken || !idToken) return;
    const clean = (docIds || [])
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    if (clean.length === 0) return;

    const ok = window.confirm(
      `¿Seguro que deseas eliminar ${clean.length} activo(s)?`
    );
    if (!ok) return;

    try {
      const resp = await fetch("/api/cloud/assets/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
          Authorization: `Bearer ${idToken}`,
          "x-tenant-id": String(tenantForRequests),
        },
        body: JSON.stringify({ ids: clean }),
      });

      const text = await resp.text();
      let dataResp: any;
      try {
        dataResp = JSON.parse(text);
      } catch {
        dataResp = { ok: resp.ok, raw: text };
      }

      if (!resp.ok || !dataResp.ok) {
        throw new Error(
          dataResp?.error || `Error HTTP ${resp.status}: ${text.slice(0, 200)}`
        );
      }

      await fetchAssets(String(tenantForRequests), sessionToken, idToken, {
        preserveUi: false,
        page,
        pageSize,
      });

      setSelectedIds(new Set());
    } catch (err: any) {
      console.error("Error borrando activos:", err);
      alert(err.message || "Error eliminando activos");
    }
  };

  const handleDelete = (uiId: string) => {
    const row = dataFiltradaYOrdenada.find((r) => r.id === uiId);
    if (!row?.docId) {
      alert("Este registro no tiene ID de documento (no se puede borrar).");
      return;
    }
    deleteIds([row.docId]);
  };

  const handleDeleteSelected = async () => {
    const rowsSelected = dataFiltradaYOrdenada.filter((r) =>
      selectedIds.has(r.id)
    );
    const missing = rowsSelected.filter((r) => !r.docId);

    if (missing.length > 0) {
      alert(
        `Hay ${missing.length} seleccionado(s) sin ID de documento. No se pueden borrar.\n` +
          `Desselecciónalos o recarga desde la API para obtener _id.`
      );
      return;
    }

    const docIds = rowsSelected.map((r) => r.docId);
    await deleteIds(docIds);
  };

  const handleAdd = async () => {
    if (!sessionToken || !idToken) {
      alert("Sesión inválida, vuelve a iniciar sesión.");
      return;
    }

    if (!newTag.trim() || !newName.trim() || !newLocation.trim()) {
      alert(
        "Número RFID, nombre de activo y nombre de ubicación son obligatorios."
      );
      return;
    }

    try {
      setSaving(true);

      const nowSec = Math.floor(Date.now() / 1000);

      const filteredNewCustom: Record<string, any> = {};
      for (const [k, v] of Object.entries(newCustom || {})) {
        if (isHiddenCustom(k)) continue;
        filteredNewCustom[k] = v;
      }

      const customClean = sanitizeCustom(
        customFieldsForForms || [],
        filteredNewCustom
      );

      const item = {
        tag: newTag.trim(),
        tenantId: tenantForRequests,
        locationId: newLocation.trim(),
        type: newName.trim(),
        ts: nowSec,
        custom: customClean,
      };

      const resp = await fetch("/api/cloud/assets/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
          Authorization: `Bearer ${idToken}`,
          "x-tenant-id": String(tenantForRequests),
        },
        body: JSON.stringify({ items: [item] }),
      });

      const dataResp = await resp.json().catch(() => ({}));

      if (!resp.ok || !dataResp.ok) {
        throw new Error(dataResp.error || "Error guardando activo");
      }

      await fetchAssets(String(tenantForRequests), sessionToken, idToken, {
        preserveUi: false,
        page: 1,
        pageSize,
      });
      setPage(1);

      setShowAddForm(false);
      setNewTag("");
      setNewName("");
      setNewLocation("");
      setNewCustom({});
    } catch (err: any) {
      console.error("Error creando activo:", err);
      alert(err.message || "Error creando activo");
    } finally {
      setSaving(false);
    }
  };

  const Circle = ({ filled }: { filled: boolean }) => (
    <span
      className={
        "mr-2 inline-block h-3 w-3 rounded-full border border-neutral-400 " +
        (filled ? "bg-black" : "bg-transparent")
      }
    />
  );

  const ColumnsSubMenu = () => {
    const baseItems = columns.map((c) => ({
      kind: "base" as const,
      id: c.id,
      label: c.label,
      hidden: isHiddenBase(c.id),
    }));

    const customItems = allCustomFields.map((cf) => ({
      kind: "custom" as const,
      id: cf.key,
      label: cf.label || cf.key,
      hidden: isHiddenCustom(cf.key),
    }));

    const items = [...baseItems, ...customItems].sort((a, b) =>
      String(a.label).localeCompare(String(b.label))
    );

    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Columnas</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-80">
          <DropdownMenuLabel>Mostrar / Ocultar</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={(e) => e.preventDefault()}
            onClick={showAllColumns}
          >
            <Circle filled={false} />
            Mostrar todas
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {items.slice(0, 60).map((it) => (
            <DropdownMenuItem
              key={`${it.kind}:${it.id}`}
              onSelect={(e) => e.preventDefault()}
              onClick={() => {
                if (it.kind === "base") toggleBaseColumn(it.id);
                else toggleCustomColumn(it.id);
              }}
            >
              <Circle filled={it.hidden} />
              <span className="truncate">{it.label}</span>
            </DropdownMenuItem>
          ))}

          {items.length > 60 ? (
            <div className="px-2 py-2 text-xs text-neutral-500">
              (Mostrando 60 de {items.length})
            </div>
          ) : null}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  };

  const renderColumnHeader = (col: ColumnDef) => {
    const k = baseKey(col.id);
    const currentFilter = filters[k];
    const currentSortActive = sort.column === k;

    return (
      <div className="flex items-center justify-between gap-2">
        <span>{col.label}</span>

        <DropdownMenu modal={false} onOpenChange={handleAnyMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded p-1 hover:bg-neutral-200"
              aria-label="abrir menú de columna"
            >
              <EllipsisVertical className="h-4 w-4 text-neutral-500" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-72"
            align="end"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuLabel>Opciones</DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleSort(k, "asc");
              }}
            >
              <ArrowUp className="mr-2 h-4 w-4" />
              Ordenar Ascendente
              {currentSortActive && sort.direction === "asc" && (
                <span className="ml-auto text-xs text-neutral-500">Activo</span>
              )}
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleSort(k, "desc");
              }}
            >
              <ArrowDown className="mr-2 h-4 w-4" />
              Ordenar Descendente
              {currentSortActive && sort.direction === "desc" && (
                <span className="ml-auto text-xs text-neutral-500">Activo</span>
              )}
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleClearSort();
              }}
            >
              Quitar orden
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <div className="px-2 pt-2 text-xs font-medium text-neutral-700">
              Filtro
            </div>

            <div className="px-2 pt-2">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={currentFilter?.mode === "contains" ? "default" : "outline"}
                  onClick={() => handleSetFilterMode(k, "contains")}
                >
                  Contiene
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={currentFilter?.mode === "startsWith" ? "default" : "outline"}
                  onClick={() => handleSetFilterMode(k, "startsWith")}
                >
                  Comienza
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={currentFilter?.mode === "endsWith" ? "default" : "outline"}
                  onClick={() => handleSetFilterMode(k, "endsWith")}
                >
                  Termina
                </Button>
              </div>
            </div>

          <div className="px-2 pb-2 pt-2">
  <FilterTextBox
    value={currentFilter?.value ?? ""}
    onCommit={(next) => handleSetFilterValue(k, next)}
  />
</div>

            <DropdownMenuSeparator />
            <ColumnsSubMenu />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const renderCustomHeader = (cf: AssetCustomFieldDef) => {
    const label = cf.label || cf.key;
    const k = customKey(cf.key);

    const currentFilter = filters[k];
    const currentSortActive = sort.column === k;

    return (
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>

        <DropdownMenu modal={false} onOpenChange={handleAnyMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded p-1 hover:bg-neutral-200"
              aria-label="abrir menú de columna"
            >
              <EllipsisVertical className="h-4 w-4 text-neutral-500" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-72"
            align="end"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuLabel>Opciones</DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleSort(k, "asc");
              }}
            >
              <ArrowUp className="mr-2 h-4 w-4" />
              Ordenar Ascendente
              {currentSortActive && sort.direction === "asc" && (
                <span className="ml-auto text-xs text-neutral-500">Activo</span>
              )}
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleSort(k, "desc");
              }}
            >
              <ArrowDown className="mr-2 h-4 w-4" />
              Ordenar Descendente
              {currentSortActive && sort.direction === "desc" && (
                <span className="ml-auto text-xs text-neutral-500">Activo</span>
              )}
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                handleClearSort();
              }}
            >
              Quitar orden
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <div className="px-2 pt-2 text-xs font-medium text-neutral-700">
              Filtro
            </div>

            <div className="px-2 pt-2">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={currentFilter?.mode === "contains" ? "default" : "outline"}
                  onClick={() => handleSetFilterMode(k, "contains")}
                >
                  Contiene
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={currentFilter?.mode === "startsWith" ? "default" : "outline"}
                  onClick={() => handleSetFilterMode(k, "startsWith")}
                >
                  Comienza
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={currentFilter?.mode === "endsWith" ? "default" : "outline"}
                  onClick={() => handleSetFilterMode(k, "endsWith")}
                >
                  Termina
                </Button>
              </div>
            </div>

         <div className="px-2 pb-2 pt-2">
  <FilterTextBox
    value={currentFilter?.value ?? ""}
    onCommit={(next) => handleSetFilterValue(k, next)}
  />
</div>

            <DropdownMenuSeparator />
            <ColumnsSubMenu />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const renderCustomFieldInput = (cf: AssetCustomFieldDef) => {
    const t = normalizeCustomFieldType(cf.type);
    const disabled = Boolean(cf.readOnly);

    const value = Object.prototype.hasOwnProperty.call(newCustom, cf.key)
      ? newCustom[cf.key]
      : t === "boolean"
        ? false
        : "";

    if (t === "boolean") {
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) =>
              setNewCustom((prev) => ({ ...prev, [cf.key]: e.target.checked }))
            }
          />
          <span className="text-xs text-neutral-600">
            {Boolean(value) ? "Sí" : "No"}
          </span>
        </div>
      );
    }

    if (t === "date") {
      return (
        <Input
          type="date"
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e) =>
            setNewCustom((prev) => ({ ...prev, [cf.key]: e.target.value }))
          }
        />
      );
    }

    if (t === "number") {
      return (
        <Input
          type="number"
          disabled={disabled}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) =>
            setNewCustom((prev) => ({ ...prev, [cf.key]: e.target.value }))
          }
          placeholder={`Escribe ${cf.label || cf.key}`}
        />
      );
    }

    return (
      <Input
        type="text"
        disabled={disabled}
        value={typeof value === "string" ? value : String(value ?? "")}
        onChange={(e) =>
          setNewCustom((prev) => ({ ...prev, [cf.key]: e.target.value }))
        }
        placeholder={`Escribe ${cf.label || cf.key}`}
      />
    );
  };

  const getBaseCol = (id: ColumnId) => columns.find((c) => c.id === id)!;

  const tableColSpan =
    1 + (isAdmin ? 1 : 0) +
    columns.filter((c) => !isHiddenBase(c.id)).length +
    visibleCustomFields.length;

  const totalPages = useMemo(() => {
    const total = totalApiAssets ?? 0;
    if (!total || !Number.isFinite(total)) return 1;
    return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  }, [totalApiAssets, pageSize]);

  const pageSafe = Math.min(Math.max(page, 1), totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages]);

  function SortableHeaderCell({
    id,
    children,
  }: {
    id: string;
    children: React.ReactNode;
  }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.7 : 1,
    };

    return (
      <th ref={setNodeRef} style={style} className="py-2 pr-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab rounded p-1 text-neutral-400 hover:bg-neutral-200 active:cursor-grabbing"
            title="Mover columna"
          >
            ⋮⋮
          </button>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </th>
    );
  }

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900">
      <AppHeader />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 rounded-md border bg-white px-6 py-5 text-center shadow-sm">
          <div className="text-xl font-semibold">Total de Activos</div>
          <div className="mt-2 text-3xl font-bold">
            {loading ? "…" : totalParaCard}
          </div>
          <div className="mt-1 text-sm text-neutral-600">
            {hayFiltrosActivos
              ? "Coincidencias (búsqueda global)."
              : "Total de activos registrados."}
          </div>
          <div className="mt-1 text-sm text-neutral-700">
            Totales seleccionados:{" "}
            <span className="font-semibold">{totalSeleccionados}</span>
          </div>
          {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
          {customFieldsError && (
            <div className="mt-1 text-xs text-amber-600">{customFieldsError}</div>
          )}
        </div>

        <h2 className="mb-3 text-lg font-semibold">Administrar Activos</h2>

        <Card className="mt-1">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Activos</CardTitle>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleClearFilters}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Borrar Filtros
              </Button>

              {isAdmin && (
                <Button size="sm" onClick={() => setShowAddForm((v) => !v)}>
                  {showAddForm ? "Cerrar" : "Añadir"}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {isAdmin && showAddForm && (
              <div className="mb-6 rounded-lg border bg-neutral-50 p-4">
                <div className="flex flex-col gap-3 md:grid md:grid-cols-3">
                  <div>
                    <div className="mb-1 text-xs font-medium text-neutral-700">
                      Número RFID
                    </div>
                    <Input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder="EPC / tag RFID"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-neutral-700">
                      Nombre de activo
                    </div>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ej. Sábana"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-neutral-700">
                      Nombre ubicación
                    </div>
                    <Input
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      placeholder="Ej. Almacen"
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-md border bg-white p-3">
                  <div className="mb-2 text-xs font-semibold text-neutral-700">
                    Campos personalizados
                  </div>

                  {customFieldsForForms.filter(
                    (cf) => cf?.key && !isHiddenCustom(cf.key)
                  ).length === 0 ? (
                    <div className="text-xs text-neutral-600">
                      No hay campos personalizados visibles (o están ocultos).
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {customFieldsForForms
                        .filter((cf) => cf?.key && !isHiddenCustom(cf.key))
                        .map((cf) => (
                          <div key={cf.key} className="space-y-1">
                            <div className="text-xs text-neutral-600">
                              {cf.label || cf.key}
                              {cf.readOnly ? (
                                <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600">
                                  Solo lectura
                                </span>
                              ) : null}
                            </div>
                            {renderCustomFieldInput(cf)}
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewTag("");
                      setNewName("");
                      setNewLocation("");
                      setNewCustom({});
                    }}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    disabled={
                      saving ||
                      !newTag.trim() ||
                      !newName.trim() ||
                      !newLocation.trim()
                    }
                  >
                    {saving ? "Guardando..." : "Guardar activo"}
                  </Button>
                </div>
              </div>
            )}

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleColumnDragEnd}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-600">
                      <th className="w-10 py-2 pl-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          onChange={() => {
                            const visibleIds = dataFiltradaYOrdenada.map((r) => r.id);
                            const allSelected = visibleIds.every((id) =>
                              selectedIds.has(id)
                            );

                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (allSelected) {
                                visibleIds.forEach((id) => next.delete(id));
                              } else {
                                visibleIds.forEach((id) => next.add(id));
                              }
                              return next;
                            });
                          }}
                          checked={
                            dataFiltradaYOrdenada.length > 0 &&
                            dataFiltradaYOrdenada.every((r) => selectedIds.has(r.id))
                          }
                        />
                      </th>

                      {isAdmin && <th className="w-24 py-2">Acciones</th>}

                      <SortableContext
                        items={orderedVisibleColumns.map((c: any) => c.key)}
                        strategy={horizontalListSortingStrategy}
                      >
                        {orderedVisibleColumns.map((item: any) => {
                          if (item.kind === "base") {
                            return (
                              <SortableHeaderCell key={item.key} id={item.key}>
                                {renderColumnHeader(item.col)}
                              </SortableHeaderCell>
                            );
                          }

                          return (
                            <SortableHeaderCell key={item.key} id={item.key}>
                              {renderCustomHeader(item.cf)}
                            </SortableHeaderCell>
                          );
                        })}
                      </SortableContext>
                    </tr>
                  </thead>

                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={tableColSpan} className="py-6 text-center">
                          Cargando activos…
                        </td>
                      </tr>
                    )}

                    {!loading && dataFiltradaYOrdenada.length === 0 && !error && (
                      <tr>
                        <td colSpan={tableColSpan} className="py-6 text-center">
                          No hay activos que coincidan con los filtros.
                        </td>
                      </tr>
                    )}

                    {!loading &&
                      dataFiltradaYOrdenada.map((m, idx) => (
                        <tr
                          key={m.id}
                          className={`border-b ${
                            idx % 2 ? "bg-neutral-50" : "bg-white"
                          }`}
                        >
                          <td className="py-2 pl-3 align-top">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={selectedIds.has(m.id)}
                              onChange={() =>
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(m.id)) next.delete(m.id);
                                  else next.add(m.id);
                                  return next;
                                })
                              }
                            />
                          </td>

                          {isAdmin && (
                            <td className="py-2 pr-2 align-top">
                              <div className="flex gap-2">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  title="Editar"
                                  className="h-8 w-8 rounded-full"
                                  onClick={() => handleEdit(m.id)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  title="Eliminar"
                                  className="h-8 w-8 rounded-full border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => handleDelete(m.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          )}

                          {orderedVisibleColumns.map((item: any) => {
                            if (item.kind === "base") {
                              const colId = item.col.id as ColumnId;

                              if (colId === "estado") {
                                return (
                                  <td key={item.key} className="py-2 pr-4 align-top">
                                    {(() => {
                                      const raw = (m.tipo || "").toLowerCase();
                                      const esEntrada = raw === "entrada";
                                      return (
                                        <span
                                          className={
                                            "px-4 py-1 text-xs font-semibold inline-block rounded-full " +
                                            (esEntrada
                                              ? "bg-black text-white"
                                              : "bg-neutral-100 text-neutral-600")
                                          }
                                        >
                                          {m.tipo || "N/A"}
                                        </span>
                                      );
                                    })()}
                                  </td>
                                );
                              }

                              if (colId === "ubicacion") {
                                return (
                                  <td key={item.key} className="py-2 pr-4 align-top">
                                    {m.ubicacion}
                                  </td>
                                );
                              }

                              if (colId === "nombreActivo") {
                                return (
                                  <td key={item.key} className="py-2 pr-4 align-top">
                                    {m.activo}
                                  </td>
                                );
                              }

                              if (colId === "rfid") {
                                return (
                                  <td
                                    key={item.key}
                                    className="py-2 pr-4 align-top font-mono text-xs"
                                  >
                                    {m.epc}
                                  </td>
                                );
                              }

                              if (colId === "empleado") {
                                return (
                                  <td
                                    key={item.key}
                                    className="py-2 pr-4 align-top text-xs"
                                  >
                                    {m.empleado}
                                  </td>
                                );
                              }

                              if (colId === "creado") {
                                return (
                                  <td
                                    key={item.key}
                                    className="py-2 pr-4 align-top text-xs"
                                  >
                                    {m.creado}
                                  </td>
                                );
                              }

                              if (colId === "ultima") {
                                return (
                                  <td
                                    key={item.key}
                                    className="py-2 pr-4 align-top text-xs"
                                  >
                                    {m.ultima}
                                  </td>
                                );
                              }

                              return null;
                            }

                            const cf = item.cf;
                            const rawVal =
                              m.custom &&
                              Object.prototype.hasOwnProperty.call(m.custom, cf.key)
                                ? m.custom[cf.key]
                                : undefined;

                            const val =
                              rawVal === undefined || rawVal === null
                                ? "-"
                                : String(rawVal);

                            return (
                              <td key={item.key} className="py-2 pr-4 align-top text-xs">
                                {val}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </DndContext>

            <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-xs text-neutral-700">
                <span>Mostrar</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => setPageSize(Number(v) || 100)}
                >
                  <SelectTrigger className="h-8 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["50", "100", "200", "500"].map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>registros</span>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex items-center gap-2 text-xs text-neutral-700">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pageSafe <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Anterior
                  </Button>
                  <span>
                    Página <span className="font-semibold">{pageSafe}</span> de{" "}
                    <span className="font-semibold">{totalPages}</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pageSafe >= totalPages || loading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Siguiente →
                  </Button>
                </div>

                {isAdmin && (
                  <Button
                    className="rounded-xl"
                    variant="outline"
                    size="sm"
                    disabled={totalSeleccionados === 0 || !sessionToken || !idToken}
                    onClick={handleDeleteSelected}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar seleccionados
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-4 text-center text-xs text-neutral-500">
        © 2025 · Dashboard Cloud API
      </footer>
    </div>
  );
}