/**
 * A plain <table> whose columns sort when a header is clicked, worked out from what the cells show:
 * numbers ("1,630", "65%", "+12", "−3", "#4", "<1%"), records ("18-12": wins, then win rate), game times ("31:45"),
 * dates ("2024-11-02"), years and date ranges by their first year, and otherwise text. A column with any text in it
 * ("100 Thieves" next to "T1") sorts as text. A cell can say what it sorts by with data-sort (patches, places);
 * a header with data-nosort doesn't sort. Number columns sort high to low first, text A to Z; clicking again flips.
 *
 * Use it like <table>: <STable className="w-full text-xs"><thead>...</thead><tbody>{rows}</tbody></STable>.
 * The rows are reordered as React elements (by their keys), so anything inside keeps working. Each row element
 * must render exactly one <tr>; if not, the table simply doesn't sort.
 */
import { locale } from "../i18n";
import React, { useLayoutEffect, useRef, useState } from "react";

type Val = number | string | null;

export function sortValue(cell: HTMLTableCellElement | undefined): Val {
  if (!cell) return null;
  const ds = cell.dataset.sort;
  if (ds !== undefined) {
    const n = Number(ds);
    return ds !== "" && !isNaN(n) ? n : ds || null;
  }
  const t = (cell.textContent || "").replace(/\s+/g, " ").trim();
  if (!t || /^[–—-]+$/.test(t) || t === "?") return null;
  const time = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (time) return time[3] ? +time[1] * 3600 + +time[2] * 60 + +time[3] : +time[1] * 60 + +time[2];
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (day) return Date.UTC(+day[1], +day[2] - 1, +day[3]);
  const wl = /^(\d+)\s*[-–]\s*(\d+)$/.exec(t);
  if (wl) {
    const w = +wl[1];
    const l = +wl[2];
    if (w >= 1900 && l >= 1900) return w; // a range of years: its first year
    return w + (w + l ? (w / (w + l)) * 0.999 : 0);
  }
  const under = /^<\s*(\d+(?:\.\d+)?)\s*%$/.exec(t);
  if (under) return Number(under[1]) * 0.5;
  const plain = localPlain(t);
  const lead = /^(-?\d+(?:\.\d+)?)([kKmM]?)/.exec(plain);
  if (lead) return Number(lead[1]) * (/k/i.test(lead[2]) ? 1e3 : /m/i.test(lead[2]) ? 1e6 : 1);
  return t.toLocaleLowerCase();
}

function compare(x: Val, y: Val): number {
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x).localeCompare(String(y), locale(), { numeric: true });
}

