"""RiftWise funnel for the analytics hub (C:\\goaccess, tab "RiftWise funnel"): how many visitors go past the first
page, which themes, languages and apps they use, how many entered Pick'Em, and how many read the results feed or
subscribe to the calendar. Days are US Eastern (midnight rollover), like the hub's other reports.

Sources, all on HomeServer: the push service's anonymous daily counts (C:\\Sites\\riftwise-push-data\\usage, written
by server/push/usage.go from src/usage.ts), the Pick'Em entries (C:\\Sites\\riftwise-sync-data\\pickem) and the IIS
logs of riftwise.gg (feed.xml and calendar.ics requests: one reader = one address + user agent a day).

  python scripts/analytics/funnel.py [--days 30] [--out C:\\goaccess\\www\\reports]
Writes riftwise-funnel.html and riftwise-funnel.json. The hub's update_reports.ps1 runs it every 10 minutes.
"""
import argparse
import datetime as dt
import glob
import html
import json
import os
from collections import Counter, defaultdict

USAGE = r"C:\Sites\riftwise-push-data\usage"
PICKEM = r"C:\Sites\riftwise-sync-data\pickem"
LOGS = r"C:\inetpub\logs\LogFiles\W3SVC4"
OUT = r"C:\goaccess\www\reports"
FEEDS = {"/feed.xml": "feed", "/calendar.ics": "calendar"}


def eastern(utc: dt.datetime) -> dt.datetime:
    """UTC to US Eastern without a time-zone database (Windows Python has none): daylight time from the second Sunday
    of March, 2:00 local, to the first Sunday of November, 2:00 local."""
    y = utc.year
    march = dt.datetime(y, 3, 8 + (6 - dt.date(y, 3, 8).weekday()) % 7, 7)  # 2:00 EST = 7:00 UTC
    nov = dt.datetime(y, 11, 1 + (6 - dt.date(y, 11, 1).weekday()) % 7, 6)  # 2:00 EDT = 6:00 UTC
    return utc - dt.timedelta(hours=4 if march <= utc < nov else 5)


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


def usage_days(folder, days):
    out = {}
    for d in days:
        try:
            with open(os.path.join(folder, d + ".json"), encoding="utf-8") as f:
                out[d] = json.load(f)
        except (OSError, ValueError):
            pass
    return out


def feed_readers(folder, days):
    """{day: {"feed": readers, "calendar": readers, "feedHits": n, "calendarHits": n}} from the IIS logs."""
    want = set(days)
    readers = defaultdict(lambda: defaultdict(set))
    hits = defaultdict(Counter)
    first = dt.datetime.strptime(min(days), "%Y-%m-%d") - dt.timedelta(days=1)
    for path in sorted(glob.glob(os.path.join(folder, "u_ex*.log"))):
        try:
            if dt.datetime.strptime(os.path.basename(path)[4:10], "%y%m%d") < first:
                continue
        except ValueError:
            continue
        fields = []
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                if line.startswith("#Fields:"):
                    fields = line.split()[1:]
                    continue
                if line.startswith("#") or not fields:
                    continue
                p = line.split()
                if len(p) != len(fields):
                    continue
                r = dict(zip(fields, p))
                kind = FEEDS.get(r.get("cs-uri-stem", ""))
                if not kind or r.get("sc-status") not in ("200", "304"):
                    continue
                try:
                    day = eastern(dt.datetime.strptime(r["date"] + " " + r["time"], "%Y-%m-%d %H:%M:%S")).strftime("%Y-%m-%d")
                except (KeyError, ValueError):
                    continue
                if day not in want:
                    continue
                ip = r.get("CF-Connecting-IP") or r.get("c-ip", "-")
                readers[day][kind].add((ip, r.get("cs(User-Agent)", "")))
                hits[day][kind] += 1
    return {d: {"feed": len(readers[d]["feed"]), "calendar": len(readers[d]["calendar"]),
                "feedHits": hits[d]["feed"], "calendarHits": hits[d]["calendar"]} for d in days}


def pickem(folder):
    out = []
    for ev in sorted(glob.glob(os.path.join(folder, "*"))):
        if not os.path.isdir(ev):
            continue
        entries, hidden, picks = 0, 0, 0
        for e in glob.glob(os.path.join(ev, "entry-*.json")):
            try:
                with open(e, encoding="utf-8") as f:
                    x = json.load(f)
            except (OSError, ValueError):
                continue
            entries += 1
            hidden += 1 if x.get("hidden") else 0
            picks += len(x.get("picks") or [])
        out.append({"event": os.path.basename(ev), "entries": entries, "hidden": hidden, "picks": picks})
    return out


def total(days_data, key):
    c = Counter()
    for d in days_data.values():
        c.update(d.get(key) or {})
    return c


