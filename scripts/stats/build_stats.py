"""
Builds the RiftWatch Stats tab data from the Twitch bot's pro games catalog.

Reads pro_games_catalog.db (read-only) and writes small JSON files the app loads one at a time,
so the Stats tab never downloads or crunches the whole database:

  <out>/latest.json                  {"version": "...", "built": "..."}  (never cached)
  <out>/<version>/meta.json          totals, years, patches
  <out>/<version>/search.json        team + player names for the search box
  <out>/<version>/teams/<slug>.json  one team
  <out>/<version>/players/<slug>.json one player
  <out>/<version>/champions/<key>.json  champion pick/ban/win rates for a year or a patch
  <out>/<version>/records.json       all-time records (top leagues)
  <out>/<version>/titles.json        tournament winners (from grand finals)

Each run writes a new <version> folder and only then points latest.json at it, so readers never
see a half-written build. Older version folders are removed (the newest two are kept).

  python build_stats.py --db C:\\Users\\TV\\twitch_bot\\data\\pro_games_catalog.db --out C:\\inetpub\\wwwroot\\riftwatch\\stats
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import sqlite3
import time
from collections import Counter, defaultdict

MIN_SEARCH_GAMES = 10     # teams / players with fewer games get no page
RECORD_MIN_MINUTES = 14   # shorter "games" are remakes or forfeits
TOP_PATCHES = 6           # newest patches that get their own champion file


def slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "x"
    return f"{base}-{hashlib.sha1(name.encode('utf-8')).hexdigest()[:6]}"


# "Top leagues": the tier-1 regional leagues and the international events. Used for champion
# pick rates and records, so they aren't skewed by amateur and qualifier games.
TOP_LEAGUE = re.compile(
    r"^(LPL|LCK|LCK Cup|Champions|LEC|EU LCS|NA LCS|LCS|LTA|LTA North|LTA South|LMS|PCS|LCP|CBLOL|VCS|LJL"
    r"|Worlds|MSI|First Stand|Esports World Cup)( |$)"
)


def is_major(tier: str, tournament: str) -> bool:
    return bool(tier) and tier != "Secondary" and bool(TOP_LEAGUE.match(tournament or "")) \
        and "qualif" not in (tournament or "").lower()


def r1(x: float) -> float:
    return round(x, 1)


def r2(x: float) -> float:
    return round(x, 2)


def kda(k: int, d: int, a: int) -> float:
    return r2((k + a) / max(d, 1))


def jlist(s):
    if not s:
        return []
    try:
        v = json.loads(s)
        return [x for x in v if x] if isinstance(v, list) else []
    except Exception:
        return [x.strip() for x in str(s).split(",") if x.strip()]


def patch_key(p: str):
    try:
        return tuple(int(x) for x in p.split("."))
    except Exception:
        return (0,)


def write(path: str, obj) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    t0 = time.time()

    con = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row

    # â”€â”€ Games â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    games = {}
    for r in con.execute(
        """SELECT game_id, match_id, tournament_name, tournament_tier, date_utc, patch, team1, team2,
                  winner, duration_minutes, team1_kills, team2_kills, total_kills FROM matches
           WHERE team1 IS NOT NULL AND team2 IS NOT NULL AND winner IN (team1, team2)"""
    ):
        games[r["game_id"]] = {
            "match": r["match_id"] or r["game_id"],
            "t": r["tournament_name"] or "",
            "major": is_major(r["tournament_tier"] or "", r["tournament_name"] or ""),
            "tier": r["tournament_tier"] or "",
            "date": (r["date_utc"] or "")[:10],
            "year": (r["date_utc"] or "0000")[:4],
            "patch": (r["patch"] or "").strip(),
            "t1": r["team1"],
            "t2": r["team2"],
            "w": r["winner"],
            "min": r["duration_minutes"] or 0,
            "k1": r["team1_kills"],
            "k2": r["team2_kills"],
            "tk": r["total_kills"],
        }
    print(f"games: {len(games)}")

    tstats = {}
    for r in con.execute("SELECT * FROM team_game_stats"):
        if r["game_id"] in games:
            tstats[r["game_id"]] = dict(r)

    # â”€â”€ Player names â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    display = {}
    for r in con.execute("SELECT page, display FROM player_pages_map WHERE page IS NOT NULL"):
        if r["display"] and r["page"] not in display:
            display[r["page"]] = r["display"]

    def pname(page: str) -> str:
        return display.get(page) or re.sub(r"\s*\(.*\)$", "", page)

    # â”€â”€ Series (best-of results) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    series = defaultdict(lambda: {"games": [], "wins": Counter()})
    for gid, g in games.items():
        s = series[g["match"]]
        s["games"].append(gid)
        s["wins"][g["w"]] += 1
    series_list = []
    for mid, s in series.items():
        g0 = games[s["games"][0]]
        a, b = g0["t1"], g0["t2"]
        wa, wb = s["wins"][a], s["wins"][b]
        if wa == wb:
            continue
        series_list.append({
            "id": mid, "date": max(games[x]["date"] for x in s["games"]), "t": g0["t"], "tier": g0["tier"],
            "major": g0["major"], "a": a, "b": b, "wa": wa, "wb": wb, "w": a if wa > wb else b,
        })
    series_list.sort(key=lambda s: s["date"])

    # â”€â”€ Titles: winners of grand finals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    titles = []
    for s in series_list:
        if s["tier"].endswith("GRAND_FINALS"):
            kind = "Worlds" if "WORLDS" in s["tier"] else "MSI" if "MSI" in s["tier"] else "Regional"
            titles.append({"t": s["t"], "date": s["date"], "kind": kind, "w": s["w"],
                           "l": s["b"] if s["w"] == s["a"] else s["a"], "score": f"{max(s['wa'], s['wb'])}-{min(s['wa'], s['wb'])}"})
    titles.sort(key=lambda x: x["date"], reverse=True)
    titles_by_team = defaultdict(list)
    for t in titles:
        titles_by_team[t["w"]].append(t)
    # One final per tournament: keep the latest series per tournament name (some finals are logged twice)
    seen = set()
    titles_unique = []
    for t in titles:
        if t["t"] in seen:
            continue
        seen.add(t["t"])
        titles_unique.append(t)

    # â”€â”€ Per-player game rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    team_players = defaultdict(lambda: defaultdict(Counter))  # team -> year -> page -> games
    team_roles = defaultdict(dict)                            # (team, page) -> role counter
    players = defaultdict(lambda: {
        "g": 0, "w": 0, "k": 0, "d": 0, "a": 0, "cs": 0, "gold": 0, "dmg": 0, "min": 0.0, "stat_min": 0.0,
        "roles": Counter(), "teams": {}, "years": {}, "champs": {}, "recent": [], "best": {},
    })
    champ_rows = defaultdict(lambda: defaultdict(lambda: {"p": 0, "w": 0, "k": 0, "d": 0, "a": 0, "roles": Counter()}))
    record_rows = {"kills": [], "assists": [], "dmg": [], "cs": [], "perfect": []}

    q = con.execute(
        """SELECT game_id, team, page_key, role, champion, kills, deaths, assists, gold, cs, damage, win
           FROM player_game_stats"""
    )
    for r in q:
        g = games.get(r["game_id"])
        if not g or not r["page_key"]:
            continue
        page = r["page_key"]
        team = r["team"]
        won = 1 if g["w"] == team else 0
        k, d, a = r["kills"] or 0, r["deaths"] or 0, r["assists"] or 0
        champ = r["champion"] or ""
        p = players[page]
        p["g"] += 1
        p["w"] += won
        p["k"] += k
        p["d"] += d
        p["a"] += a
        if r["cs"] is not None and r["gold"] is not None and g["min"]:
            p["cs"] += r["cs"]
            p["gold"] += r["gold"]
            p["dmg"] += r["damage"] or 0
            p["stat_min"] += g["min"]
        p["min"] += g["min"]
        p["roles"][r["role"] or "?"] += 1
        tm = p["teams"].setdefault(team, {"g": 0, "w": 0, "from": g["date"], "to": g["date"]})
        tm["g"] += 1
        tm["w"] += won
        tm["from"] = min(tm["from"], g["date"])
        tm["to"] = max(tm["to"], g["date"])
        yr = p["years"].setdefault(g["year"], {"g": 0, "w": 0, "k": 0, "d": 0, "a": 0, "teams": Counter()})
        yr["g"] += 1
        yr["w"] += won
        yr["k"] += k
        yr["d"] += d
        yr["a"] += a
        yr["teams"][team] += 1
        if champ:
            ch = p["champs"].setdefault(champ, {"g": 0, "w": 0, "k": 0, "d": 0, "a": 0})
            ch["g"] += 1
            ch["w"] += won
            ch["k"] += k
            ch["d"] += d
            ch["a"] += a
        opp = g["t2"] if team == g["t1"] else g["t1"]
        p["recent"].append((g["date"], r["game_id"], team, opp, champ, k, d, a, won, g["t"]))
        if len(p["recent"]) > 60:
            p["recent"].sort(reverse=True)
            del p["recent"][20:]
        for key, val in (("kills", k), ("assists", a), ("dmg", r["damage"] or 0), ("cs", r["cs"] or 0)):
            b = p["best"].get(key)
            if b is None or val > b[0]:
                p["best"][key] = (val, g["date"], champ, opp, g["t"])

        team_players[team][g["year"]][page] += 1
        team_roles[team].setdefault(page, Counter())[r["role"] or "?"] += 1

        if champ:
            for key in (f"y{g['year']}", f"p{g['patch']}" if g["patch"] else None):
                if not key:
                    continue
                for scope in ("all", "major") if g["major"] else ("all",):
                    c = champ_rows[(key, scope)][champ]
                    c["p"] += 1
                    c["w"] += won
                    c["k"] += k
                    c["d"] += d
                    c["a"] += a
                    c["roles"][r["role"] or "?"] += 1

        if g["major"] and g["min"] >= RECORD_MIN_MINUTES:
            base = {"pl": pname(page), "ps": page, "team": team, "opp": opp, "c": champ, "date": g["date"],
                    "t": g["t"], "kda": f"{k}/{d}/{a}"}
            record_rows["kills"].append((k, base))
            record_rows["assists"].append((a, base))
            record_rows["dmg"].append((r["damage"] or 0, base))
            record_rows["cs"].append((r["cs"] or 0, base))
            if d == 0:
                record_rows["perfect"].append((k + a, base))
            for key in record_rows:
                if len(record_rows[key]) > 2000:
                    record_rows[key].sort(key=lambda x: x[0], reverse=True)
                    del record_rows[key][50:]
    print(f"players: {len(players)}  ({time.time() - t0:.0f}s)")

    # â”€â”€ Bans per year / patch (from team_game_stats) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    champ_bans = defaultdict(Counter)
    champ_games = Counter()
    for gid, g in games.items():
        keys = [f"y{g['year']}"] + ([f"p{g['patch']}"] if g["patch"] else [])
        scopes = ("all", "major") if g["major"] else ("all",)
        for key in keys:
            for scope in scopes:
                champ_games[(key, scope)] += 1
        ts = tstats.get(gid)
        if not ts:
            continue
        bans = jlist(ts.get("team1_bans")) + jlist(ts.get("team2_bans"))
        for key in keys:
            for scope in scopes:
                for b in bans:
                    champ_bans[(key, scope)][b] += 1

    # â”€â”€ Team aggregation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    teams = defaultdict(lambda: {
        "g": 0, "w": 0, "min": 0.0, "kills": 0, "deaths": 0, "years": {}, "opps": {}, "champs": Counter(),
        "champ_w": Counter(), "bans_by": Counter(), "obj": Counter(), "obj_g": 0, "tourn": {}, "streak": 0, "best_streak": None,
        "from": "9999", "to": "0000",
    })
    by_date = sorted(games.items(), key=lambda kv: (kv[1]["date"], kv[0]))
    for gid, g in by_date:
        ts = tstats.get(gid)
        for side, (team, opp) in enumerate(((g["t1"], g["t2"]), (g["t2"], g["t1"]))):
            won = 1 if g["w"] == team else 0
            t = teams[team]
            t["g"] += 1
            t["w"] += won
            t["min"] += g["min"]
            k_own, k_opp = (g["k1"], g["k2"]) if side == 0 else (g["k2"], g["k1"])
            t["kills"] += k_own or 0
            t["deaths"] += k_opp or 0
            t["from"] = min(t["from"], g["date"])
            t["to"] = max(t["to"], g["date"])
            y = t["years"].setdefault(g["year"], {"g": 0, "w": 0})
            y["g"] += 1
            y["w"] += won
            o = t["opps"].setdefault(opp, {"g": 0, "w": 0, "last": ""})
            o["g"] += 1
            o["w"] += won
            o["last"] = max(o["last"], g["date"])
            tr = t["tourn"].setdefault(g["t"], {"g": 0, "w": 0, "date": g["date"]})
            tr["g"] += 1
            tr["w"] += won
            tr["date"] = max(tr["date"], g["date"])
            # streaks (games, any league)
            if won:
                t["streak"] += 1
                if t["best_streak"] is None or t["streak"] > t["best_streak"][0]:
                    t["best_streak"] = (t["streak"], g["date"])
            else:
                t["streak"] = 0
            if ts:
                pre = "team1" if ts.get("team1") == team else "team2"
                opre = "team2" if pre == "team1" else "team1"
                for c in jlist(ts.get(f"{pre}_picks")):
                    t["champs"][c] += 1
                    t["champ_w"][c] += won
                for c in jlist(ts.get(f"{pre}_bans")):
                    t["bans_by"][c] += 1
                if ts.get(f"{pre}_gold") is not None:
                    t["obj_g"] += 1
                    for f in ("dragons", "barons", "towers", "heralds"):
                        t["obj"][f] += ts.get(f"{pre}_{f}") or 0
                    t["obj"]["golddiff"] += (ts.get(f"{pre}_gold") or 0) - (ts.get(f"{opre}_gold") or 0)

    team_series = defaultdict(list)
    for s in series_list:
        team_series[s["a"]].append(s)
        team_series[s["b"]].append(s)

    # â”€â”€ Write â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    version = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
    vdir = os.path.join(args.out, version)
    os.makedirs(vdir, exist_ok=True)

    search_teams, search_players = [], []

    for name, t in teams.items():
        if t["g"] < MIN_SEARCH_GAMES:
            continue
        s = slug(name)
        search_teams.append({"n": name, "s": s, "g": t["g"], "y": t["to"][:4]})
        ss = team_series[name]
        sw = sum(1 for x in ss if x["w"] == name)
        roster = []
        for year in sorted(team_players[name], reverse=True)[:6]:
            top = team_players[name][year].most_common(8)
            roster.append({"y": year, "p": [{"n": pname(pg), "s": slug(pg), "g": n,
                                             "r": team_roles[name][pg].most_common(1)[0][0]} for pg, n in top if n >= 3]})
        og = t["obj_g"]
        write(os.path.join(vdir, "teams", f"{s}.json"), {
            "name": name, "g": t["g"], "w": t["w"], "sg": len(ss), "sw": sw,
            "from": t["from"], "to": t["to"],
            "avgMin": r1(t["min"] / t["g"]) if t["g"] else 0,
            "kills": r1(t["kills"] / t["g"]), "deaths": r1(t["deaths"] / t["g"]),
            "obj": {f: r2(t["obj"][f] / og) for f in ("dragons", "barons", "towers", "heralds", "golddiff")} if og else None,
            "years": [{"y": y, **v} for y, v in sorted(t["years"].items(), reverse=True)],
            "recent": [{"date": x["date"], "opp": x["b"] if x["a"] == name else x["a"], "t": x["t"],
                        "us": x["wa"] if x["a"] == name else x["wb"], "them": x["wb"] if x["a"] == name else x["wa"]}
                       for x in ss[-10:][::-1]],
            "opps": sorted(({"n": o, "s": slug(o) if teams[o]["g"] >= MIN_SEARCH_GAMES else None, **v}
                            for o, v in t["opps"].items()), key=lambda x: -x["g"])[:40],
            "champs": [{"c": c, "g": n, "w": t["champ_w"][c]} for c, n in t["champs"].most_common(20)],
            "bans": [{"c": c, "g": n} for c, n in t["bans_by"].most_common(10)],
            "tourns": sorted(({"t": k, **v} for k, v in t["tourn"].items()), key=lambda x: x["date"], reverse=True)[:12],
            "titles": titles_by_team.get(name, [])[:30],
            "bestStreak": {"n": t["best_streak"][0], "date": t["best_streak"][1]} if t["best_streak"] else None,
            "roster": roster,
        })

    for page, p in players.items():
        if p["g"] < MIN_SEARCH_GAMES:
            continue
        s = slug(page)
        teams_sorted = sorted(p["teams"].items(), key=lambda kv: kv[1]["to"], reverse=True)
        # Current team: the club with the most games in the player's last year (not a one-off national team)
        last_date = teams_sorted[0][1]["to"] if teams_sorted else ""
        cutoff = str(int(last_date[:4]) - 1) + last_date[4:] if last_date else ""
        recent_clubs = [(v["g"], n) for n, v in teams_sorted if v["to"] >= cutoff and "National Team" not in n]
        last_team = max(recent_clubs)[1] if recent_clubs else (teams_sorted[0][0] if teams_sorted else "")
        search_players.append({"n": pname(page), "s": s, "t": last_team, "g": p["g"], "y": teams_sorted[0][1]["to"][:4] if teams_sorted else ""})
        sm = p["stat_min"]
        p["recent"].sort(reverse=True)
        write(os.path.join(vdir, "players", f"{s}.json"), {
            "name": pname(page), "page": page, "role": p["roles"].most_common(1)[0][0],
            "g": p["g"], "w": p["w"], "k": p["k"], "d": p["d"], "a": p["a"], "kda": kda(p["k"], p["d"], p["a"]),
            "csm": r1(p["cs"] / sm) if sm else None, "gpm": round(p["gold"] / sm) if sm else None,
            "dpm": round(p["dmg"] / sm) if sm else None,
            "teams": [{"n": n, "s": slug(n) if teams[n]["g"] >= MIN_SEARCH_GAMES else None, **v} for n, v in teams_sorted],
            "years": [{"y": y, "g": v["g"], "w": v["w"], "kda": kda(v["k"], v["d"], v["a"]),
                       "team": v["teams"].most_common(1)[0][0]} for y, v in sorted(p["years"].items(), reverse=True)],
            "champs": sorted(({"c": c, **v, "kda": kda(v["k"], v["d"], v["a"])} for c, v in p["champs"].items()),
                             key=lambda x: -x["g"])[:40],
            "nChamps": len(p["champs"]),
            "recent": [{"date": x[0], "team": x[2], "opp": x[3], "c": x[4], "k": x[5], "d": x[6], "a": x[7],
                        "win": x[8], "t": x[9]} for x in p["recent"][:10]],
            "best": {k: {"v": v[0], "date": v[1], "c": v[2], "opp": v[3], "t": v[4]} for k, v in p["best"].items()},
            "titles": sorted({(t["t"], t["date"], t["kind"]) for n in p["teams"] for t in titles_by_team.get(n, [])
                              if p["teams"][n]["from"] <= t["date"] <= p["teams"][n]["to"]}, key=lambda x: x[1], reverse=True)[:30],
        })
    print(f"wrote {len(search_teams)} teams, {len(search_players)} players  ({time.time() - t0:.0f}s)")

    # champions
    champ_index = []
    # Newest patches that top leagues actually played on (academy leagues run ahead on new patches)
    patches = sorted({k[1:] for k, s in champ_rows if k.startswith("p") and s == "major" and champ_games[(k, "major")] >= 50},
                     key=patch_key, reverse=True)[:TOP_PATCHES]
    years = sorted({k[1:] for k, _ in champ_rows if k.startswith("y")}, reverse=True)
    for key in [f"y{y}" for y in years] + [f"p{p}" for p in patches]:
        out = {}
        for scope in ("major", "all"):
            rows = champ_rows.get((key, scope))
            n = champ_games[(key, scope)]
            if not rows or not n:
                continue
            bans = champ_bans[(key, scope)]
            names = set(rows) | set(bans)
            out[scope] = {"games": n, "champs": sorted((
                {"c": c, "p": rows[c]["p"] if c in rows else 0, "w": rows[c]["w"] if c in rows else 0,
                 "b": bans[c], "kda": kda(rows[c]["k"], rows[c]["d"], rows[c]["a"]) if c in rows else None,
                 "role": rows[c]["roles"].most_common(1)[0][0] if c in rows else None}
                for c in names), key=lambda x: -(x["p"] + x["b"]))}
        if out:
            write(os.path.join(vdir, "champions", f"{key}.json"), out)
            champ_index.append(key)

    # records (top leagues only)
    def top(rows, n=10):
        rows = sorted(rows, key=lambda x: x[0], reverse=True)[:n]
        return [{"v": v, **b} for v, b in rows]

    major_games = [(gid, g) for gid, g in games.items() if g["major"] and g["min"] >= RECORD_MIN_MINUTES]

    def game_row(gid, g, v):
        return {"v": v, "a": g["t1"], "b": g["t2"], "w": g["w"], "date": g["date"], "t": g["t"],
                "min": r1(g["min"]), "score": f"{g['k1']}-{g['k2']}" if g["k1"] is not None else None}

    comebacks = []
    for gid, g in major_games:
        ts = tstats.get(gid)
        if not ts or ts.get("team1_gold") is None or ts.get("team2_gold") is None:
            continue
        wg = ts["team1_gold"] if ts.get("team1") == g["w"] else ts["team2_gold"]
        lg = ts["team2_gold"] if ts.get("team1") == g["w"] else ts["team1_gold"]
        if wg < lg:
            comebacks.append((lg - wg, gid, g))
    comebacks.sort(key=lambda x: x[0], reverse=True)

    major_streaks = []
    run = defaultdict(lambda: [0, ""])
    for gid, g in by_date:
        if not g["major"]:
            continue
        for team in (g["t1"], g["t2"]):
            if g["w"] == team:
                run[team][0] += 1
                run[team][1] = g["date"]
                major_streaks.append((run[team][0], team, run[team][1]))
            else:
                run[team] = [0, ""]
    best_by_team = {}
    for n, team, date in major_streaks:
        if n > best_by_team.get(team, (0, ""))[0]:
            best_by_team[team] = (n, date)

    career = [(p["g"], pg) for pg, p in players.items()]
    records = {
        "built": version,
        "note": f"Top leagues and international events only; games shorter than {RECORD_MIN_MINUTES} minutes are skipped.",
        "game": {
            "fastest": [game_row(gid, g, r1(g["min"])) for gid, g in sorted(major_games, key=lambda x: x[1]["min"])[:10]],
            "longest": [game_row(gid, g, r1(g["min"])) for gid, g in sorted(major_games, key=lambda x: -x[1]["min"])[:10]],
            "bloodiest": [game_row(gid, g, g["tk"]) for gid, g in sorted((x for x in major_games if x[1]["tk"] is not None), key=lambda x: -x[1]["tk"])[:10]],
            "comebacks": [game_row(gid, g, v) for v, gid, g in comebacks[:10]],
        },
        "player": {k: top(v) for k, v in record_rows.items()},
        "career": {
            "games": [{"v": n, "pl": pname(pg), "ps": slug(pg)} for n, pg in sorted(career, reverse=True)[:10]],
            "kills": [{"v": p["k"], "pl": pname(pg), "ps": slug(pg)} for pg, p in sorted(players.items(), key=lambda kv: -kv[1]["k"])[:10]],
            "assists": [{"v": p["a"], "pl": pname(pg), "ps": slug(pg)} for pg, p in sorted(players.items(), key=lambda kv: -kv[1]["a"])[:10]],
            "pool": [{"v": len(p["champs"]), "pl": pname(pg), "ps": slug(pg)} for pg, p in sorted(players.items(), key=lambda kv: -len(kv[1]["champs"]))[:10]],
        },
        "team": {
            "streaks": [{"v": n, "team": t, "s": slug(t), "date": d} for t, (n, d) in sorted(best_by_team.items(), key=lambda kv: -kv[1][0])[:10]],
            "titles": [{"v": n, "team": t, "s": slug(t)} for t, n in Counter(x["w"] for x in titles_unique if x["kind"] != "Regional").most_common(10)],
        },
    }
    for lst in records["player"].values():
        for x in lst:
            x["ps"] = slug(x["ps"])
    write(os.path.join(vdir, "records.json"), records)
    write(os.path.join(vdir, "titles.json"), titles_unique)

    search_teams.sort(key=lambda x: -x["g"])
    search_players.sort(key=lambda x: -x["g"])
    write(os.path.join(vdir, "search.json"), {"teams": search_teams, "players": search_players})
    write(os.path.join(vdir, "meta.json"), {
        "version": version, "games": len(games), "series": len(series_list),
        "teams": len(search_teams), "players": len(search_players),
        "from": min(g["date"] for g in games.values()), "to": max(g["date"] for g in games.values()),
        "champions": champ_index,
    })

    # Point readers at the new build, then remove old builds (keep the newest two).
    tmp = os.path.join(args.out, "latest.json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"version": version, "built": datetime.datetime.now(datetime.timezone.utc).isoformat()}, f)
    os.replace(tmp, os.path.join(args.out, "latest.json"))
    builds = sorted(d for d in os.listdir(args.out) if d.isdigit() and os.path.isdir(os.path.join(args.out, d)))
    for old in builds[:-2]:
        shutil.rmtree(os.path.join(args.out, old), ignore_errors=True)
    print(f"done: {version} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
