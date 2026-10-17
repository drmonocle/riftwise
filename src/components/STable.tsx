/**
 * A plain <table> whose columns sort when a header is clicked, worked out from what the cells show:
 * numbers ("1,630", "65%", "+12", "−3", "3-1" by its first number, "#4"), game times ("31:45"), years and date
 * ranges by their first year, and otherwise text. A cell can say what it sorts by with data-sort (dates, places);
 * a header with data-nosort doesn't sort. Number columns sort high to low first, text A to Z; clicking again flips.
 *
 * Use it like <table>: <STable className="w-full text-xs"><thead>...</thead><tbody>{rows}</tbody></STable>.
 * The rows are reordered as React elements (by their keys), so anything inside keeps working. Each row element
 * must render exactly one <tr>; if not, the table simply doesn't sort.
 */
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
  const plain = t.replace(/[\s,]/g, "").replace(/^[+#]/, "").replace(/^[−–]/, "-").replace(/^\$/, "");
  const lead = /^(-?\d+(?:\.\d+)?)([kKmM]?)/.exec(plain);
  if (lead) return Number(lead[1]) * (/k/i.test(lead[2]) ? 1e3 : /m/i.test(lead[2]) ? 1e6 : 1);
  return t.toLocaleLowerCase();
}

function compare(x: Val, y: Val): number {
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x).localeCompare(String(y), undefined, { numeric: true });
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
      i,
    }));
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
    // numbers start high to low, text A to Z
    const sample = tb ? [...tb.rows].map((tr) => sortValue(tr.cells[col])).find((v) => v !== null) : null;
    const s = sort && sort.col === col ? { col, desc: !sort.desc } : { col, desc: typeof sample === "number" };
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
