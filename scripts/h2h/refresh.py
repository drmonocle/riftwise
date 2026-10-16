"""Rebuild the live all-time head-to-head table for RiftWise.

Starts from the newest stats build's head-to-head table (lolworlds.com/riftwise/stats/<version>/hub/h2h/base.json:
every game in the RiftWise database, rebuilt whenever the database changes) or, if that can't be read, from the
bundled src/all_time_h2h.json (every game up to BASE_CUTOFF), and adds every completed series since then from the
lolesports API, across every league.
Writes {"cutoff", "pairs", ...} to the output path; the app downloads it and counts schedule
results from `cutoff` on itself, so nothing is counted twice.

    python scripts/h2h/refresh.py out/h2h.json

Run every few hours by .github/workflows/h2h-data.yml. Standard library only.
"""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE_PATH = os.path.join(ROOT, "src", "all_time_h2h.json")
# Per-pair series history from the catalog (h2h-refresh/series_from_catalog.py), same cutoff.
BASE_SERIES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "base_series.json")
RECENT_N = 10
INTL_LEAGUE = re.compile(r"world|msi|mid-season|first stand", re.I)
BASE_CUTOFF = "2026-09-26T00:00:00Z"  # keep in sync with BUNDLED_H2H_CUTOFF in src/helpers.ts
# keep in sync with CODE_ALIASES in src/helpers.ts
CODE_ALIASES = {"TLAW": "TL", "MKOI": "MDK", "KRX": "DRX", "DNS": "KDF", "DNF": "KDF"}

API = "https://esports-api.lolesports.com/persisted/gw"
# Public key used by the lolesports.com web client (same one the app uses).
HEADERS = {"x-api-key": "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z", "User-Agent": "RiftWise-H2H/1.0"}
# A match still marked unstarted this long after its start time is treated as postponed, not pending.
STALE_PENDING = timedelta(hours=48)
# The stats build's table (same games as the stats pages). H2H_HUB_BASE can point at a local file for testing.
HUB = "https://lolworlds.com/riftwise/stats"


def hub_base():
    """(pairs, series, cutoff) from the newest stats build, or None."""
    try:
        local = os.environ.get("H2H_HUB_BASE")
        if local:
            data = json.load(open(local, encoding="utf-8"))
        else:
            req = lambda u: urllib.request.Request(u, headers={"User-Agent": "RiftWise-H2H/1.0"})
            with urllib.request.urlopen(req(f"{HUB}/latest.json"), timeout=30) as r:
                version = json.load(r)["version"]
            with urllib.request.urlopen(req(f"{HUB}/{version}/hub/h2h/base.json"), timeout=60) as r:
                data = json.load(r)
        if not data.get("cutoff") or not data.get("pairs") or data["cutoff"] <= BASE_CUTOFF:
            return None
        return data["pairs"], data.get("series") or {}, data["cutoff"], data.get("names") or {}
    except Exception as e:  # stats site down: fall back to the bundled table
        print(f"stats build table unavailable ({e}); using the bundled one")
        return None


def get(path, **params):
    url = f"{API}/{path}?" + urllib.parse.urlencode({"hl": "en-US", **params})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as r:
                return json.load(r)["data"]
        except Exception as e:  # network blip or 5xx: retry with backoff
            if attempt == 4:
                raise RuntimeError(f"{url}: {e}")
            time.sleep(2 * (attempt + 1))


def norm(code):
    c = (code or "").strip().upper()
    return CODE_ALIASES.get(c, c)


