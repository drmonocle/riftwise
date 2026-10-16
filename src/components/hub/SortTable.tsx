/** A table whose columns sort when their header is clicked (gol.gg-style stat tables). */
import React, { useMemo, useRef, useState } from "react";
import { ClipboardCopy, Download } from "lucide-react";
import { tl } from "../../i18n";
import { IS_WEB } from "../../platform";
import { td, th } from "./ui";

/** A cell as text, with champion / item pictures written as their names. */
function cellText(el: Element): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent || "");
    else if (n instanceof HTMLImageElement) parts.push(n.alt ? ` ${n.alt} ` : "");
    else n.childNodes.forEach(walk);
  };
  walk(el);
  return parts.join("").replace(/[▼▲]/g, "").replace(/\s+/g, " ").trim();
}

/** The table as shown (sorted and filtered), as rows of text. */
function tableRows(table: HTMLTableElement): string[][] {
  return [...table.rows].map((tr) => [...tr.cells].map(cellText));
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Copy (for pasting into a spreadsheet) and CSV download buttons for a table. */
export const TableExport: React.FC<{ tableRef: React.RefObject<HTMLTableElement | null>; name: string }> = ({ tableRef, name }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!tableRef.current) return;
    const text = tableRows(tableRef.current).map((r) => r.join("\t")).join("\n");
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => {},
    );
  };
  const download = () => {
    if (!tableRef.current) return;
    // byte-order mark so Excel reads accents and Korean / Chinese names correctly
    const csv = "﻿" + tableRows(tableRef.current).map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const btn = "flex items-center gap-1 px-2 py-1 rounded border border-[#1e282d] text-[#9bb3c9] hover:text-[#f0e6d2] hover:border-[#2c3c44]";
  return (
    <div className="flex justify-end gap-1.5 text-[10px]">
      <button type="button" onClick={copy} className={btn} title={tl("Copy the table to paste into a spreadsheet")}>
        <ClipboardCopy className="w-3 h-3" />
        {copied ? tl("Copied") : tl("Copy")}
      </button>
      {IS_WEB && (
        <button type="button" onClick={download} className={btn} title={tl("Download as a CSV file")}>
          <Download className="w-3 h-3" />
          CSV
        </button>
      )}
    </div>
  );
};

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
  copyName,
}: {
  rows: T[];
  columns: Column<T>[];
  initial: { key: string; desc: boolean };
  rowKey: (row: T, i: number) => string;
  /** show only this many rows (after sorting) */
  limit?: number;
  /** file name for the Copy / CSV buttons (they show when this is set) */
  copyName?: string;
}) {
  const [sort, setSort] = useState(initial);
  const tableRef = useRef<HTMLTableElement>(null);
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
    <div className="space-y-1.5">
    {copyName && <TableExport tableRef={tableRef} name={copyName} />}
    <div className="overflow-x-auto">
      <table ref={tableRef} className="w-full text-xs">
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
    </div>
  );
}

export const per = (n: number, d: number, digits = 1) => (d ? Number((n / d).toFixed(digits)) : null);
