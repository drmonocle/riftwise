// Test helper (not part of the site): visit pages inside the app and report broken text or failed loads.
window.__sweep = async (pages, from = 0, to = pages.length) => {
  const bad = [];
  const errs = [];
  const onErr = (e) => errs.push(String(e.message || e.reason));
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onErr);
  const BAD = /\bNaN\b|\bundefined\b|\bnull\b|\[object Object\]|\{[a-z]+\}/;
  for (const url of pages.slice(from, to)) {
    window.__at = url;
    const before = errs.length;
    history.pushState(null, "", url);
    dispatchEvent(new PopStateEvent("popstate"));
    let text = "";
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const m = document.querySelector("main");
      text = m ? m.innerText : "";
      if (text && !/Loading/.test(text.slice(0, 400)) && text.length > 300) break;
    }
    await new Promise((r) => setTimeout(r, 300));
    const m = document.querySelector("main");
    text = m ? m.innerText : "";
    const issues = [];
    const hit = text.match(BAD);
    if (hit) {
      const i = text.indexOf(hit[0]);
      issues.push("text: …" + text.slice(Math.max(0, i - 60), i + 40).replace(/\s+/g, " ") + "…");
    }
    if (/couldn't find that page|couldn't find one of these/.test(text)) issues.push("not found");
    if (/Couldn't load the stats/.test(text)) issues.push("failed to load");
    if (text.length < 300) issues.push("very short page (" + text.length + ")");
    if (errs.length > before) issues.push("js: " + errs.slice(before).join(" | ").slice(0, 200));
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) issues.push("sideways scroll");
    for (const sc of document.querySelectorAll("main, [class*=overflow-y-auto]")) {
      const cs = getComputedStyle(sc);
      if (/(auto|scroll)/.test(cs.overflowY) && sc.scrollWidth > sc.clientWidth + 1 && !/(hidden)/.test(cs.overflowX) && sc.clientHeight > 200) { issues.push("inner sideways scroll " + (sc.scrollWidth - sc.clientWidth) + "px"); break; }
    }
    if (issues.length) bad.push([url, issues]);
  }
  window.removeEventListener("error", onErr);
  window.removeEventListener("unhandledrejection", onErr);
  return bad;
};
