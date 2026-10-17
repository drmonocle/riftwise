/**
 * Mouse wheel over anything that scrolls sideways (tables, brackets, tab rows) scrolls it sideways first; once it
 * reaches either end, the wheel scrolls the page as usual. Trackpad sideways swipes, Shift+wheel and Ctrl+wheel
 * (zoom) are left alone, and so is a box that scrolls up and down itself before a sideways one is reached.
 */
const scrolls = (v: string) => v === "auto" || v === "scroll";

export function installWheelSideScroll(): void {
  window.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (e.ctrlKey || e.shiftKey || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      for (let el = e.target instanceof Element ? e.target : null; el && el !== document.body; el = el.parentElement) {
        if (!(el instanceof HTMLElement)) continue;
        const style = getComputedStyle(el);
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY;
        // an inner box that scrolls up and down (a list, a dropdown) keeps the wheel while it can move
        if (scrolls(style.overflowY) && el.scrollHeight > el.clientHeight + 1) {
          const canMove = dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0;
          if (canMove) return;
          continue;
        }
        if (scrolls(style.overflowX) && el.scrollWidth > el.clientWidth + 1) {
          const max = el.scrollWidth - el.clientWidth;
          const canMove = dy > 0 ? el.scrollLeft < max - 1 : el.scrollLeft > 1;
          if (!canMove) continue; // at the end: let an outer box or the page scroll
          e.preventDefault();
          el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + dy));
          return;
        }
      }
    },
    { passive: false },
  );
}
