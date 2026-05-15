//lib/inventory-api.ts

"use client";

export type InventoryItem = {
  id: string;
  name: string;
  status: "open" | "closed";
  result?: "complete" | "incomplete" | null;
  fieldKey: string;
  fieldLabel: string;
  fieldValue: string;
  expectedTotal: number;
  foundTotal: number;
  readTotal: number;
  missingTotal: number;
  extraTotal: number;
  duplicateTotal: number;
  progressText: string;
  canClose: boolean;
  createdAt?: number;
createdAtIso?: string;
updatedAt?: number;
closedAt?: number;
closedAtIso?: string;

createdBy?: {
  uid?: string | null;
  email?: string | null;
};

closedBy?: {
  uid?: string | null;
  email?: string | null;
};
  report?: {
    filename?: string;
    storagePath?: string;
    signedUrl?: string;
  };
};

function getAuthTokens() {
  if (typeof window === "undefined") {
    return {
      sessionToken: "",
      idToken: "",
    };
  }

  return {
    sessionToken: String(localStorage.getItem("cloudSessionToken") || "").trim(),
    idToken: String(localStorage.getItem("cloudIdToken") || "").trim(),
  };
}

function buildHeaders(tenantId: string) {
  const { idToken } = getAuthTokens();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-tenant-id": String(tenantId || "").trim(),
  };

  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  return headers;
}

async function inventoryPost<T>(
  tenantId: string,
  path: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const { sessionToken, idToken } = getAuthTokens();

  if (!sessionToken) {
    throw new Error("No hay sessionToken (cloudSessionToken) en localStorage");
  }

  if (!idToken) {
    throw new Error("No hay idToken (cloudIdToken) en localStorage");
  }

  const resp = await fetch(`/api/inventory/${path}`, {
    method: "POST",
    headers: buildHeaders(tenantId),
    credentials: "include",
    body: JSON.stringify({
      tenantId,
      sessionToken,
      idToken,
      ...body,
    }),
    cache: "no-store",
  });

  const txt = await resp.text().catch(() => "");

  let data: any = null;

  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = txt;
  }

  if (!resp.ok || data?.status >= 400) {
    throw new Error(data?.message || `Inventory proxy error (${resp.status})`);
  }

  return data as T;
}

export async function getOpenInventories(tenantId: string) {
  return inventoryPost<{
    status: number;
    tenantId: string;
    total: number;
    items: InventoryItem[];
  }>(tenantId, "Open");
}

export async function getInventoryHistory(tenantId: string) {
  return inventoryPost<{
    status: number;
    tenantId: string;
    total: number;
    items: InventoryItem[];
  }>(tenantId, "History");
}

export async function getInventoryDashboardData(tenantId: string) {
  const [openRes, historyRes, assetsRes] = await Promise.all([
    getOpenInventories(tenantId),
    getInventoryHistory(tenantId),
    getInventoryAssetsCount(tenantId),
  ]);

  const openItems = (openRes.items || []).filter(
    (item) => Number(item.expectedTotal || 0) > 0
  );

  const closedItems = (historyRes.items || []).filter(
    (item) => Number(item.expectedTotal || 0) > 0
  );

  const allItems = [...openItems, ...closedItems];

  const totalAssets = Number(assetsRes.total || 0);

  const foundTotal = allItems.reduce(
    (sum, item) => sum + Number(item.foundTotal || 0),
    0
  );

  const missingTotal = Math.max(totalAssets - foundTotal, 0);

  const extraTotal = allItems.reduce(
    (sum, item) => sum + Number(item.extraTotal || 0),
    0
  );

  const duplicateTotal = allItems.reduce(
    (sum, item) => sum + Number(item.duplicateTotal || 0),
    0
  );

  return {
    openItems,
    closedItems,
    recentItems: allItems.slice(0, 5),
    totals: {
      totalAssets,
      foundTotal,
      missingTotal,
      extraTotal,
      duplicateTotal,
      openTotal: openItems.length,
      closedTotal: closedItems.length,
      readsTotal: foundTotal + extraTotal,
      differencesTotal: missingTotal + extraTotal + duplicateTotal,
    },
  };
}

export async function getInventoryAssetsCount(tenantId: string) {
  return inventoryPost<{
    total: number;
    items: unknown[];
  }>(tenantId, "AssetsCount", {
    limit: 1,
  });
}