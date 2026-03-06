// app/api/idlinens/retirados/analysis/cache.ts

// app/api/idlinens/retirados/analysis/cache.ts

export type RetiradosCacheEntry<T = any> = {
  ts: number;
  assets: T[];
};

const _cache = new Map<string, RetiradosCacheEntry>();

export function __getRetiradosCache<T = any>(tenantId: string) {
  const k = String(tenantId || "").trim();
  if (!k) return undefined;
  return _cache.get(k) as RetiradosCacheEntry<T> | undefined;
}

export function __setRetiradosCache<T = any>(tenantId: string, entry: RetiradosCacheEntry<T>) {
  const k = String(tenantId || "").trim();
  if (!k) return;
  _cache.set(k, entry);
}