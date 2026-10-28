"""
Builds the RiftWise Stats tab data from the Twitch bot's pro games catalog.

Reads pro_games_catalog.db (read-only) and writes small JSON files the app loads one at a time,
so the Stats tab never downloads or crunches the whole database:

  <out>/latest.json                    {"version": "...", "built": "..."}  (never cached)
  <out>/<version>/meta.json            totals, years, patches
  <out>/<version>/hub/...              the stats pages' files (hub.py: players, teams, events, games, ...)
  <out>/<version>/champions/<key>.json pick/ban/win rates for all time, a year or a patch
  (the old per-team / per-player files and search lists of the first Stats tab stopped 2026-10-21: no app read them)
  <out>/<version>/records.json         all-time records (top leagues)
  <out>/<version>/titles.json          tournament winners
  <out>/<version>/checks.json          data checks from this build (what was skipped and why)

Teams that rebranded are one team: renames come from Leaguepedia's TeamRenames table ("rename" and
"rebrand" only; "acquire" is usually a league spot being sold to a different org), plus a few
well-known links Leaguepedia's table lacks (MANUAL_LINKS).

Each run writes a new <version> folder and only then points latest.json at it, so readers never
see a half-written build. Older version folders are removed (the newest two are kept).

The stats hub (tournament, series, champion pages and readable page links) is built by hub.py into
<version>/hub/ in the same run; see that file. --no-hub skips it.

  python build_stats.py --db C:\\Users\\TV\\twitch_bot\\data\\pro_games_catalog.db --out C:\\inetpub\\wwwroot\\riftwise\\stats
"""
import argparse
import bisect
import datetime
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import time
import types
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from names import PlayerNames, champ_name, match_teams, team_key  # noqa: E402

MIN_SEARCH_GAMES = 10     # teams / players with fewer games get no page
RECORD_MIN_MINUTES = 14   # shorter "games" are remakes or forfeits
TOP_PATCHES = 6           # newest patches that get their own champion file

# "Top leagues": the tier-1 regional leagues and the international events. Used for champion
# pick rates and records, so they aren't skewed by amateur and qualifier games.
TOP_LEAGUE = re.compile(
    r"^(LPL|LCK|LCK Cup|Champions|LEC|EU LCS|NA LCS|LCS|LTA|LTA North|LTA South|LMS|PCS|LCP|CBLOL|VCS|LJL"
    r"|Worlds|MSI|First Stand|Esports World Cup)( |$)"
)

# Rebrands Leaguepedia's TeamRenames table doesn't list. (date, old name, new name)
MANUAL_LINKS = [
    ("2014-06-15", "Samsung Ozone", "Samsung White"),
    ("2014-11-01", "SK Telecom T1 K", "SK Telecom T1"),   # SKT T1 K and S merged into one SK Telecom T1
    ("2014-11-01", "Samsung White", "Samsung Galaxy"),    # Samsung White and Blue merged into Samsung Galaxy
    ("2015-01-07", "Team Curse", "Team Liquid"),
    ("2017-11-30", "Samsung Galaxy", "KSV eSports"),      # Leaguepedia says "acquire"; the org then became Gen.G
]
RENAME_VERBS = {"rename", "rebrand", "reband"}
LEAGUEPEDIA_UA = {"User-Agent": "RiftWise-stats/1.0 (lolworlds.com; nightly stats build)"}

FINAL_STAGE = re.compile(r"^(grand )?finals?$", re.I)
# League tournaments that crown a champion (the regular season and promotion events don't)
TITLE_EVENT = re.compile(
    r"(Playoffs|Championship|Season Finals|Grand Finals?|Mid-Season Showdown|Split 3)$|^LCK Cup \d{4}$|^CBLOL Cup \d{4}$"
    r"|^Champions 201[2-4] (Spring|Summer|Winter)$"
)
# All-star games, show matches and season-opening exhibitions aren't counted anywhere (the pages say so)
SHOWMATCH_LEVELS = {"Showmatch", "Show Match"}
SHOWMATCH_NAME = re.compile(r"all-?stars?\b|show ?match|season opening|charity", re.I)
# Finals the catalog can't settle on its own (a game is missing). (tournament) -> (winner, loser, score)
TITLE_OVERRIDES = {
    "Worlds Season 1": ("Fnatic", "against All authority", "2-1"),  # catalog lacks game 3 of the final
    "IEM Season 8 World Championship": ("KT Rolster Bullets", "Fnatic", "3-0"),  # final stage isn't labelled
}


def slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "x"
    return f"{base}-{hashlib.sha1(name.encode('utf-8')).hexdigest()[:6]}"


def is_major(tier: str, tournament: str) -> bool:
    low = (tournament or "").lower()
    return bool(tier) and tier != "Secondary" and bool(TOP_LEAGUE.match(tournament or "")) \
        and not any(w in low for w in ("qualif", "promotion", "expansion", "relegation"))


def title_kind(tournament: str):
    """Which kind of title winning this tournament is, or None if it isn't one we list."""
    t = tournament or ""
    low = t.lower()
    if "play-in" in low or "qualif" in low or "showmatch" in low:
        return None
    if re.match(r"^Worlds (Season \d|\d{4})", t):
        return "Worlds"
    if re.match(r"^MSI \d{4}", t):
        return "MSI"
    if re.match(r"^First Stand \d{4}", t):
        return "First Stand"
    if re.match(r"^Esports World Cup \d{4}$", t):
        return "EWC"
    if re.match(r"^IEM .*World Championship", t):
        return "IEM"
    return "Regional"


INTERNATIONAL = {"Worlds", "MSI", "First Stand"}


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
        items = v if isinstance(v, list) else []
    except Exception:
        items = str(s).split(",")
    return [x.strip() for x in items if x and x.strip() and x.strip().lower() not in ("none", "null", "-", "loss of ban")]


def patch_key(p: str):
    try:
        return tuple(int(x) for x in p.split("."))
    except Exception:
        return (0,)


def parse_len(s):
    """'38:52' -> 38.87 minutes."""
    try:
        m, sec = str(s).split(":")[:2]
        return int(m) + int(sec) / 60
    except Exception:
        return None


def write(path: str, obj) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def shift(date: str, days: int) -> str:
    return (datetime.date.fromisoformat(date) + datetime.timedelta(days=days)).isoformat()


# --offline (the test build, test/test_build.py): no downloads, only the saved copies
OFFLINE = False


def load_renames(cache_path: str) -> list:
    """Leaguepedia's TeamRenames table, refreshed each run; falls back to the cached copy."""
    rows, offset = [], 0
    try:
        while not OFFLINE:
            q = urllib.parse.urlencode({
                "tables": "TeamRenames", "fields": "Date,OriginalName,NewName,Verb", "format": "json",
                "limit": 500, "offset": offset, "order by": "Date",
            })
            req = urllib.request.Request("https://lol.fandom.com/wiki/Special:CargoExport?" + q, headers=LEAGUEPEDIA_UA)
            page = json.load(urllib.request.urlopen(req, timeout=60))
            rows += page
            if len(page) < 500:
                break
            offset += 500
            time.sleep(1.5)
        if len(rows) > 500:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(rows, f, ensure_ascii=False)
            return rows
    except Exception as e:
        print(f"TeamRenames download failed ({e}); using the cached copy")
    with open(cache_path, encoding="utf-8") as f:
        return json.load(f)