def page(report):
    e = html.escape
    pct = lambda a, b: f"{100 * a / b:.0f}%" if b else "–"
    rows = []
    for d in reversed(report["days"]):
        u = report["usage"].get(d, {})
        f = report["feeds"].get(d, {})
        v, s = u.get("visits", 0), u.get("secondPage", 0)
        rows.append(f"<tr><td>{d}</td><td>{v}</td><td>{s}</td><td>{pct(s, v)}</td><td>{f.get('feed', 0)}</td><td>{f.get('calendar', 0)}</td></tr>")
    def shares(title, c):
        n = sum(c.values())
        body = "".join(f"<tr><td>{e(k)}</td><td>{v}</td><td>{pct(v, n)}</td></tr>" for k, v in c.most_common(15)) or "<tr><td colspan=3>no data yet</td></tr>"
        return f"<div class=card><h2>{e(title)}</h2><table><tr><th></th><th>visits</th><th>share</th></tr>{body}</table></div>"
    t = report["totals"]
    pk = "".join(f"<tr><td>{e(p['event'])}</td><td>{p['entries']}</td><td>{p['hidden']}</td><td>{p['picks']}</td></tr>" for p in report["pickem"]) or "<tr><td colspan=4>no entries yet</td></tr>"
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RiftWise funnel</title><style>
body{{margin:0;background:#0f1117;color:#e6e6e6;font:14px/1.5 system-ui,"Segoe UI",sans-serif}}main{{max-width:1100px;margin:0 auto;padding:20px 16px}}
h1{{font-size:20px;margin:0 0 4px}}p{{color:#9aa3b2;margin:0 0 16px}}.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:16px}}
.kpi{{background:#171a23;border:1px solid #262b38;border-radius:6px;padding:12px}}.kpi b{{display:block;font-size:24px}}.kpi span{{color:#9aa3b2;font-size:12px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin-bottom:16px}}.card{{background:#171a23;border:1px solid #262b38;border-radius:6px;padding:12px;overflow-x:auto}}
h2{{font-size:14px;margin:0 0 8px}}table{{border-collapse:collapse;width:100%}}td,th{{text-align:left;padding:4px 8px;border-top:1px solid #262b38;white-space:nowrap}}th{{color:#9aa3b2;font-weight:600}}
</style></head><body><main>
<h1>RiftWise funnel, last {len(report['days'])} days</h1>
<p>Updated {e(report['updated'])} (US Eastern days). Visits are browsers counted once a day by the app itself (bots don't run it); counting started with v0.7.52 on 2026-10-27, so earlier days are empty. Feed and calendar readers: one address and app a day.</p>
<div class=kpis>
<div class=kpi><b>{t['visits']}</b><span>visits</span></div>
<div class=kpi><b>{pct(t['secondPage'], t['visits'])}</b><span>went past the first page ({t['secondPage']})</span></div>
<div class=kpi><b>{t['pickem']}</b><span>Pick'Em entries (all events)</span></div>
<div class=kpi><b>{t['feedPerDay']:.1f}</b><span>results-feed readers a day</span></div>
<div class=kpi><b>{t['calendarPerDay']:.1f}</b><span>calendar subscribers a day</span></div>
<div class=kpi><b>{pct(report['apps'].get('desktop', 0), t['visits'])}</b><span>visits from the desktop app</span></div>
</div>
<div class=grid>{shares("Themes", Counter(report['themes']))}{shares("Languages", Counter(report['langs']))}{shares("App and version", Counter(report['apps']) + Counter({'v' + k: v for k, v in report['versions'].items()}))}</div>
<div class=grid><div class=card><h2>Pick'Em</h2><table><tr><th>event</th><th>entries</th><th>names hidden</th><th>picks</th></tr>{pk}</table></div></div>
<div class=card><h2>By day</h2><table><tr><th>day</th><th>visits</th><th>2nd page</th><th>%</th><th>feed readers</th><th>calendar</th></tr>{''.join(rows)}</table></div>
</main></body></html>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--usage", default=USAGE)
    ap.add_argument("--pickem", default=PICKEM)
    ap.add_argument("--logs", default=LOGS)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()
    today = eastern(utcnow()).date()
    days = [(today - dt.timedelta(days=i)).isoformat() for i in range(args.days - 1, -1, -1)]
    usage = usage_days(args.usage, days)
    # finished days come from the cache (the logs of 30 days are ~1 GB): only the last two are read again
    cache_path = os.path.join(args.out, "riftwise-funnel-cache.json")
    try:
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
    except (OSError, ValueError):
        cache = {}
    final = (today - dt.timedelta(days=1)).isoformat()
    fresh = feed_readers(args.logs, [d for d in days if d not in cache or d >= final])
    feeds = {d: fresh.get(d) or cache[d] for d in days}
    pk = pickem(args.pickem)
    report = {
        "updated": eastern(utcnow()).strftime("%Y-%m-%d %H:%M"),
        "days": days, "usage": usage, "feeds": feeds, "pickem": pk,
        "themes": total(usage, "themes"), "langs": total(usage, "langs"), "apps": total(usage, "apps"), "versions": total(usage, "versions"),
        "totals": {
            "visits": sum(u.get("visits", 0) for u in usage.values()),
            "secondPage": sum(u.get("secondPage", 0) for u in usage.values()),
            "pickem": sum(p["entries"] for p in pk),
            "feedPerDay": sum(f["feed"] for f in feeds.values()) / len(days),
            "calendarPerDay": sum(f["calendar"] for f in feeds.values()) / len(days),
        },
    }
    os.makedirs(args.out, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({d: v for d, v in feeds.items() if d < final}, f)
    for name, text in (("riftwise-funnel.json", json.dumps(report, indent=1)), ("riftwise-funnel.html", page(report))):
        tmp = os.path.join(args.out, name + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, os.path.join(args.out, name))
    print(f"funnel: {report['totals']}")


if __name__ == "__main__":
    main()
