import { useEffect, useState } from "react";

// Generalized "recently viewed" item across any module type.
//
// `kind` is an opaque tag decided by the caller — "department", "project",
// "report", "hr-template", or any new module added tomorrow. The hook does
// not enumerate valid kinds so a new module type just starts pushing with
// its own tag and the history widget renders it.
export interface RecentItem {
  kind: string;
  id: string;          // unique within kind (code, slug, or numeric id as string)
  label: string;       // primary display text
  sublabel?: string;   // context (dept name, project name, etc.)
  icon: string;        // Material Symbols name
  accent?: string;     // optional hex tint; defaults to theme primary
  href: string;        // full in-app path for navigation
  visitedAt: number;   // epoch ms
}

const STORAGE_KEY = "recent-items:v1";
const MAX_ITEMS = 15;
// Per-tab change signal — `storage` event only fires across tabs, not in the
// same tab that wrote. We emit a custom event too so in-tab mounts refresh.
const CHANGE_EVENT = "recent-items:changed";

function readStore(): RecentItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentItem =>
        x &&
        typeof x.kind === "string" &&
        typeof x.id === "string" &&
        typeof x.label === "string" &&
        typeof x.href === "string" &&
        typeof x.icon === "string" &&
        typeof x.visitedAt === "number"
    );
  } catch {
    return [];
  }
}

function writeStore(items: RecentItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore storage errors (quota, private mode, etc.) — history is a
    // nice-to-have, never a hard dependency.
  }
}

/**
 * Record a visit. Dedupes by `kind+id` (most recent wins) and caps the list
 * at MAX_ITEMS. Safe to call during render via `useEffect`.
 */
export function pushRecentItem(item: Omit<RecentItem, "visitedAt">): void {
  const now = Date.now();
  const existing = readStore();
  const deduped = existing.filter(
    (i) => !(i.kind === item.kind && i.id === item.id)
  );
  const updated: RecentItem[] = [{ ...item, visitedAt: now }, ...deduped].slice(0, MAX_ITEMS);
  writeStore(updated);
}

/** Delete a single item. Useful for a future "Clear" button. */
export function removeRecentItem(kind: string, id: string): void {
  const updated = readStore().filter((i) => !(i.kind === kind && i.id === id));
  writeStore(updated);
}

/** Wipe the whole list. */
export function clearRecentItems(): void {
  writeStore([]);
}

/**
 * Subscribe to recent-items. `limit` caps the returned list without affecting
 * storage.
 */
export function useRecentItems(limit?: number): RecentItem[] {
  const [items, setItems] = useState<RecentItem[]>(readStore);

  useEffect(() => {
    function refresh() {
      setItems(readStore());
    }
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return typeof limit === "number" ? items.slice(0, limit) : items;
}

/** Human-friendly relative time for the history widget. */
export function formatRecentAgo(visitedAt: number, now: number = Date.now()): string {
  const diffMs = now - visitedAt;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return `${diffWeek}w ago`;
  return new Date(visitedAt).toLocaleDateString();
}