// The reader's number separators (1,234.5 / 1.234,5 / 1 234,5): numbers the app formats for the reader's
// language (fmtNum, prize money) must sort as numbers, not as 1.234
let seps: { loc: string; group: string; dec: string } | null = null;
function separators() {
  if (!seps || seps.loc !== locale()) {
    const parts = new Intl.NumberFormat(locale()).formatToParts(12345.6);
    seps = { loc: locale(), group: parts.find((p) => p.type === "group")?.value ?? ",", dec: parts.find((p) => p.type === "decimal")?.value ?? "." };
  }
  return seps;
}
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A cell's text as a plain number string: sign, currency ("US$", "R$", "€"...) and grouping taken out. */
export function localPlain(t: string): string {
  let p = t
    .replace(/^[+#]/, "")
    .replace(/^[−–]/, "-")
    .replace(/^(?:[A-Z]{1,3})?[$€£¥₩](?:[A-Z]{1,3})?\s*/u, "")
    .replace(/\s*(?:[A-Z]{1,3})?[$€£¥₩](?:[A-Z]{1,3})?$/u, "")
    .replace(/[\s\u00a0\u202f]/g, "");
  const { group, dec } = separators();
  const g = group.replace(/[\s\u00a0\u202f]/g, "");
  // grouped like the reader's language writes it (1.234.567 in German): drop the groups, keep the decimals
  if (g && new RegExp(`^-?\\d{1,3}(?:${esc(g)}\\d{3})+(?:${esc(dec)}\\d+)?$`).test(p)) p = p.split(g).join("").replace(dec, ".");
  else if (dec === "," && /^-?\d+,\d+$/.test(p)) p = p.replace(",", "."); // 3,5 in French
  return p.replace(/,/g, "");
}

/** Children of a host element (thead / tbody / tr) as a flat list of elements with keys. */
const kids = (el: React.ReactElement<{ children?: React.ReactNode }>) =>
  React.Children.toArray(el.props.children).filter(React.isValidElement) as React.ReactElement<Record<string, unknown>>[];

export const STable: React.FC<React.TableHTMLAttributes<HTMLTableElement> & { ref?: React.Ref<HTMLTableElement> }> = ({
  children,
  ref: outerRef,
  ...rest
}) => {
  const ref = useRef<HTMLTableElement>(null);
  // the caller's ref (Copy / CSV buttons read the table) points at the same table
  const setRef = (el: HTMLTableElement | null) => {
    ref.current = el;
    if (typeof outerRef === "function") outerRef(el);
    else if (outerRef) (outerRef as React.MutableRefObject<HTMLTableElement | null>).current = el;
  };
  const [sort, setSort] = useState<{ col: number; desc: boolean } | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);

  const parts = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<{ children?: React.ReactNode }>[];
  const body = parts.find((p) => p.type === "tbody");
  const rows = body ? kids(body) : [];
  // the rows in the order to show: the sorted keys first, then anything new (until the next sort)
  const byKey = new Map(rows.map((r) => [String(r.key), r]));
  const shown = order
    ? [...order.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!), ...rows.filter((r) => !order.includes(String(r.key)))]
    : rows;

  const sortRows = (s: { col: number; desc: boolean }) => {
    const tb = ref.current?.tBodies[0];
    if (!tb || tb.rows.length !== shown.length) return null;
    const width = ref.current?.tHead?.rows[0]?.cells.length;
    const vals = [...tb.rows].map((tr, i) => ({
      key: String(shown[i].key),
      v: tr.cells.length === width ? sortValue(tr.cells[s.col]) : null,
      cell: tr.cells.length === width ? tr.cells[s.col] : undefined,
      i,
    }));
    // a column with any text sorts as text ("100 Thieves" among team names isn't the number 100)
    if (vals.some((x) => typeof x.v === "string"))
      for (const x of vals) if (typeof x.v === "number" && x.cell?.dataset.sort === undefined) x.v = (x.cell?.textContent || "").trim().toLocaleLowerCase();
    vals.sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const c = compare(a.v, b.v);
      return c === 0 ? a.i - b.i : s.desc ? -c : c;
    });
    return vals.map((x) => x.key);
  };

  // new data while sorted: sort it the same way (before the browser paints)
  useLayoutEffect(() => {
    if (!sort) return;
    const next = sortRows(sort);
    if (next && (!order || next.join("\u0000") !== order.join("\u0000"))) setOrder(next);
  });

  const onHead = (th: HTMLTableCellElement) => {
    if (th.dataset.nosort !== undefined) return;
    const col = th.cellIndex;
    const tb = ref.current?.tBodies[0];
    // numbers start high to low, text A to Z (a column with any text is text)
    const all = tb ? [...tb.rows].map((tr) => sortValue(tr.cells[col])).filter((v) => v !== null) : [];
    const numeric = all.length > 0 && all.every((v) => typeof v === "number");
    const s = sort && sort.col === col ? { col, desc: !sort.desc } : { col, desc: numeric };
    const next = sortRows(s);
    if (!next) return;
    setSort(s);
    setOrder(next);
  };

  // headers: clickable, with an arrow on the sorted one
  const decorate = (head: React.ReactElement<{ children?: React.ReactNode }>) =>
    React.cloneElement(
      head,
      {},
      kids(head).map((tr) =>
        tr.type !== "tr"
          ? tr
          : React.cloneElement(
              tr,
              {},
              kids(tr as React.ReactElement<{ children?: React.ReactNode }>).map((th, i) => {
                if (th.type !== "th" || th.props["data-nosort"] !== undefined) return th;
                const on = sort?.col === i;
                const p = th.props as { className?: string; children?: React.ReactNode };
                return React.cloneElement(
                  th,
                  {
                    className: `${p.className || ""} cursor-pointer select-none hover:text-rw-text ${on ? "text-rw-accent" : ""}`,
                    tabIndex: 0,
                    "aria-sort": on ? (sort!.desc ? "descending" : "ascending") : "none",
                    onKeyDown: (e: React.KeyboardEvent<HTMLTableCellElement>) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onHead(e.currentTarget);
                      }
                    },
                  },
                  p.children,
                  on ? (sort!.desc ? " ▼" : " ▲") : null,
                );
              }),
            ),
      ),
    );

  return (
    <table
      ref={setRef}
      {...rest}
      onClick={(e) => {
        const th = (e.target as HTMLElement).closest("th");
        if (th && th.parentElement?.parentElement?.tagName === "THEAD" && !(e.target as HTMLElement).closest("a, button, input, select")) onHead(th);
        rest.onClick?.(e);
      }}
    >
      {parts.map((p) => (p.type === "thead" ? decorate(p) : p === body ? React.cloneElement(body, {}, shown) : p))}
    </table>
  );
};