def load_team_shorts(cache_path: str, max_age_days: int = 7) -> dict:
    """Leaguepedia's short team names (SKT, C9, HLE...) so the search box finds teams by abbreviation.
    Refreshed weekly; the cached copy is used in between or if Leaguepedia can't be reached."""
    try:
        if OFFLINE or time.time() - os.path.getmtime(cache_path) < max_age_days * 86400:
            with open(cache_path, encoding="utf-8") as f:
                return json.load(f)
    except OSError:
        if OFFLINE:
            return {}
    shorts, offset = {}, 0
    try:
        while True:
            q = urllib.parse.urlencode({
                "tables": "Teams", "fields": "Name,Short", "where": "Short IS NOT NULL AND Short != ''",
                "format": "json", "limit": 500, "offset": offset, "order by": "Name",
            })
            req = urllib.request.Request("https://lol.fandom.com/wiki/Special:CargoExport?" + q, headers=LEAGUEPEDIA_UA)
            page = json.load(urllib.request.urlopen(req, timeout=60))
            for r in page:
                if r.get("Name") and r.get("Short"):
                    shorts[r["Name"]] = str(r["Short"])
            if len(page) < 500:
                break
            offset += 500
            time.sleep(1.5)
        if len(shorts) > 1000:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(shorts, f, ensure_ascii=False)
            return shorts
    except Exception as e:
        print(f"Teams download failed ({e}); using the cached copy")
    try:
        with open(cache_path, encoding="utf-8") as f:
            return json.load(f)
    except OSError:
        return {}


class Lineage:
    """Maps (team name, date) to one team across rebrands, so T1 includes SK Telecom T1."""

    def __init__(self, links, names_dates):
        # Boundaries split a name into eras (a name can be reused years later by a different team).
        self.bounds = defaultdict(list)
        pending = []
        last_game = {n: max(ds) for n, ds in names_dates.items()}
        first_game = {n: min(ds) for n, ds in names_dates.items()}
        for date, old, new in links:
            if old not in names_dates or new not in names_dates or old == new:
                continue
            # Rename dates on Leaguepedia are announcement dates; games can sit a little either side.
            t_old = shift(date, 45) if last_game[old] <= shift(date, 45) else date
            t_new = shift(date, -45) if first_game[new] >= shift(date, -45) else date
            self.bounds[old].append(t_old)
            self.bounds[new].append(t_new)
            pending.append((old, t_old, new, t_new))
        for n in self.bounds:
            self.bounds[n] = sorted(set(self.bounds[n]))
        self.parent = {}
        for old, t_old, new, t_new in pending:
            a = (old, bisect.bisect_left(self.bounds[old], t_old))
            b = (new, bisect.bisect_right(self.bounds[new], t_new))
            self._union(a, b)

    def _find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def _union(self, a, b):
        ra, rb = self._find(a), self._find(b)
        if ra != rb:
            self.parent[ra] = rb

    populated = None  # stretches with games, set once they are known (see main)

    def key(self, name: str, date: str):
        k = (name, bisect.bisect_right(self.bounds.get(name, []), date))
        if self.populated is not None and k not in self.populated and name in self.bounds:
            # an end-of-event or end-of-season date can fall after a rename, in a stretch of the old name with no
            # games ("BRION" after it became "HANJIN BRION"): use the nearest stretch of that name that has games
            near = [(abs(i - k[1]), -i) for i in range(len(self.bounds[name]) + 1) if (name, i) in self.populated]
            if near:
                k = (name, -min(near)[1])
        return k

    def team(self, name: str, date: str):
        return self._find(self.key(name, date))

    def merge_strays(self, spans, max_gap_days=365):
        """The catalog sometimes uses a team's name a little outside Leaguepedia's rename dates
        (SKT's 2013 Worlds games are filed as "SK Telecom T1"). A stretch of a name that isn't linked
        to anything joins the same name's nearest stretch when they are less than a year apart."""
        members = defaultdict(int)
        for k in spans:
            members[self._find(k)] += 1
        for k, (lo, hi) in spans.items():
            if members[self._find(k)] != 1:
                continue
            best = None
            for other, (olo, ohi) in spans.items():
                if other[0] != k[0] or other == k:
                    continue
                gap = (datetime.date.fromisoformat(olo) - datetime.date.fromisoformat(hi)).days if olo > hi else \
                      (datetime.date.fromisoformat(lo) - datetime.date.fromisoformat(ohi)).days
                if gap <= max_gap_days and (best is None or gap < best[0]):
                    best = (gap, other)
            if best:
                self._union(k, best[1])
                members[self._find(k)] += 1


def current_club(teams_sorted):
    """A player's current team: the newest club they played 5+ games for (a one-game stand-in or a national team
    doesn't count), else their newest club, else their newest team. teams_sorted: [(name, {"g", "to"})], newest first."""
    clubs = [(n, v) for n, v in teams_sorted if "national team" not in n.lower()]
    regular = [n for n, v in clubs if v["g"] >= 5]
    return regular[0] if regular else clubs[0][0] if clubs else teams_sorted[0][0] if teams_sorted else None


