/** A table whose columns sort when their header is clicked (gol.gg-style stat tables). */
import React, { useMemo, useState } from "react";
import { td, th } from "./ui";

export interface Column<T> {
  key: string;
  label: string;
  /** Hover text for short headers ("KP" -> "Kill participation"). */
  title?: string;
  /** Number or text to sort by; null sorts last. */
  value: (row: T) => number | string | null;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export function SortTable<T>({
  rows,
  columns,
  initial,
  rowKey,
  limit,
}: {
  rows: T[];
  columns: Column<T>[];
  initial: { key: string; desc: boolean };
  rowKey: (row: T, i: number) => string;
  /** show only this many rows (after sorting) */
  limit?: number;
}) {
  const [sort, setSort] = useState(initial);
  const col = columns.find((c) => c.key === sort.key) || columns[0];
  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const x = col.value(a);
      const y = col.value(b);
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.desc ? -c : c;
    });
    return limit ? list.slice(0, limit) : list;
  }, [rows, col, sort.desc, limit]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`${th} ${c.className || ""}`} title={c.title}>
                <button
                  type="button"
                  onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))}
                  className={sort.key === c.key ? "text-[#c8aa6e]" : "hover:text-[#f0e6d2]"}
                >
                  {c.label}
                  {sort.key === c.key ? (sort.desc ? " ▼" : " ▲") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={rowKey(r, i)} className="border-t border-[#1e282d]">
              {columns.map((c) => (
                <td key={c.key} className={`${td} ${c.className || ""}`}>
                  {c.render ? c.render(r) : c.value(r) ?? "–"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const per = (n: number, d: number, digits = 1) => (d ? Number((n / d).toFixed(digits)) : null);
