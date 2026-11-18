/**
 * Structured champion build paths: separates finished items from recent pro builds into core legendary items,
 * situational items, and boots, and extracts the most common multi-item core build paths from recent pro games.
 */
import { normalizeRole } from "./champAgg";
import { isBootsItem, isFinishedItem, isTrinketItem } from "./ddragon";
import type { HubChamp } from "./types";

export type BuildItemRow = [string, number, number];

export interface SplitBuildItems {
  core: BuildItemRow[];
  situational: BuildItemRow[];
  boots: BuildItemRow[];
}

export interface CoreBuildCombo {
  items: string[];
  g: number;
  w: number;
}

/**
 * Partition finished items into core legendary items (>= 30% pick rate or top 3), situational legendary items,
 * and boots, excluding consumables, components, and trinkets.
 */
export function splitBuildItems(items: BuildItemRow[], totalGames: number): SplitBuildItems {
  const seen = new Set<string>();
  const finished: BuildItemRow[] = [];
  for (const row of items) {
    const [name, g, w] = row;
    if (!name || seen.has(name) || !isFinishedItem(name) || isTrinketItem(name)) continue;
    seen.add(name);
    finished.push([name, g, w]);
  }
  finished.sort((a, b) => b[1] - a[1] || b[2] - a[2]);

  const boots: BuildItemRow[] = [];
  const other: BuildItemRow[] = [];
  for (const row of finished) {
    if (isBootsItem(row[0])) {
      if (boots.length < 6) boots.push(row);
    } else {
      other.push(row);
    }
  }

  const denom = Math.max(1, totalGames);
  const core: BuildItemRow[] = [];
  const coreSet = new Set<string>();
  for (const row of other) {
    if (core.length >= 5) break;
    if (row[1] / denom >= 0.3) {
      core.push(row);
      coreSet.add(row[0]);
    }
  }
  for (const row of other) {
    if (core.length >= Math.min(3, other.length)) break;
    if (!coreSet.has(row[0])) {
      core.push(row);
      coreSet.add(row[0]);
    }
  }

  const situational = other.filter((row) => !coreSet.has(row[0])).slice(0, 6);
  return { core, situational, boots };
}

/**
 * Extract recurring 2-item and 3-item non-boot legendary combinations from a champion's recent pro games,
 * canonicalizing item order by global build frequency so inventory slot placement does not fragment identical builds.
 */
export function extractCoreCombos(
  recent: HubChamp["recent"],
  buildItems: BuildItemRow[],
  opts?: { role?: string; maxCombos?: number },
): CoreBuildCombo[] {
  const rankMap = new Map<string, number>();
  [...buildItems]
    .sort((a, b) => b[1] - a[1] || b[2] - a[2])
    .forEach(([name], idx) => {
      if (!rankMap.has(name)) rankMap.set(name, idx);
    });

  const targetRole = opts?.role ? normalizeRole(opts.role) : "";
  const pairAcc = new Map<string, { items: string[]; g: number; w: number }>();
  const trioAcc = new Map<string, { items: string[]; g: number; w: number }>();

  for (const r of recent || []) {
    if (targetRole && normalizeRole(r.r) !== targetRole) continue;
    const raw = r.it || [];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const it of raw) {
      if (!it || seen.has(it) || !isFinishedItem(it) || isTrinketItem(it) || isBootsItem(it)) continue;
      seen.add(it);
      unique.push(it);
    }
    if (unique.length < 2) continue;
    unique.sort((a, b) => {
      const ra = rankMap.get(a);
      const rb = rankMap.get(b);
      if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb;
      if (ra !== undefined && rb === undefined) return -1;
      if (ra === undefined && rb !== undefined) return 1;
      return a.localeCompare(b);
    });

    const pItems = unique.slice(0, 2);
    const pKey = pItems.join("\0");
    const pCur = pairAcc.get(pKey) || { items: pItems, g: 0, w: 0 };
    pCur.g += 1;
    pCur.w += r.win ? 1 : 0;
    pairAcc.set(pKey, pCur);

    if (unique.length >= 3) {
      const tItems = unique.slice(0, 3);
      const tKey = tItems.join("\0");
      const tCur = trioAcc.get(tKey) || { items: tItems, g: 0, w: 0 };
      tCur.g += 1;
      tCur.w += r.win ? 1 : 0;
      trioAcc.set(tKey, tCur);
    }
  }

  const strongTrios = [...trioAcc.values()].filter((t) => t.g >= 3);
  const coveredPairs = new Set<string>();
  for (const trio of strongTrios) {
    const prefixKey = trio.items.slice(0, 2).join("\0");
    const pair = pairAcc.get(prefixKey);
    if (pair && pair.g === trio.g) coveredPairs.add(prefixKey);
  }

  const out: CoreBuildCombo[] = [
    ...strongTrios,
    ...[...pairAcc.entries()]
      .filter(([key, p]) => p.g >= 2 && !coveredPairs.has(key))
      .map(([, p]) => p),
  ];

  out.sort((a, b) => b.g - a.g || b.w - a.w || b.items.length - a.items.length);
  return out.slice(0, opts?.maxCombos ?? 4);
}
