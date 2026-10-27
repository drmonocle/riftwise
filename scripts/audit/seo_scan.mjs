// What a crawler without JavaScript sees: each page's <title> length and whether the HTML has an <h1> outside <noscript>.
// usage: node seo_scan.mjs [base] [perSitemap]
const base = process.argv[2] || "https://riftwise.gg";
const per = Number(process.argv[3] || 40);
const get = async (u) => (await fetch(u, { headers: { "user-agent": process.env.AUDIT_UA || "Mozilla/5.0 (compatible; bingbot/2.0)" } })).text();
const idx = await get(`${base}/sitemap.xml`);
const maps = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const urls = [];
for (const m of maps) {
  const x = await get(m.replace("https://riftwise.gg", base));
  const locs = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  // a spread of each sitemap: first, middle and last pages
  const pick = locs.length <= per ? locs : Array.from({ length: per }, (_, i) => locs[Math.floor((i * (locs.length - 1)) / (per - 1))]);
  urls.push(...pick.map((u) => [m.split("/").pop(), u]));
}
const out = [];
let i = 0;
async function worker() {
  while (i < urls.length) {
    const [map, u] = urls[i++];
    try {
      const h = await get(u.replace("https://riftwise.gg", base));
      const title = (/<title>([^<]*)<\/title>/.exec(h) || [])[1] || "";
      const noNs = h.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
      out.push({ map, u, len: title.replace(/&amp;/g, "&").length, title, h1: /<h1[\s>]/i.test(noNs), h1ns: /<h1[\s>]/i.test(h) });
    } catch (e) {
      out.push({ map, u, err: String(e) });
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
const long = out.filter((x) => x.len > 70);
console.log("pages", out.length, "| titles > 70:", long.length, "| no h1 outside noscript:", out.filter((x) => !x.h1).length, "| no h1 at all:", out.filter((x) => !x.h1ns).length);
const byMap = {};
for (const x of long) byMap[x.map] = (byMap[x.map] || 0) + 1;
console.log("long titles by sitemap", byMap);
for (const x of long.sort((a, b) => b.len - a.len).slice(0, Number(process.env.SHOW || 12))) console.log(x.len, x.map.replace("sitemap-", "").replace(".xml", ""), x.title);
const lens = out.map((x) => x.len).sort((a, b) => a - b);
console.log("median title length", lens[Math.floor(lens.length / 2)], "max", lens[lens.length - 1]);
// a page without its own <h1> outside <noscript> fails the weekly audit; long titles are only reported
if (out.some((x) => !x.h1)) process.exit(1);