def name_key(name):
    """"LYON (2024 American Team)" and "LYON" -> "lyon" (Leaguepedia adds the bracket to tell same-named teams apart)."""
    n = unicodedata.normalize("NFKD", re.sub(r"\s*\(.*?\)", "", name or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", n)


def code_fixes(base_names, base_pairs):
    """Our code -> lolesports code, for teams whose lolesports code isn't ours, matched by the team's current
    name (names[0]), so e.g. our "100T" history counts for lolesports' "100". Codes lolesports also uses are kept."""
    ours = set(base_names)
    teams = get("getTeams")["teams"]
    theirs_all = {norm(t.get("code")) for t in teams}
    by_name = defaultdict(set)
    for code, names in base_names.items():
        if names and code not in theirs_all:
            by_name[name_key(names[0])].add(code)
    games = defaultdict(int)
    for k, (aw, bw) in base_pairs.items():
        for c in k.split("__"):
            games[c] += aw + bw
    fixes = {}
    for t in teams:
        theirs = norm(t.get("code"))
        cands = by_name.get(name_key(t.get("name")), set())
        if not theirs or theirs in ours or len(cands) != 1:
            continue
        mine = next(iter(cands))
        if fixes.get(mine, theirs) != theirs:
            fixes[mine] = None  # two lolesports codes for one of ours: leave it alone
        else:
            fixes[mine] = theirs
    # lolesports sometimes gives two teams one code ("LYON" = LYON and Lyon Academy): the busier of ours gets it
    best = {}
    for mine, theirs in fixes.items():
        if theirs and (theirs not in best or games[mine] > games[best[theirs]]):
            best[theirs] = mine
    return {mine: theirs for theirs, mine in best.items()}


def parse_time(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def league_events(league_id, since):
    """Every match event for a league from `since` up to the newest page."""
    events = []
    page = get("getSchedule", leagueId=league_id)["schedule"]
    while True:
        evs = [e for e in page.get("events", []) if e.get("type") == "match" and e.get("startTime")]
        events += [e for e in evs if parse_time(e["startTime"]) >= since]
        older = page.get("pages", {}).get("older")
        if not older or not evs or min(parse_time(e["startTime"]) for e in evs) < since:
            return events
        page = get("getSchedule", leagueId=league_id, pageToken=older)["schedule"]


def main(out_path):
    now = datetime.now(timezone.utc)
    hub = hub_base()
    if hub:
        base, hub_series, base_cutoff_s, names = hub
        print(f"base: stats build table, {len(base)} pairs up to {base_cutoff_s}")
        fixes = code_fixes(names, base) if names else {}
        if fixes:
            print(f"{len(fixes)} codes renamed to lolesports codes, e.g. "
                  + ", ".join(f"{a}->{b}" for a, b in sorted(fixes.items())[:12]))
            ren = lambda k: "__".join(sorted(fixes.get(c, c) for c in k.split("__")))
            moved = defaultdict(lambda: [0, 0])
            for k, (aw, bw) in base.items():
                a, b = k.split("__")
                a2, b2 = fixes.get(a, a), fixes.get(b, b)
                if a2 == b2:
                    continue
                if a2 > b2:
                    a2, b2, aw, bw = b2, a2, bw, aw
                moved[f"{a2}__{b2}"][0] += aw
                moved[f"{a2}__{b2}"][1] += bw
            base = dict(moved)
            renamed = {}
            for k, v in hub_series.items():
                k2 = ren(k)
                first = fixes.get(k.split("__")[0], k.split("__")[0])
                if len(set(k2.split("__"))) < 2:
                    continue
                if first != k2.split("__")[0]:  # sides swapped
                    v = {"intl": v["intl"][::-1], "recent": [[d, e, bw, aw] for d, e, aw, bw in v["recent"]]}
                if k2 in renamed:  # two of our codes became one: keep both histories
                    old = renamed[k2]
                    v = {"intl": [old["intl"][0] + v["intl"][0], old["intl"][1] + v["intl"][1]],
                         "recent": sorted(old["recent"] + v["recent"], reverse=True)[:RECENT_N]}
                renamed[k2] = v
            hub_series = renamed
    else:
        base, hub_series, base_cutoff_s = json.load(open(BASE_PATH, encoding="utf-8")), None, BASE_CUTOFF
    base_cutoff = parse_time(base_cutoff_s)
    # With the stats build's table, also look a few days before its cutoff and keep only the series it doesn't have
    # (matched below by teams and date): its newest games carry their series' scheduled start, so a series that
    # began exactly at the cutoff would otherwise count twice (MVK-FUR 3-0 at Worlds 2026 showed as 6-0), and a
    # series the database was late to get is still counted.
    window = base_cutoff - timedelta(days=3) if hub else base_cutoff

    events = {}
    for league in get("getLeagues")["leagues"]:
        for e in league_events(league["id"], window):
            events[e["match"]["id"]] = e

    # Stop just before the earliest match that has started but isn't finished, so a series that
    # is in progress right now is left to the app instead of being cut in half.
    pending = [parse_time(e["startTime"]) for e in events.values()
               if e.get("state") != "completed" and now - STALE_PENDING <= parse_time(e["startTime"]) <= now]
    cutoff = min([now] + pending)

    pairs = defaultdict(lambda: [0, 0])
    for k, (aw, bw) in base.items():
        a, b = k.split("__")
        a, b = norm(a), norm(b)
        if a > b:
            a, b, aw, bw = b, a, bw, aw
        pairs[(a, b)][0] += aw
        pairs[(a, b)][1] += bw

    # Series history for the H2H details view: catalog history plus the new series.
    series = {}
    if hub_series is not None:
        series = hub_series
    elif os.path.exists(BASE_SERIES_PATH):
        series = json.load(open(BASE_SERIES_PATH, encoding="utf-8"))
    new_series = []
    known = defaultdict(list)  # pair -> dates of the series the base table already has
    for key, entry in series.items():
        for d, *_ in entry.get("recent", []):
            if d and len(d) >= 10:  # a few old series have no date
                known[key].append(date.fromisoformat(d[:10]))

    added = skipped = 0
    for e in sorted(events.values(), key=lambda e: e["startTime"]):
        start = parse_time(e["startTime"])
        if e.get("state") != "completed" or not (window <= start < cutoff):
            continue
        t1, t2 = e["match"]["teams"]
        a, b = norm(t1.get("code")), norm(t2.get("code"))
        aw = (t1.get("result") or {}).get("gameWins") or 0
        bw = (t2.get("result") or {}).get("gameWins") or 0
        if not a or not b or a == b or "TBD" in (a, b) or aw + bw == 0:
            continue
        if a > b:
            a, b, aw, bw = b, a, bw, aw
        # already in the base table: same teams within a day (each base series matches one lolesports series)
        same = [i for i, d in enumerate(known.get(f"{a}__{b}", [])) if abs((d - start.date()).days) <= 1]
        if same:
            known[f"{a}__{b}"].pop(same[0])
            skipped += 1
            continue
        pairs[(a, b)][0] += aw
        pairs[(a, b)][1] += bw
        added += 1
        league = (e.get("league") or {}).get("name") or ""
        new_series.append((f"{a}__{b}", start.strftime("%Y-%m-%d"), league, aw, bw))

    for key, day, league, aw, bw in sorted(new_series, key=lambda s: s[1], reverse=True):
        entry = series.setdefault(key, {"intl": [0, 0], "recent": []})
        if INTL_LEAGUE.search(league):
            entry["intl"][0] += aw
            entry["intl"][1] += bw
        entry["recent"].insert(0, [day, league, aw, bw])
    for entry in series.values():
        entry["recent"].sort(key=lambda s: s[0], reverse=True)
        del entry["recent"][RECENT_N:]

    out = {
        "version": 2,
        "generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "cutoff": cutoff.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "baseCutoff": base_cutoff_s,
        "seriesAdded": added,
        "pairs": {f"{a}__{b}": v for (a, b), v in sorted(pairs.items())},
    }
    out_dir = os.path.dirname(os.path.abspath(out_path))
    os.makedirs(os.path.join(out_dir, "series"), exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    # Shard the series history by the first character of the pair key (A-Z, else "0"), so the
    # app fetches one small file when a meter is tapped instead of the whole history.
    shards = {}
    for key, entry in series.items():
        shards.setdefault(shard_of(key), {})[key] = entry
    for name, data in shards.items():
        with open(os.path.join(out_dir, "series", f"{name}.json"), "w", encoding="utf-8", newline="") as f:
            json.dump(dict(sorted(data.items())), f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(events)} events since {window:%Y-%m-%d %H:%M}; added {added} completed series, {skipped} already in the base; "
          f"{len(out['pairs'])} pairs; cutoff {out['cutoff']}; {len(series)} pairs with history in {len(shards)} shards")


def shard_of(key):
    c = key[:1].upper()
    return c if "A" <= c <= "Z" else "0"


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "h2h.json")