def duplicates(con):
    """Games the catalog has twice, so each counts once. Leaguepedia lists some weeks on two pages (2015 GPL:
    "..._Week 4_1" and "..._Stage 1 W4_1"), and the VOD harvester filled the second copy from the VOD (24 games counted
    twice, found 10-27). Two kinds:
    - the catalog's own decision: a game in excluded_matches as "duplicate of <game>" (all_games, refreshed nightly,
      can still list it as a game);
    - a VOD copy still in matches: a VOD series whose every game has a Leaguepedia game in matches in the same
      tournament, on the same day, with the same game number and the same two teams, all in one Leaguepedia series
      (a rematch the same day, like a tiebreaker or a grand final after the winners' final, is between two Leaguepedia
      series or two VOD series, and stays).
    Returns .copies {VOD copy's game id: Leaguepedia's game id}, .rows {(series id, game number)} to leave out, and
    .series {series ids with no game left} (Leaguepedia's schedule still lists them)."""
    out = types.SimpleNamespace(copies={}, rows=set(), series=set())
    if not {"stats_source", "catalog_game_id"} <= {r[1] for r in con.execute("PRAGMA table_info(all_games)")}:
        return out
    try:
        out.rows = {(r[0], r[1]) for r in con.execute(
            "SELECT match_id, game_number FROM excluded_matches WHERE exclude_reason LIKE 'duplicate of%'")}
    except sqlite3.Error:
        pass  # (a catalog without the table)
    in_matches = "IN (SELECT game_id FROM matches)"
    pairs = defaultdict(list)  # VOD series -> [(game number, its game id, Leaguepedia series, Leaguepedia game id)]
    for r in con.execute(
        f"""SELECT v.match_id, v.game_number, v.catalog_game_id, f.match_id, f.catalog_game_id
            FROM all_games v JOIN all_games f
              ON f.overview_page = v.overview_page AND f.match_id <> v.match_id AND f.game_number = v.game_number
             AND substr(f.date_utc, 1, 10) = substr(v.date_utc, 1, 10)
             AND ((f.team1 = v.team1 AND f.team2 = v.team2) OR (f.team1 = v.team2 AND f.team2 = v.team1))
            WHERE v.stats_source = 'vod_recovered' AND v.catalog_game_id {in_matches} AND v.team1 != '' AND v.team2 != ''
              AND f.stats_source = 'leaguepedia' AND f.catalog_game_id {in_matches}"""
    ):
        pairs[r[0]].append(tuple(r[1:]))
    if pairs:
        q = ",".join("?" * len(pairs))
        size = dict(con.execute(
            f"SELECT match_id, COUNT(*) FROM all_games WHERE match_id IN ({q}) AND catalog_game_id {in_matches} GROUP BY match_id",
            list(pairs)).fetchall())
        for mid, rs in pairs.items():
            if len({r[2] for r in rs}) == 1 and len({r[1] for r in rs}) == size.get(mid):
                out.copies.update({r[1]: r[3] for r in rs})
                out.rows.update((mid, r[0]) for r in rs)
    if out.rows:
        mids = sorted({m for m, _ in out.rows})
        q = ",".join("?" * len(mids))
        left = Counter(r[0] for r in con.execute(
            f"SELECT match_id, game_number FROM all_games WHERE match_id IN ({q}) AND winner IS NOT NULL AND winner != ''", mids)
            if (r[0], r[1]) not in out.rows)
        out.series = {m for m in mids if not left[m]}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--renames-cache", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "team_renames.json"))
    ap.add_argument("--lp-db", help="Leaguepedia sidecar database (default: lp_all_games.db next to --db)")
    ap.add_argument("--no-hub", action="store_true", help="skip the stats hub pages")
    ap.add_argument("--offline", action="store_true", help="no downloads (Leaguepedia, Riot, Data Dragon): saved copies only")
    args = ap.parse_args()
    global OFFLINE
    OFFLINE = args.offline
    if OFFLINE:
        os.environ["RIFTWISE_OFFLINE"] = "1"  # photos_lp, ddragon_maps
    if not args.lp_db:
        args.lp_db = os.path.join(os.path.dirname(os.path.abspath(args.db)), "lp_all_games.db")
    t0 = time.time()
    checks = Counter()

    # The catalog's own jobs write to it during the day; wait for a write to finish instead of failing
    con = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True, timeout=300)
    con.row_factory = sqlite3.Row
    # The build reads the same tables several times; on the server the disk is often busy with other
    # programs, so keep what was read in memory (map the file, 2 GB page cache).
    con.execute("PRAGMA mmap_size = 8000000000")
    con.execute("PRAGMA cache_size = -2000000")
    # games with a result but no scoreboard get Oracle's Elixir's (this build only; see oefill.py)
    import oefill
    checks["games given Oracle's Elixir's scoreboard (none in the catalog)"] = len(oefill.install(con))

    # -- Games -----------------------------------------------------------------
    levels = {op: lvl for op, lvl in con.execute("SELECT OverviewPage, TournamentLevel FROM lp_tournaments")}

    def is_show(op, tname):
        return levels.get(op) in SHOWMATCH_LEVELS or bool(SHOWMATCH_NAME.search(tname or "") or SHOWMATCH_NAME.search(op or ""))

    dupes = duplicates(con)
    for gid, kept in sorted(dupes.copies.items()):
        print(f"left out, a VOD copy of a Leaguepedia game: {gid} (kept: {kept})")
    checks["series left out (all their games are duplicates, duplicates())"] = len(dupes.series)
    games = {}
    for r in con.execute(
        """SELECT game_id, match_id, game_number, overview_page, tournament_name, tournament_tier, stage_tab, date_utc, patch,
                  team1, team2, winner, duration_minutes, team1_kills, team2_kills, total_kills FROM matches
           WHERE team1 IS NOT NULL AND team2 IS NOT NULL AND winner IN (team1, team2) AND team1 != team2"""
    ):
        if is_show(r["overview_page"], r["tournament_name"]):
            checks["games left out (all-star and show matches)"] += 1
            continue
        if r["game_id"] in dupes.copies:
            checks["games left out (VOD copies of a Leaguepedia game, duplicates())"] += 1
            continue
        games[r["game_id"]] = {
            "match": r["match_id"] or r["game_id"],
            "t": r["tournament_name"] or "",
            "major": is_major(r["tournament_tier"] or "", r["tournament_name"] or ""),
            "tier": r["tournament_tier"] or "",
            "stage": (r["stage_tab"] or "").strip(),
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
            "op": r["overview_page"] or "",
            # same-day games in play order: full time, then the series and the game number
            "order": ((r["date_utc"] or "")[:19], r["match_id"] or "", r["game_number"] or 0),
        }
    print(f"games: {len(games)}")

    tstats = {}
    for r in con.execute("SELECT * FROM team_game_stats"):
        g = games.get(r["game_id"])
        if g:
            ts = dict(r)
            # the table can list the two teams the other way round, or spell them differently: put them in the
            # game's order (team1 = the game's team1) and under the game's names
            a, b = match_teams([ts.get("team1"), ts.get("team2")], g["t1"], g["t2"]), None
            if ts.get("team2") and a.get(ts["team2"]) == g["t1"] or ts.get("team1") and a.get(ts["team1"]) == g["t2"]:
                for k in list(ts):
                    if k.startswith("team1"):
                        b = "team2" + k[5:]
                        ts[k], ts[b] = ts[b], ts[k]
                checks["team stats rows with the teams the other way round (turned)"] += 1
            if ts.get("team1") is not None or ts.get("team2") is not None:
                ts["team1"], ts["team2"] = g["t1"], g["t2"]
            tstats[r["game_id"]] = ts

    # The players' teams, as the game's own two names (other tables spell them differently: "Dplus KIA")
    pnames = defaultdict(set)
    for r in con.execute("SELECT game_id, team FROM player_game_stats"):
        if r["game_id"] in games:
            pnames[r["game_id"]].add(r["team"])
    pteam = {gid: match_teams(ns, games[gid]["t1"], games[gid]["t2"]) for gid, ns in pnames.items()}
    del pnames

    # Per-game player sums, used to check the team numbers before a game can hold a record
    psum = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0, 0]))  # gid -> team -> [kills, gold, rows, gold rows, deaths]
    for r in con.execute("SELECT game_id, team, kills, deaths, gold FROM player_game_stats"):
        team = pteam.get(r["game_id"], {}).get(r["team"])
        if not team:
            continue
        s = psum[r["game_id"]][team]
        s[0] += r["kills"] or 0
        s[1] += r["gold"] or 0
        s[2] += 1
        s[3] += 1 if r["gold"] is not None else 0
        s[4] += r["deaths"] or 0

    # Team kills: the catalog has "0-0" (or nothing) for some games it never got a score for. Take the team
    # stats table's numbers, else the ten players' (when each side's kills are the other side's deaths), else none
    for gid, g in games.items():
        if g["k1"] is not None and not (g["k1"] == 0 and g["k2"] == 0):
            continue
        ts = tstats.get(gid)
        k1 = k2 = None
        if ts and ts.get("team1_kills") is not None and ts.get("team2_kills") is not None and ts["team1_kills"] + ts["team2_kills"] > 0:
            k1, k2 = ts["team1_kills"], ts["team2_kills"]
            checks["team kills taken from the team stats table"] += 1
        else:
            ps = psum.get(gid) or {}
            a, b = ps.get(g["t1"]), ps.get(g["t2"])
            if a and b and a[2] == 5 and b[2] == 5 and a[0] + b[0] > 0 and a[0] == b[4] and b[0] == a[4]:
                k1, k2 = a[0], b[0]
                checks["team kills added from the players' scoreboard"] += 1
        g["k1"], g["k2"] = k1, k2
        g["tk"] = k1 + k2 if k1 is not None else None

    def kills_ok(gid, g):
        """Team kills match the players' kills on both sides (5 players each)."""
        ps = psum.get(gid)
        if not ps or g["k1"] is None or g["k2"] is None:
            return False
        a, b = ps.get(g["t1"]), ps.get(g["t2"])
        return bool(a and b and a[2] == 5 and b[2] == 5 and a[0] == g["k1"] and b[0] == g["k2"])

    def length_ok(gid, g):
        """Game length agrees between the two Leaguepedia tables (within a minute)."""
        ts = tstats.get(gid)
        other = parse_len(ts.get("gamelength")) if ts else None
        return other is not None and abs(other - g["min"]) <= 1.0

    # -- Teams across rebrands -------------------------------------------------------
    names_dates = defaultdict(list)
    for g in games.values():
        names_dates[g["t1"]].append(g["date"])
        names_dates[g["t2"]].append(g["date"])
    renames = load_renames(args.renames_cache)
    links = [(x["Date"][:10], x["OriginalName"], x["NewName"]) for x in renames
             if (x.get("Verb") or "").lower() in RENAME_VERBS and x.get("Date")]
    links += MANUAL_LINKS
    team_shorts = load_team_shorts(os.path.join(os.path.dirname(os.path.abspath(args.renames_cache)), "team_shorts.json"))
    lineage = Lineage(links, names_dates)
    shorts_by_key = {}
    for n_, c_ in team_shorts.items():
        shorts_by_key.setdefault(team_key(n_), c_)

    def short_of(name):
        """Leaguepedia's short name of a team: its own, else that of the same name without a "(...)" / ".CN" suffix."""
        c = team_shorts.get(name)
        if not c and name and (re.search(r"\(.*\)\s*$", name) or re.search(r"\.[A-Za-z]{2,3}$", name)):
            c = shorts_by_key.get(team_key(name))
        return str(c or "").strip()
    spans = {}
    for n, ds in names_dates.items():
        if n not in lineage.bounds:
            continue
        for dte in ds:
            k = lineage.key(n, dte)
            lo, hi = spans.get(k, (dte, dte))
            spans[k] = (min(lo, dte), max(hi, dte))
    lineage.merge_strays(spans)
    lineage.populated = set(spans)

    # Era = one name used by one team for a stretch of time
    eras = defaultdict(lambda: {"from": "9999", "to": "0000", "g": 0})
    for g in games.values():
        for n in (g["t1"], g["t2"]):
            fid = lineage.team(n, g["date"])
            e = eras[(fid, n)]
            e["from"] = min(e["from"], g["date"])
            e["to"] = max(e["to"], g["date"])
            e["g"] += 1
    fr_eras = defaultdict(list)
    for (fid, n), e in eras.items():
        fr_eras[fid].append({"n": n, **e})
    fr_name = {}
    for fid, lst in fr_eras.items():
        lst.sort(key=lambda e: e["to"], reverse=True)
        fr_name[fid] = lst[0]["n"]   # a team is shown under its latest name
    # Two different teams that ended up with the same name: add years to the older one
    by_name = defaultdict(list)
    for fid, n in fr_name.items():
        by_name[n].append(fid)
    for n, fids in by_name.items():
        if len(fids) > 1:
            fids.sort(key=lambda f: fr_eras[f][0]["to"], reverse=True)
            for f in fids[1:]:
                e = fr_eras[f]
                fr_name[f] = f"{n} ({min(x['from'] for x in e)[:4]}–{max(x['to'] for x in e)[:4]})"
    fr_games = Counter()
    for fid, lst in fr_eras.items():
        fr_games[fid] = sum(e["g"] for e in lst)

    def team_of(name, date):
        return lineage.team(name, date)

    def tslug(fid):
        return slug(fr_name[fid]) if fr_games[fid] >= MIN_SEARCH_GAMES else None

    merged = sum(1 for lst in fr_eras.values() if len(lst) > 1)
    checks["teams with more than one name"] = merged

    # -- Player names ----------------------------------------------------------------
    page_counts = {r[0]: r[1] for r in con.execute(
        "SELECT page_key, COUNT(*) FROM player_game_stats WHERE page_key IS NOT NULL GROUP BY page_key")}
    lp_pages = [r[0] for r in con.execute("SELECT OverviewPage FROM lp_players WHERE OverviewPage IS NOT NULL")]
    try:
        redirects = list(con.execute("SELECT alias, canonical_page FROM player_redirects"))
    except sqlite3.Error:
        redirects = []
    player_names = PlayerNames(page_counts, lp_pages, redirects)
    checks["player pages merged (same name, other case)"] = len(player_names.case)
    display = {}
    for r in con.execute("SELECT page, display FROM player_pages_map WHERE page IS NOT NULL"):
        if r["display"] and r["page"] not in display:
            display[r["page"]] = r["display"]

    def pname(page: str) -> str:
        return display.get(page) or re.sub(r"\s*\(.*\)$", "", page)

    # -- Series (best-of results) ----------------------------------------------------
    # Leaguepedia's series scores: an upper-bracket team can start a series 1-0 up, so the games played
    # (2-2) are not the result (3-2)
    official = {}
    if args.lp_db and os.path.exists(args.lp_db):
        try:
            lpc = sqlite3.connect(f"file:{args.lp_db}?mode=ro", uri=True, timeout=30)
            for mid_, a_, b_, sa_, sb_ in lpc.execute(
                    "SELECT MatchId, Team1, Team2, Team1Score, Team2Score FROM lp_match_schedule WHERE MatchId IS NOT NULL"):
                try:
                    official[mid_] = (a_, b_, int(sa_), int(sb_))
                except (TypeError, ValueError):
                    pass
            lpc.close()
        except sqlite3.Error:
            pass
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
        off = official.get(mid)
        if off and off[2] != off[3] and off[2] + off[3] > wa + wb:
            m = match_teams([off[0], off[1]], a, b)
            if m.get(off[0]) == a or m.get(off[1]) == b:
                wa, wb = off[2], off[3]
            elif m.get(off[0]) == b or m.get(off[1]) == a:
                wa, wb = off[3], off[2]
            if (wa, wb) != (s["wins"][a], s["wins"][b]):
                checks["series scores taken from the bracket (1-0 head start)"] += 1
        if wa == wb or len({games[x]["t1"] for x in s["games"]} | {games[x]["t2"] for x in s["games"]}) != 2:
            checks["series skipped (tied or mixed teams)"] += 1
            continue
        date = max(games[x]["date"] for x in s["games"])
        series_list.append({
            "id": mid, "date": date, "t": g0["t"], "op": g0["op"], "tier": g0["tier"], "stage": g0["stage"],
            "major": g0["major"], "a": a, "b": b, "wa": wa, "wb": wb, "w": a if wa > wb else b,
            "fa": team_of(a, date), "fb": team_of(b, date),
        })
    series_list.sort(key=lambda s: (s["date"], s["id"]))

    # -- Titles ----------------------------------------------------------------------
    # The champion of an event is the winner of its final: the series on the "Finals" stage (or the
    # grand-finals tier), else for international events the last series played.
    by_tourn = defaultdict(list)
    for s in series_list:
        by_tourn[s["t"]].append(s)
    # Leaguepedia's 1st place of each tournament (one team only; events with a pro and an amateur cup list two)
    first_place = defaultdict(set)
    for op_, team_ in con.execute("SELECT OverviewPage, Team FROM lp_tournament_results WHERE Place = '1' AND Team IS NOT NULL"):
        first_place[op_].add(team_)
    titles = []
    for tname, ss in by_tourn.items():
        kind = title_kind(tname)
        if not kind:
            continue
        if kind == "Regional":
            # League titles: top leagues' playoffs / cups / championships only
            low = tname.lower()
            if not TOP_LEAGUE.match(tname) or not TITLE_EVENT.search(tname) or not any(s["major"] for s in ss) or any(
                    w in low for w in ("promotion", "qualif", "play-in", "regional finals", "lock", "wildcard")):
                continue
        finals = [s for s in ss if FINAL_STAGE.match(s["stage"]) or s["tier"].endswith("GRAND_FINALS")]
        if tname in TITLE_OVERRIDES:
            w, l, score = TITLE_OVERRIDES[tname]
            date = max(s["date"] for s in ss)
            win_f = team_of(w, date)
            titles.append({"t": tname, "date": date, "kind": kind, "w": fr_name[win_f], "as": w, "s": tslug(win_f),
                           "l": l, "score": score, "fid": win_f})
            continue
        if not finals:
            checks["league events with no final in the catalog" if kind == "Regional" else f"no final found for {tname}"] += 1
            continue
        # The "Finals" tab can also hold a later decider (VCS 2019 Summer: a Worlds-spot match the day after the
        # final): when Leaguepedia names one winner, the final is the newest series that team won
        champ1 = first_place.get(ss[0]["op"]) or set()
        won_by_1st = [s for s in finals if len(champ1) == 1 and match_teams([next(iter(champ1))], s["w"], "")]
        f = max(won_by_1st or finals, key=lambda s: (s["date"], s["id"]))
        win_f = f["fa"] if f["w"] == f["a"] else f["fb"]
        lose_name = f["b"] if f["w"] == f["a"] else f["a"]
        titles.append({"t": tname, "date": f["date"], "kind": kind, "w": fr_name[win_f], "as": f["w"],
                       "s": tslug(win_f), "l": lose_name, "score": f"{max(f['wa'], f['wb'])}-{min(f['wa'], f['wb'])}",
                       "fid": win_f})
    titles.sort(key=lambda x: x["date"], reverse=True)
    titles_by_team = defaultdict(list)
    for t in titles:
        titles_by_team[t["fid"]].append(t)
    checks["titles found"] = len(titles)

    # -- Per-player game rows --------------------------------------------------------
    team_players = defaultdict(lambda: defaultdict(Counter))  # team -> year -> page -> games
    team_roles = defaultdict(dict)                            # team -> page -> role counter
    player_events = defaultdict(set)                          # page -> {(tournament, team)}
    players = defaultdict(lambda: {
        "g": 0, "w": 0, "k": 0, "d": 0, "a": 0, "cs": 0, "gold": 0, "dmg": 0, "stat_min": 0.0, "dmg_min": 0.0,
        "roles": Counter(), "teams": {}, "years": {}, "champs": {}, "recent": [], "best": {},
        # top leagues and internationals only (the career records)
        "mg": 0, "mk": 0, "ma": 0, "mchamps": set(),
    })
    champ_rows = defaultdict(lambda: defaultdict(lambda: {"p": 0, "w": 0, "k": 0, "d": 0, "a": 0, "roles": Counter()}))
    record_rows = {"kills": [], "assists": [], "dmg": [], "cs": [], "perfect": []}
    # the same per year, for the records page's year picker
    record_rows_y = defaultdict(lambda: {"kills": [], "assists": [], "dmg": [], "cs": [], "perfect": []})
    consistent = {}
    game_champs = defaultdict(list)

    q = con.execute(
        """SELECT game_id, team, page_key, role, champion, kills, deaths, assists, gold, cs, damage, win
           FROM player_game_stats"""
    )
    for r in q:
        gid = r["game_id"]
        g = games.get(gid)
        if not g or not r["page_key"]:
            continue
        team = pteam.get(gid, {}).get(r["team"])
        if not team:
            checks["player rows with a team not in the game"] += 1
            continue
        page = player_names.page(r["page_key"], team)
        if page != r["page_key"]:
            checks["player rows moved to the right page"] += 1
        fid = team_of(team, g["date"])
        won = 1 if g["w"] == team else 0
        k, d, a = r["kills"] or 0, r["deaths"] or 0, r["assists"] or 0
        champ = champ_name(r["champion"]) or ""
        p = players[page]
        p["g"] += 1
        p["w"] += won
        if g["major"]:
            p["mg"] += 1
            p["mk"] += k
            p["ma"] += a
            if champ:
                p["mchamps"].add(champ)
        p["k"] += k
        p["d"] += d
        p["a"] += a
        if r["cs"] is not None and r["gold"] is not None and g["min"]:
            p["cs"] += r["cs"]
            p["gold"] += r["gold"]
            p["dmg"] += r["damage"] or 0
            p["stat_min"] += g["min"]
            # damage was only recorded from 2015 on: per minute counts only the games that have it
            if r["damage"]:
                p["dmg_min"] += g["min"]
        p["roles"][r["role"] or "?"] += 1
        tm = p["teams"].setdefault(team, {"g": 0, "w": 0, "from": g["date"], "to": g["date"], "fid": fid})
        tm["g"] += 1
        tm["w"] += won
        tm["from"] = min(tm["from"], g["date"])
        if g["date"] >= tm["to"]:
            tm["to"] = g["date"]
            tm["fid"] = fid
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
        p["recent"].append((g["date"], gid, team, opp, champ, k, d, a, won, g["t"]))
        if len(p["recent"]) > 60:
            p["recent"].sort(reverse=True)
            del p["recent"][20:]
        player_events[page].add((g["t"], fid))

        if gid not in consistent:
            consistent[gid] = kills_ok(gid, g)
        if consistent[gid]:
            for key, val in (("kills", k), ("assists", a), ("dmg", r["damage"] or 0), ("cs", r["cs"] or 0)):
                b = p["best"].get(key)
                if b is None or val > b[0]:
                    p["best"][key] = (val, g["date"], champ, opp, g["t"])

        team_players[fid][g["year"]][page] += 1
        team_roles[fid].setdefault(page, Counter())[r["role"] or "?"] += 1

        if champ:
            game_champs[gid].append((champ, won, k, d, a, r["role"] or "?"))

        if g["major"] and g["min"] >= RECORD_MIN_MINUTES and consistent[gid]:
            base = {"pl": pname(page), "ps": page, "pk": page, "gid": gid, "team": team, "opp": opp, "c": champ, "date": g["date"],
                    "t": g["t"], "kda": f"{k}/{d}/{a}"}
            ry = record_rows_y[g["year"]]
            for rows_, key, val in ((record_rows, "kills", k), (ry, "kills", k), (record_rows, "assists", a), (ry, "assists", a),
                                    (record_rows, "dmg", r["damage"] or 0), (ry, "dmg", r["damage"] or 0),
                                    (record_rows, "cs", r["cs"] or 0), (ry, "cs", r["cs"] or 0)):
                rows_[key].append((val, base))
            if d == 0:
                record_rows["perfect"].append((k + a, base))
                ry["perfect"].append((k + a, base))
            for key in record_rows:
                if len(record_rows[key]) > 2000:
                    record_rows[key].sort(key=lambda x: x[0], reverse=True)
                    del record_rows[key][50:]
                if len(ry[key]) > 500:
                    ry[key].sort(key=lambda x: x[0], reverse=True)
                    del ry[key][20:]
    print(f"players: {len(players)}  ({time.time() - t0:.0f}s)")
    checks["games failing the kills check (kept, but can't hold records)"] = sum(1 for v in consistent.values() if not v)

    # -- Champion picks and bans ------------------------------------------------------
    # Only games with all ten champions known count, so every game adds exactly 10 picks and
    # 5 wins and the rates are true per-game rates.
    champ_bans = defaultdict(Counter)
    champ_games = Counter()
    for gid, g in games.items():
        rows = game_champs.get(gid, [])
        if len(rows) != 10 or len({x[0] for x in rows}) != 10 or sum(x[1] for x in rows) != 5:
            if rows:
                checks["games left out of champion stats (incomplete picks)"] += 1
            continue
        keys = ["all", f"y{g['year']}"] + ([f"p{g['patch']}"] if g["patch"] else [])
        scopes = ("all", "major") if g["major"] else ("all",)
        for key in keys:
            for scope in scopes:
                champ_games[(key, scope)] += 1
                for champ, won, k, d, a, role in rows:
                    c = champ_rows[(key, scope)][champ]
                    c["p"] += 1
                    c["w"] += won
                    c["k"] += k
                    c["d"] += d
                    c["a"] += a
                    c["roles"][role] += 1
        ts = tstats.get(gid)
        if not ts:
            continue
        picked = {x[0] for x in rows}
        bans = {c for c in (champ_name(x) for x in jlist(ts.get("team1_bans")) + jlist(ts.get("team2_bans"))) if c} - picked
        for key in keys:
            for scope in scopes:
                for b in bans:
                    champ_bans[(key, scope)][b] += 1

    # -- Team aggregation ------------------------------------------------------------
    teams = defaultdict(lambda: {
        "g": 0, "w": 0, "min": 0.0, "kills": 0, "deaths": 0, "kg": 0, "years": {}, "opps": {}, "champs": Counter(),
        "champ_w": Counter(), "bans_by": Counter(), "obj": Counter(), "obj_g": 0, "tourn": {}, "streak": 0,
        "best_streak": None, "from": "9999", "to": "0000",
    })
    by_date = sorted(games.items(), key=lambda kv: (kv[1]["order"], kv[0]))
    for gid, g in by_date:
        ts = tstats.get(gid)
        f1, f2 = team_of(g["t1"], g["date"]), team_of(g["t2"], g["date"])
        if f1 == f2:
            checks["games between two names of the same team (skipped for team stats)"] += 1
            continue
        for side, (team, fid, ofid) in enumerate(((g["t1"], f1, f2), (g["t2"], f2, f1))):
            won = 1 if g["w"] == team else 0
            t = teams[fid]
            t["g"] += 1
            t["w"] += won
            t["min"] += g["min"]
            k_own, k_opp = (g["k1"], g["k2"]) if side == 0 else (g["k2"], g["k1"])
            if k_own is not None and k_opp is not None:
                t["kills"] += k_own
                t["deaths"] += k_opp
                t["kg"] += 1
            t["from"] = min(t["from"], g["date"])
            t["to"] = max(t["to"], g["date"])
            y = t["years"].setdefault(g["year"], {"g": 0, "w": 0, "names": Counter()})
            y["g"] += 1
            y["w"] += won
            y["names"][team] += 1
            o = t["opps"].setdefault(ofid, {"g": 0, "w": 0, "last": ""})
            o["g"] += 1
            o["w"] += won
            o["last"] = max(o["last"], g["date"])
            tr = t["tourn"].setdefault(g["t"], {"g": 0, "w": 0, "date": g["date"]})
            tr["g"] += 1
            tr["w"] += won
            tr["date"] = max(tr["date"], g["date"])
            if won:
                t["streak"] += 1
                if t["best_streak"] is None or t["streak"] > t["best_streak"][0]:
                    t["best_streak"] = (t["streak"], g["date"])
            else:
                t["streak"] = 0
            if ts and team in (ts.get("team1"), ts.get("team2")):
                pre = "team1" if ts.get("team1") == team else "team2"
                opre = "team2" if pre == "team1" else "team1"
                for c in filter(None, map(champ_name, jlist(ts.get(f"{pre}_picks")))):
                    t["champs"][c] += 1
                    t["champ_w"][c] += won
                for c in filter(None, map(champ_name, jlist(ts.get(f"{pre}_bans")))):
                    t["bans_by"][c] += 1
                if ts.get(f"{pre}_gold") is not None and ts.get(f"{opre}_gold") is not None:
                    t["obj_g"] += 1
                    for f in ("dragons", "barons", "towers", "heralds"):
                        t["obj"][f] += ts.get(f"{pre}_{f}") or 0
                    t["obj"]["golddiff"] += ts[f"{pre}_gold"] - ts[f"{opre}_gold"]

    team_series = defaultdict(list)
    for s in series_list:
        if s["fa"] == s["fb"]:
            continue
        team_series[s["fa"]].append(s)
        team_series[s["fb"]].append(s)

    # -- Write -------------------------------------------------------------------------
    version = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
    vdir = os.path.join(args.out, version)
    # The build readers use right now: the hub hard-links its unchanged files from there
    prev_vdir = None
    try:
        with open(os.path.join(args.out, "latest.json"), encoding="utf-8") as f:
            prev = os.path.join(args.out, str(json.load(f)["version"]))
        prev_vdir = prev if os.path.isdir(prev) else None
    except (OSError, ValueError, KeyError):
        pass
    os.makedirs(vdir, exist_ok=True)

    search_teams, search_players = [], []

    for fid, t in teams.items():
        if t["g"] < MIN_SEARCH_GAMES:
            continue
        name = fr_name[fid]
        s = slug(name)
        names = [e for e in fr_eras[fid] if e["g"] >= 1]
        aka = [e["n"] for e in names if e["n"] != name]
        codes = []
        for e in sorted(names, key=lambda e: -e["g"]):
            c = short_of(e["n"])
            if c and c.lower() not in (x.lower() for x in codes) and c.lower() != name.lower():
                codes.append(c)
        search_teams.append({"n": name, "s": s, "g": t["g"], "y": t["to"][:4],
                             **({"a": " | ".join(aka)} if aka else {}), **({"c": " | ".join(codes)} if codes else {})})

    for page, p in players.items():
        if p["g"] < MIN_SEARCH_GAMES:
            continue
        s = slug(page)
        teams_sorted = sorted(p["teams"].items(), key=lambda kv: kv[1]["to"], reverse=True)
        last_date = teams_sorted[0][1]["to"] if teams_sorted else ""
        last_team = current_club(teams_sorted) or ""
        search_players.append({"n": pname(page), "s": s, "t": last_team, "g": p["g"], "y": last_date[:4]})
    print(f"listed {len(search_teams)} teams, {len(search_players)} players  ({time.time() - t0:.0f}s)")

    # -- Champions ---------------------------------------------------------------------
    champ_index = []
    patches = sorted({k[1:] for k, s in champ_rows if k.startswith("p") and s == "major" and champ_games[(k, "major")] >= 50},
                     key=patch_key, reverse=True)[:TOP_PATCHES]
    years = sorted({k[1:] for k, _ in champ_rows if k.startswith("y")}, reverse=True)
    for key in ["all"] + [f"y{y}" for y in years] + [f"p{p}" for p in patches]:
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
            over = [c["c"] for c in out[scope]["champs"] if c["p"] + c["b"] > n]
            if over:
                checks[f"champions over 100% presence in {key}/{scope}"] = len(over)
        if out:
            write(os.path.join(vdir, "champions", f"{key}.json"), out)
            champ_index.append(key)

    # -- Records (top leagues only) ----------------------------------------------------
    def top(rows, n=10):
        rows = sorted(rows, key=lambda x: x[0], reverse=True)[:n]
        return [{"v": v, **b} for v, b in rows]

    major_games = [(gid, g) for gid, g in games.items() if g["major"] and g["min"] >= RECORD_MIN_MINUTES]
    timed = [(gid, g) for gid, g in major_games if length_ok(gid, g)]
    killed = [(gid, g) for gid, g in major_games if consistent.get(gid) or (consistent.get(gid) is None and kills_ok(gid, g))]
    checks["top-league games with a confirmed length"] = len(timed)
    checks["top-league games with confirmed kills"] = len(killed)

    def game_row(gid, g, v):
        return {"v": v, "gid": gid, "a": g["t1"], "b": g["t2"], "w": g["w"], "date": g["date"], "t": g["t"],
                "min": r1(g["min"]), "score": f"{g['k1']}-{g['k2']}" if g["k1"] is not None else None}

    comebacks = []
    for gid, g in killed:
        ts = tstats.get(gid)
        ps = psum.get(gid, {})
        if not ts or ts.get("team1_gold") is None or ts.get("team2_gold") is None:
            continue
        if ts.get("team1") != g["t1"] or ts.get("team2") != g["t2"]:
            continue
        # Team gold must match the players' gold on both sides (within 2%), or the row is suspect
        ok = all(ps.get(n) and ps[n][3] == 5 and abs(ps[n][1] - ts[f"{side}_gold"]) <= 0.02 * ts[f"{side}_gold"]
                 for n, side in ((g["t1"], "team1"), (g["t2"], "team2")))
        if not ok:
            checks["comeback candidates dropped (gold doesn't add up)"] += 1
            continue
        wg = ts["team1_gold"] if g["w"] == g["t1"] else ts["team2_gold"]
        lg = ts["team2_gold"] if g["w"] == g["t1"] else ts["team1_gold"]
        if wg < lg:
            comebacks.append((lg - wg, gid, g))
    comebacks.sort(key=lambda x: x[0], reverse=True)

    major_streaks = defaultdict(lambda: [0, ""])
    best_by_team = {}
    for gid, g in by_date:
        if not g["major"]:
            continue
        for team in (g["t1"], g["t2"]):
            fid = team_of(team, g["date"])
            if g["w"] == team:
                major_streaks[fid][0] += 1
                major_streaks[fid][1] = g["date"]
                if major_streaks[fid][0] > best_by_team.get(fid, (0, ""))[0]:
                    best_by_team[fid] = tuple(major_streaks[fid])
            else:
                major_streaks[fid] = [0, ""]

    intl = Counter(t["fid"] for t in titles if t["kind"] in INTERNATIONAL)
    worlds = Counter(t["fid"] for t in titles if t["kind"] == "Worlds")
    msi = Counter(t["fid"] for t in titles if t["kind"] == "MSI")
    domestic = Counter(t["fid"] for t in titles if t["kind"] == "Regional")
    intl_order = sorted(intl, key=lambda f: (-intl[f], -worlds[f], -msi[f], -domestic[f], fr_name[f]))
    major_players = [(pg, p) for pg, p in players.items() if p["mg"]]
    records = {
        "built": version,
        "note": f"Top leagues and international events only. Games shorter than {RECORD_MIN_MINUTES} minutes are skipped, "
                "and a game only counts when its numbers agree across Leaguepedia's tables.",
        "game": {
            "fastest": [game_row(gid, g, round(g["min"], 3)) for gid, g in sorted(timed, key=lambda x: x[1]["min"])[:10]],
            "longest": [game_row(gid, g, round(g["min"], 3)) for gid, g in sorted(timed, key=lambda x: -x[1]["min"])[:10]],
            "bloodiest": [game_row(gid, g, g["tk"]) for gid, g in sorted(killed, key=lambda x: -(x[1]["k1"] + x[1]["k2"]))[:10]],
            "comebacks": [game_row(gid, g, v) for v, gid, g in comebacks[:10]],
        },
        "player": {k: top(v) for k, v in record_rows.items()},
        "career": {
            "games": [{"v": p["mg"], "pl": pname(pg), "ps": slug(pg), "pk": pg} for pg, p in sorted(major_players, key=lambda kv: -kv[1]["mg"])[:10]],
            "kills": [{"v": p["mk"], "pl": pname(pg), "ps": slug(pg), "pk": pg} for pg, p in sorted(major_players, key=lambda kv: -kv[1]["mk"])[:10]],
            "assists": [{"v": p["ma"], "pl": pname(pg), "ps": slug(pg), "pk": pg} for pg, p in sorted(major_players, key=lambda kv: -kv[1]["ma"])[:10]],
            "pool": [{"v": len(p["mchamps"]), "pl": pname(pg), "ps": slug(pg), "pk": pg} for pg, p in sorted(major_players, key=lambda kv: -len(kv[1]["mchamps"]))[:10]],
        },
        # the same over every pro game (what player pages count), for the records page's "All pro games"
        "careerAll": {
            "games": [{"v": p["g"], "pl": pname(pg), "ps": slug(pg), "pk": pg} for pg, p in sorted(players.items(), key=lambda kv: -kv[1]["g"])[:10]],
            "kills": [{"v": p["k"], "pl": pname(pg), "ps": slug(pg), "pk": pg} for pg, p in sorted(players.items(), key=lambda kv: -kv[1]["k"])[:10]],
            "assists": [{"v": p["a"], "pl": pname(pg), "ps": slug(pg), "pk": pg} for pg, p in sorted(players.items(), key=lambda kv: -kv[1]["a"])[:10]],
            "pool": [{"v": len(p["champs"]), "pl": pname(pg), "ps": slug(pg), "pk": pg} for pg, p in sorted(players.items(), key=lambda kv: -len(kv[1]["champs"]))[:10]],
        },
        "team": {
            "streaks": [{"v": n, "team": fr_name[f], "s": tslug(f), "date": d} for f, (n, d) in sorted(best_by_team.items(), key=lambda kv: -kv[1][0])[:10]],
            "titles": [{"v": intl[f], "team": fr_name[f], "s": tslug(f), "worlds": worlds[f]} for f in intl_order],
        },
    }
    for lst in records["player"].values():
        for x in lst:
            x["ps"] = slug(x["ps"])
    records["game"]["bloodiest"] = [dict(x, v=x["v"] if x["v"] is not None else 0) for x in records["game"]["bloodiest"]]
    write(os.path.join(vdir, "records.json"), records)
    # the same records for each year (game records and single-game player records; pentakills are added by hub.py)
    records_by_year = {}
    for year in sorted({g["date"][:4] for _gid, g in major_games if g["date"]}):
        yg = [(gid, g) for gid, g in timed if g["date"][:4] == year]
        yk = [(gid, g) for gid, g in killed if g["date"][:4] == year]
        ry = record_rows_y.get(year) or {"kills": [], "assists": [], "dmg": [], "cs": [], "perfect": []}
        records_by_year[year] = {
            "game": {
                "fastest": [game_row(gid, g, round(g["min"], 3)) for gid, g in sorted(yg, key=lambda x: x[1]["min"])[:10]],
                "longest": [game_row(gid, g, round(g["min"], 3)) for gid, g in sorted(yg, key=lambda x: -x[1]["min"])[:10]],
                "bloodiest": [dict(game_row(gid, g, g["tk"]), v=g["tk"] if g["tk"] is not None else 0)
                              for gid, g in sorted(yk, key=lambda x: -(x[1]["k1"] + x[1]["k2"]))[:10]],
                "comebacks": [game_row(gid, g, v) for v, gid, g in comebacks if g["date"][:4] == year][:10],
            },
            "player": {k: [dict(x, ps=slug(x["ps"])) for x in top(v)] for k, v in ry.items()},
        }
    records["years"] = sorted(records_by_year, reverse=True)
    write(os.path.join(vdir, "records.json"), records)
    write(os.path.join(vdir, "titles.json"), [{k: v for k, v in x.items() if k != "fid"} for x in titles])

    search_teams.sort(key=lambda x: -x["g"])
    search_players.sort(key=lambda x: -x["g"])
    write(os.path.join(vdir, "meta.json"), {
        "version": version, "games": len(games), "series": len(series_list),
        "teams": len(search_teams), "players": len(search_players),
        "from": min(g["date"] for g in games.values()), "to": max(g["date"] for g in games.values()),
        "champions": champ_index,
    })
    if not args.no_hub:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import hub
        try:
            hub_stats = hub.build(types.SimpleNamespace(
                con=con, lp_db=args.lp_db, vdir=vdir, prev_vdir=prev_vdir, version=version, checks=checks,
                games=games, tstats=tstats, consistent=consistent, players=players, teams=teams,
                team_series=team_series, series_list=series_list, titles=titles, titles_by_team=titles_by_team,
                fr_name=fr_name, fr_eras=fr_eras, fr_games=fr_games, team_of=team_of, pname=pname,
                team_shorts=team_shorts, team_players=team_players, team_roles=team_roles, player_events=player_events,
                records=records, records_by_year=records_by_year, out_root=args.out,
                names=player_names, is_show=is_show, short_of=short_of, current_club=current_club,
                dupes=dupes,
            ))
        except Exception:
            # Leave the last good build in place rather than publish one without its hub
            shutil.rmtree(vdir, ignore_errors=True)
            raise
        print(f"hub: {hub_stats}")

    write(os.path.join(vdir, "checks.json"), dict(checks))
    for k, v in checks.items():
        print(f"  check: {k}: {v}")

    # Point readers at the new build, then remove old builds (keep the newest three: the build runs whenever
    # the database changes, a few times a day, and an open page may still be reading an older one).
    tmp = os.path.join(args.out, "latest.json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"version": version, "built": datetime.datetime.now(datetime.timezone.utc).isoformat()}, f)
    os.replace(tmp, os.path.join(args.out, "latest.json"))
    builds = sorted(d for d in os.listdir(args.out) if d.isdigit() and os.path.isdir(os.path.join(args.out, d)))
    for old in builds[:-3]:
        shutil.rmtree(os.path.join(args.out, old), ignore_errors=True)
    print(f"done: {version} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
