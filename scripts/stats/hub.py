"""
Stats hub pages (the gol.gg / Leaguepedia-style part of RiftWatch's Stats tab).

build_stats.py calls build() after the classic Stats tab files are written, into the same version
folder, so one latest.json switch publishes both:

  hub/meta.json                     totals, years, newest patches
  hub/home.json                     hub front page (latest events, busiest players, ...)
  hub/search/teams.json             [name, slug, games, last year, old names, short names, region]
  hub/search/players.json           [name, slug, last team, games, last year, role, real name]
  hub/search/events.json            [name, slug, year, league, level, end date, games]
  hub/search/champs.json            [name, slug, picks]
  hub/team/<slug>.json              team page
  hub/player/<slug>.json            player page
  hub/event/<slug>.json             tournament page: info, results, standings, stages and bracket, leaders
  hub/game/<slug>.json              one series: each game's draft, players, items, runes, objectives, VOD
  hub/champ/<slug>.json             champion page
  hub/events/<year>.json            all tournaments of a year
  hub/records.json, hub/titles.json the Stats tab's records and title lists, with links to the hub pages
  hub/alias.json                    {"team": {old slug: current slug}}: teams that changed name
  hub/seo/<kind>.tsv                slug, title, description, index flag (read by the page service)
  hub/manifest.json                 file -> content hash, so the next build can hard-link unchanged files

Slugs are readable ("faker", "t1", "worlds-2025-main-event") and are what the page URLs use
(lolworlds.com/riftwatch/player/faker). Inputs are read-only: the catalog plus, when present, the
Leaguepedia sidecar database (lp_all_games.db) for every series' stage, order and score.
"""
import datetime
import hashlib
import heapq
import html
import json
import math
import os
import re
import sqlite3
import time
import unicodedata
from collections import Counter, defaultdict

SITE = "RiftWatch"
RECENT_EVENT_DAYS = 30        # event and series descriptions leave the winner out while this fresh
SEO_MIN_GAMES = 10            # thinner team / player pages are kept out of search engines
KNOCKOUT_TAB = re.compile(
    r"^(round of \d+|(quarter|semi)-?finals?|finals?|grand finals?|(third|3rd)[- ]place( match| decider)?|"
    r"(upper|lower|winners'?|losers'?) (bracket|round|final|semifinal|quarterfinal).*|knockouts?|bracket stage|"
    r"playoffs?( round \d+)?|ub .*|lb .*|elimination match|decider match|qualification match)$",
    re.I,
)
ROUND_TAB = re.compile(r"^round \d+$", re.I)
ROLE_ORDER = {"Top": 0, "Jungle": 1, "Mid": 2, "Bot": 3, "Support": 4}
DRAKES = ("Clouds", "Infernals", "Mountains", "Oceans", "Hextechs", "Chemtechs")


# ── small helpers ───────────────────────────────────────────────────────────────

LETTERS = str.maketrans({"Ø": "O", "ø": "o", "Æ": "AE", "æ": "ae", "Œ": "OE", "œ": "oe", "ß": "ss", "Ł": "L", "ł": "l",
                         "Đ": "D", "đ": "d", "Þ": "Th", "þ": "th", "ı": "i", "Ð": "D", "ð": "d"})


def pretty(text: str) -> str:
    """'Worlds 2025 Main Event' -> 'worlds-2025-main-event' (accents dropped, apostrophes and dots removed).
    The app has the same function (src/hub.ts prettySlug); keep the two in step."""
    s = unicodedata.normalize("NFKD", (text or "").translate(LETTERS))
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower().replace("&", " and ")
    s = re.sub(r"['’`.]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:70].strip("-")


def short_hash(key) -> str:
    return hashlib.sha1(str(key).encode("utf-8")).hexdigest()[:5]


class Slugs:
    """Readable, unique slugs for one kind of page. When several things want the same slug the one
    with the most games keeps it; the others use their alternative text if that is free, else get a
    short hash. A slug therefore stays put for as long as its owner exists."""

    def __init__(self):
        self.want = {}

    def add(self, key, text, weight=0, alt=None):
        self.want[key] = (pretty(text) or "x", weight, pretty(alt) if alt else None)

    def build(self) -> dict:
        groups = defaultdict(list)
        for k, (base, w, alt) in self.want.items():
            groups[base].append((-w, str(k), k, alt))
        out, used, losers = {}, set(), []
        for base, lst in groups.items():
            lst.sort()
            out[lst[0][2]] = base
            used.add(base)
            losers += [(base, x[2], x[3]) for x in lst[1:]]
        for base, k, alt in sorted(losers, key=lambda x: str(x[1])):
            s = alt if alt and alt not in used and alt not in groups else f"{base}-{short_hash(k)}"
            while s in used:
                s = f"{base}-{short_hash(str(k) + s)}"
            out[k] = s
            used.add(s)
        return out


def fix_patch(p, date):
    """Leaguepedia stores patches as numbers, so 25.20 reads "25.2" and 10.10 reads "10.1". Put the
    lost zero back when the game's date says it is the later patch (about 24 patches a year)."""
    if not p:
        return p
    p = str(p).strip()
    m = re.match(r"^(\d+)\.(\d)$", p)
    if not m or not date:
        return p
    major, d = int(m.group(1)), int(m.group(2))
    year = 2000 + major if major >= 25 else 2010 + major if major >= 4 else None
    if not year:
        return p
    try:
        day = (datetime.date.fromisoformat(date[:10]) - datetime.date(year, 1, 8)).days
    except ValueError:
        return p
    est = 1 + day / 14.5
    alt = d * 10
    return f"{major}.{alt}" if alt <= 25 and abs(alt - est) < abs(d - est) else p


def jlist(s):
    if not s:
        return []
    try:
        v = json.loads(s)
        items = v if isinstance(v, list) else []
    except Exception:
        items = str(s).split(",")
    return [str(x).strip() for x in items if x is not None and str(x).strip() and str(x).strip().lower() not in ("none", "null", "-", "loss of ban")]


def r1(x):
    return round(x, 1)


def r2(x):
    return round(x, 2)


def kda(k, d, a):
    return r2((k + a) / max(d, 1))


def num(x):
    try:
        return int(x) if x is not None and str(x).strip() != "" else None
    except (TypeError, ValueError):
        try:
            return int(float(x))
        except (TypeError, ValueError):
            return None


def chunks(lst, n=800):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def parse_len(s):
    try:
        m, sec = str(s).split(":")[:2]
        return int(m) + int(sec) / 60
    except Exception:
        return None


class Writer:
    """Writes hub files. A file whose content is the same as in the previous build is hard-linked to
    it instead (most series never change again), so a nightly build stays fast and small."""

    def __init__(self, vdir, prev_vdir):
        self.root = os.path.join(vdir, "hub")
        self.prev_root = os.path.join(prev_vdir, "hub") if prev_vdir else None
        self.prev = {}
        if self.prev_root:
            try:
                with open(os.path.join(self.prev_root, "manifest.json"), encoding="utf-8") as f:
                    self.prev = json.load(f)
            except (OSError, ValueError):
                self.prev = {}
        self.manifest = {}
        self.dirs = set()
        self.written = self.linked = self.bytes = 0

    def _put(self, rel, data: bytes):
        h = hashlib.sha1(data).hexdigest()[:16]
        self.manifest[rel] = h
        path = os.path.join(self.root, rel)
        d = os.path.dirname(path)
        if d not in self.dirs:
            os.makedirs(d, exist_ok=True)
            self.dirs.add(d)
        if self.prev.get(rel) == h:
            try:
                os.link(os.path.join(self.prev_root, rel), path)
                self.linked += 1
                return
            except OSError:
                pass
        with open(path, "wb") as f:
            f.write(data)
        self.written += 1
        self.bytes += len(data)

    def json(self, rel, obj):
        self._put(rel, json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))

    def text(self, rel, text):
        self._put(rel, text.encode("utf-8"))

    def finish(self):
        with open(os.path.join(self.root, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(self.manifest, f, separators=(",", ":"))


def clean(s):
    """Leaguepedia text can still hold HTML entities (&nbsp;, &amp;)."""
    if not s or not isinstance(s, str):
        return s
    return re.sub(r"\s+", " ", html.unescape(s)).strip()  # \s also matches the no-break space


def short_slug(name, slug):
    """Search lists leave the slug out when the app can work it out from an ASCII name."""
    return "" if name and name.isascii() and pretty(name) == slug else slug


def tsv_cell(s) -> str:
    return re.sub(r"[\t\r\n]+", " ", str(s or "")).strip()


# ── the build ─────────────────────────────────────────────────────────────────

def build(ctx) -> dict:
    """ctx carries the classic build's data (see build_stats.py). Returns a few numbers for the log."""
    t0 = time.time()
    con = ctx.con
    checks = ctx.checks
    out = Writer(ctx.vdir, ctx.prev_vdir)
    today = datetime.date.today().isoformat()
    recent_cut = (datetime.date.today() - datetime.timedelta(days=RECENT_EVENT_DAYS)).isoformat()

    # -- Leaguepedia reference tables ------------------------------------------------
    lp_tourn = {}
    for r in con.execute(
        """SELECT Name, OverviewPage, DateStart, Date, League, Region, Prizepool, Currency, Country, EventType,
                  BasePage, TournamentLevel, IsQualifier, IsPlayoffs, Year, Split FROM lp_tournaments"""
    ):
        lp_tourn[r["OverviewPage"]] = {k: clean(v) for k, v in dict(r).items()}
    lp_team = {}
    for r in con.execute("SELECT Name, Short, Region, Location, IsDisbanded, Website, Twitter FROM lp_teams"):
        lp_team[r["Name"]] = {k: clean(v) for k, v in dict(r).items()}
    lp_player = {}
    for r in con.execute(
        """SELECT OverviewPage, ID, Name, NativeName, Country, Birthdate, Deathdate, Residency, Role, Team,
                  IsRetired, Twitter, Stream, Youtube FROM lp_players"""
    ):
        lp_player[r["OverviewPage"]] = {k: clean(v) for k, v in dict(r).items()}
    results = defaultdict(list)
    for r in con.execute(
        "SELECT OverviewPage, Place, Place_Number, Team, Prize_USD, Showmatch FROM lp_tournament_results WHERE Team IS NOT NULL AND Team != ''"
    ):
        results[r["OverviewPage"]].append(dict(r))
    standings = defaultdict(list)
    for r in con.execute(
        "SELECT OverviewPage, Team, N, Place, WinSeries, LossSeries, TieSeries, WinGames, LossGames, Points FROM lp_standings ORDER BY rowid"
    ):
        standings[r["OverviewPage"]].append(dict(r))

    # -- every game: all_games (weekly, everything Leaguepedia knows) + matches (nightly, newest) --
    games_by_op = defaultdict(dict)  # op -> (match_id, n) -> game
    for r in con.execute(
        """SELECT match_id, game_number, status, tournament_name, overview_page, date_utc, patch, patch_inferred,
                  team1, team2, winner_side, winner, series_team1, series_team2, best_of, is_remake, ff, vod_url,
                  catalog_game_id, has_stats FROM all_games WHERE overview_page IS NOT NULL"""
    ):
        games_by_op[r["overview_page"]][(r["match_id"], r["game_number"])] = {
            "mid": r["match_id"], "n": r["game_number"] or 1, "status": r["status"], "tname": r["tournament_name"],
            "date": (r["date_utc"] or "")[:16], "patch": r["patch"] or r["patch_inferred"], "t1": r["team1"], "t2": r["team2"],
            "w": r["winner"] if r["winner"] in (r["team1"], r["team2"]) else None,
            "sa": r["series_team1"], "sb": r["series_team2"], "bo": r["best_of"], "remake": r["is_remake"], "ff": r["ff"],
            "vod": r["vod_url"], "gid": r["catalog_game_id"] if r["has_stats"] else None,
        }
    added_new = 0
    tname_to_op = {}
    for r in con.execute(
        """SELECT game_id, match_id, game_number, tournament_name, overview_page, stage_tab, date_utc, patch, team1, team2,
                  winner, best_of, vod_url FROM matches WHERE overview_page IS NOT NULL"""
    ):
        op = r["overview_page"]
        if r["tournament_name"]:
            tname_to_op.setdefault(r["tournament_name"], op)
        key = (r["match_id"] or r["game_id"], r["game_number"] or 1)
        g = games_by_op[op].get(key)
        if g:
            if not g["gid"] and r["game_id"] in ctx.games:
                g["gid"] = r["game_id"]
            continue
        games_by_op[op][key] = {
            "mid": key[0], "n": key[1], "status": "full", "tname": r["tournament_name"], "date": (r["date_utc"] or "")[:16],
            "patch": r["patch"], "t1": r["team1"], "t2": r["team2"], "w": r["winner"] if r["winner"] in (r["team1"], r["team2"]) else None,
            "sa": None, "sb": None, "bo": r["best_of"], "remake": 0, "ff": 0, "vod": r["vod_url"],
            "gid": r["game_id"] if r["game_id"] in ctx.games else None, "tab": r["stage_tab"],
        }
        added_new += 1
    checks["hub: games newer than all_games (from matches)"] = added_new

    # -- series order, stage and score from Leaguepedia's MatchSchedule (sidecar database) --
    sched = {}
    sched_by_op = defaultdict(list)
    if ctx.lp_db and os.path.exists(ctx.lp_db):
        try:
            lp = sqlite3.connect(f"file:{ctx.lp_db}?mode=ro", uri=True, timeout=30)
            for r in lp.execute(
                """SELECT MatchId, OverviewPage, Tab, N_TabInPage, N_MatchInTab, BestOf, Team1, Team2, Team1Score, Team2Score,
                          Winner, DateTime_UTC, FF, IsTiebreaker FROM lp_match_schedule WHERE MatchId IS NOT NULL"""
            ):
                s = {
                    "mid": r[0], "op": r[1], "tab": r[2] or "", "ntab": num(r[3]), "n": num(r[4]), "bo": num(r[5]),
                    "a": r[6], "b": r[7], "sa": num(r[8]), "sb": num(r[9]), "w": str(r[10] or ""), "date": (r[11] or "")[:16],
                    "ff": r[12], "tb": r[13],
                }
                sched[s["mid"]] = s
                if s["op"]:
                    sched_by_op[s["op"]].append(s)
            lp.close()
        except sqlite3.Error as e:
            print(f"hub: sidecar database unreadable ({e}); stages come from the series ids")
            checks["hub: sidecar unreadable"] = 1
    checks["hub: series from MatchSchedule"] = len(sched)

    # -- slugs -------------------------------------------------------------------------
    team_slug_maker = Slugs()
    for fid, name in ctx.fr_name.items():
        team_slug_maker.add(fid, name, ctx.fr_games[fid])
    team_slug = team_slug_maker.build()

    player_slug_maker = Slugs()
    for page, p in ctx.players.items():
        player_slug_maker.add(page, ctx.pname(page), p["g"], alt=page)
    player_slug = player_slug_maker.build()

    ops = sorted(set(games_by_op) | {op for op in sched_by_op if op in lp_tourn})
    op_games = {op: len(games_by_op.get(op, {})) for op in ops}
    # Event pages: every tournament with games or scheduled series, plus parent events with stages
    def base_of(op):
        """The event a stage belongs to: Leaguepedia's BasePage, or for older events (which leave it
        empty) the page above it ("2017 Season World Championship/Main Event" -> "...Championship")."""
        base = (lp_tourn.get(op) or {}).get("BasePage")
        if not base and "/" in op and op.rsplit("/", 1)[0] in lp_tourn:
            base = op.rsplit("/", 1)[0]
        return base if base and base != op else None

    children = defaultdict(list)
    for op in ops:
        base = base_of(op)
        if base:
            children[base].append(op)
    parents = [b for b in children if b not in ops]
    event_slug_maker = Slugs()
    for op in ops + parents:
        info = lp_tourn.get(op) or {}
        weight = op_games.get(op, 0) + sum(op_games.get(c, 0) for c in children.get(op, []))
        event_slug_maker.add(op, info.get("Name") or op, weight, alt=op)
    event_slug = event_slug_maker.build()
    tname_slug = {t: event_slug[op] for t, op in tname_to_op.items() if op in event_slug}

    def ename(op):
        return (lp_tourn.get(op) or {}).get("Name") or next(
            (g["tname"] for g in games_by_op.get(op, {}).values() if g["tname"]), op.split("/")[-1])

    def team_ref(name, date):
        """(display name, slug or None, short name) for a team as it was called on that date."""
        if not name:
            return None, None, None
        fid = None
        try:
            fid = ctx.team_of(name, date[:10] if date else "0000")
        except Exception:
            fid = None
        u = team_slug.get(fid) if fid in ctx.fr_name else None
        code = str((ctx.team_shorts.get(name) or (lp_team.get(name) or {}).get("Short") or "")).strip() or None
        return name, u, code

    # -- per-tournament pass: series files, event files, and everything players / teams / champions collect --
    p_events = defaultdict(list)       # page -> per-tournament stats
    p_recent = defaultdict(list)       # page -> heap of the newest games
    p_best = defaultdict(dict)         # page -> stat -> (value, date, champ, opp, event, game slug)
    t_events = defaultdict(list)       # fid -> per-tournament rows
    t_recent = defaultdict(list)       # fid -> heap of the newest series
    champ = defaultdict(lambda: {"years": defaultdict(lambda: [0, 0, 0]), "roles": Counter(),
                                 "players": defaultdict(lambda: [0, 0, 0, 0, 0]), "recent": [], "p": 0, "w": 0, "b": 0,
                                 "best": None})
    events_by_year = defaultdict(list)
    seo = defaultdict(list)
    n_series_pages = 0
    used_gslugs = set()
    gid_slug = {}                      # catalog game id -> its series page
    t_stage = time.time()

    def latest_heap(heap, item, size):
        if len(heap) < size:
            heapq.heappush(heap, item)
        elif item > heap[0]:
            heapq.heapreplace(heap, item)

    for op in ops:
        info = lp_tourn.get(op) or {}
        eslug = event_slug[op]
        en = ename(op)
        gmap = games_by_op.get(op, {})
        # Group games into series
        series = defaultdict(list)
        for (mid, n), g in gmap.items():
            series[mid].append(g)
        for s in sched_by_op.get(op, []):
            series.setdefault(s["mid"], [])

        stat_ids = [g["gid"] for lst in series.values() for g in lst if g["gid"]]
        prow = defaultdict(list)
        trow = {}
        for part in chunks(stat_ids):
            q = ",".join("?" * len(part))
            for r in con.execute(
                f"""SELECT game_id, team, page_key, raw_name, role, side, champion, kills, deaths, assists, gold, cs, damage,
                           vision, items, trinket, spells, keystone, primary_tree, secondary_tree, runes, win
                    FROM player_game_stats WHERE game_id IN ({q})""", part):
                prow[r["game_id"]].append(r)
            for r in con.execute(f"SELECT * FROM team_game_stats WHERE game_id IN ({q})", part):
                trow[r["game_id"]] = r
        mids = list(series)
        sbg = {}
        drafts = {}
        for part in chunks(mids):
            q = ",".join("?" * len(part))
            for r in con.execute(
                f"""SELECT MatchId, N_GameInMatch, Team1, Team2, {", ".join(f"Team1{d}, Team2{d}" for d in DRAKES)},
                           Team1Elders, Team2Elders, Team1VoidGrubs, Team2VoidGrubs, Team1Atakhans, Team2Atakhans,
                           Team1RiftHeralds, Team2RiftHeralds, Team1Inhibitors, Team2Inhibitors, Gamelength
                    FROM lp_scoreboard_games WHERE MatchId IN ({q})""", part):
                sbg[(r["MatchId"], num(r["N_GameInMatch"]) or 1)] = r
            for r in con.execute(
                f"""SELECT match_id, game_number, team1, team2, team1_bans, team2_bans, team1_picks, team2_picks, team1_roles,
                           team2_roles FROM game_drafts_lp WHERE match_id IN ({q})""", part):
                drafts[(r["match_id"], r["game_number"])] = r

        # Per-tournament aggregates
        tp = defaultdict(lambda: {"g": 0, "w": 0, "k": 0, "d": 0, "a": 0, "cs": 0, "gold": 0, "dmg": 0, "min": 0.0,
                                  "team": Counter(), "champs": Counter()})
        tc = defaultdict(lambda: [0, 0, 0])  # champion -> picks, wins, bans
        tteam = defaultdict(lambda: {"g": 0, "w": 0, "sg": 0, "sw": 0, "name": None})
        stage_rows = defaultdict(list)
        n_stats_games = 0
        first_date, last_date = None, None

        for mid, glist in series.items():
            glist.sort(key=lambda g: g["n"])
            s = sched.get(mid)
            # Series teams: MatchSchedule order, else all_games' series order, else the first game's sides
            a = (s and s["a"]) or (glist and (glist[0]["sa"] or glist[0]["t1"]))
            b = (s and s["b"]) or (glist and (glist[0]["sb"] or glist[0]["t2"]))
            if not a or not b or a == b or a == "TBD" or b == "TBD":
                continue
            date = (glist[0]["date"] if glist and glist[0]["date"] else (s["date"] if s else "")) or ""
            wa = sum(1 for g in glist if g["w"] == a)
            wb = sum(1 for g in glist if g["w"] == b)
            if not glist and s and s["sa"] is not None and s["sb"] is not None:
                wa, wb = s["sa"], s["sb"]  # forfeits and series with no game list
            elif s and s["sa"] is not None and s["sb"] is not None and (s["sa"], s["sb"]) != (wa, wb) and s.get("ff"):
                wa, wb = s["sa"], s["sb"]
            bo = (s and s["bo"]) or (glist and glist[0]["bo"]) or max(1, len(glist))
            played = bool(glist) and any(g["w"] for g in glist) or (wa + wb > 0)
            winner = 1 if wa > wb else 2 if wb > wa else 0
            tab = (s and s["tab"]) or next((g.get("tab") for g in glist if g.get("tab")), None)
            if not tab:
                rest = mid[len(op) + 1:] if mid.startswith(op + "_") else ""
                tab = rest.rsplit("_", 1)[0] if "_" in rest else ""
            an, au, ac = team_ref(a, date)
            bn, bu, bc = team_ref(b, date)
            if date:
                first_date = min(first_date or date, date)
                last_date = max(last_date or date, date)

            # Series page (only when there is something to show beyond the two names)
            has_page = any(g["gid"] or g["vod"] or g["w"] for g in glist)
            gslug = None
            if has_page:
                rest = mid[len(op) + 1:] if mid.startswith(op + "_") else mid
                gslug = f"{eslug}-{pretty(rest) or short_hash(mid)}"[:110].strip("-")
                if gslug in used_gslugs:
                    gslug = f"{gslug}-{short_hash(mid)}"
                used_gslugs.add(gslug)
                for g in glist:
                    if g["gid"]:
                        gid_slug[g["gid"]] = gslug
                games_out = []
                for g in glist:
                    blue_is_a = g["t1"] == a
                    gw = 1 if g["w"] == a else 2 if g["w"] == b else 0
                    item = {"n": g["n"], "w": gw, "blue": "a" if blue_is_a else "b", "patch": fix_patch(g["patch"], g["date"]),
                            "date": g["date"], "st": {"full": "f", "results_only": "r"}.get(g["status"], "s")}
                    if g["vod"]:
                        item["vod"] = g["vod"]
                    if g["ff"]:
                        item["ff"] = 1
                    if g["remake"]:
                        item["remake"] = 1
                    gid = g["gid"]
                    base = ctx.games.get(gid) if gid else None
                    if base:
                        item["min"] = r1(base["min"]) if base["min"] else None
                    t = trow.get(gid) if gid else None
                    sb = sbg.get((mid, g["n"]))
                    dr = drafts.get((mid, g["n"]))
                    sides = {}
                    for side, pre in (("blue", "team1"), ("red", "team2")):
                        sd = {}
                        if t is not None:
                            for f, key in (("kills", "k"), ("gold", "gold"), ("towers", "towers"), ("dragons", "drag"),
                                           ("barons", "barons"), ("heralds", "heralds"), ("inhibitors", "inhib")):
                                v = t[f"{pre}_{f}"]
                                if v is not None:
                                    sd[key] = v
                            sd["bans"] = jlist(t[f"{pre}_bans"])
                            sd["picks"] = jlist(t[f"{pre}_picks"])
                        if sb is not None:
                            p2 = "Team1" if pre == "team1" else "Team2"
                            dk = {d.lower().rstrip("s"): num(sb[f"{p2}{d}"]) for d in DRAKES if num(sb[f"{p2}{d}"])}
                            if dk:
                                sd["drakes"] = dk
                            for f, key in (("Elders", "elders"), ("VoidGrubs", "grubs"), ("Atakhans", "atakhan")):
                                v = num(sb[f"{p2}{f}"])
                                if v:
                                    sd[key] = v
                            if "heralds" not in sd and num(sb[f"{p2}RiftHeralds"]) is not None:
                                sd["heralds"] = num(sb[f"{p2}RiftHeralds"])
                            if "inhib" not in sd and num(sb[f"{p2}Inhibitors"]) is not None:
                                sd["inhib"] = num(sb[f"{p2}Inhibitors"])
                        if dr is not None:
                            # The draft's Team1 is usually blue; match it by name
                            dpre = "team1" if dr["team1"] == g[("t1" if side == "blue" else "t2")] else "team2"
                            bans, picks = jlist(dr[f"{dpre}_bans"]), jlist(dr[f"{dpre}_picks"])
                            if bans:
                                sd["bans"] = bans
                            if picks:
                                sd["picks"] = picks
                        sides[side] = sd
                    if any(sides.values()):
                        item["t"] = sides
                    if base and item.get("min") is None and t is not None:
                        m = parse_len(t["gamelength"])
                        if m:
                            item["min"] = r1(m)
                    rows = prow.get(gid, []) if gid else []
                    if rows:
                        n_stats_games += 1
                        plist = []
                        opp_of = {a: b, b: a}
                        for r in sorted(rows, key=lambda r: (r["side"] or 0, ROLE_ORDER.get(r["role"] or "", 9))):
                            page = r["page_key"]
                            k, d, aa = r["kills"] or 0, r["deaths"] or 0, r["assists"] or 0
                            won = 1 if r["team"] == g["w"] else 0
                            row = {"s": r["side"], "r": r["role"], "n": ctx.pname(page) if page else r["raw_name"],
                                   "u": player_slug.get(page), "c": r["champion"], "k": k, "d": d, "a": aa,
                                   "cs": r["cs"], "gd": r["gold"], "dm": r["damage"], "v": r["vision"],
                                   "it": [x for x in jlist(r["items"])], "tr": r["trinket"], "sp": jlist(r["spells"]),
                                   "ks": r["keystone"], "pt": r["primary_tree"], "stt": r["secondary_tree"],
                                   "rn": [x.strip() for x in str(r["runes"] or "").split(",") if x.strip()]}
                            plist.append({k2: v for k2, v in row.items() if v not in (None, [], "")})
                            # Collect for player, tournament, champion pages
                            team_name = r["team"]
                            mins = base["min"] if base else 0
                            if page:
                                x = tp[page]
                                x["g"] += 1
                                x["w"] += won
                                x["k"] += k
                                x["d"] += d
                                x["a"] += aa
                                if r["cs"] is not None and r["gold"] is not None and mins:
                                    x["cs"] += r["cs"]
                                    x["gold"] += r["gold"]
                                    x["dmg"] += r["damage"] or 0
                                    x["min"] += mins
                                x["team"][team_name] += 1
                                if r["champion"]:
                                    x["champs"][r["champion"]] += 1
                                opp = opp_of.get(team_name, "")
                                latest_heap(p_recent[page], (g["date"], gslug, r["champion"] or "", k, d, aa, won, opp, en, team_name), 20)
                                if ctx.consistent.get(gid):
                                    for key, val in (("kills", k), ("assists", aa), ("dmg", r["damage"] or 0), ("cs", r["cs"] or 0)):
                                        cur = p_best[page].get(key)
                                        if cur is None or val > cur[0]:
                                            p_best[page][key] = (val, g["date"][:10], r["champion"] or "", opp, en, gslug)
                            if r["champion"]:
                                c = champ[r["champion"]]
                                y = (g["date"] or "0000")[:4]
                                c["years"][y][0] += 1
                                c["years"][y][1] += won
                                c["p"] += 1
                                c["w"] += won
                                c["roles"][r["role"] or "?"] += 1
                                if page:
                                    cp = c["players"][page]
                                    cp[0] += 1
                                    cp[1] += won
                                    cp[2] += k
                                    cp[3] += d
                                    cp[4] += aa
                                latest_heap(c["recent"], (g["date"], gslug, page or "", r["team"], opp_of.get(r["team"], ""), k, d, aa, won, en), 20)
                                tc[r["champion"]][0] += 1
                                tc[r["champion"]][1] += won
                        item["p"] = plist
                    # Bans count for champion and tournament pages
                    for sd in sides.values():
                        for ch in sd.get("bans", []):
                            tc[ch][2] += 1
                            champ[ch]["b"] += 1
                            champ[ch]["years"][(g["date"] or "0000")[:4]][2] += 1
                    games_out.append(item)
                stage_name = tab or ""
                out.json(f"game/{gslug}.json", {
                    "e": eslug, "en": en, "stage": stage_name, "date": date, "bo": bo,
                    "a": {"n": an, "u": au, "c": ac}, "b": {"n": bn, "u": bu, "c": bc},
                    "sa": wa, "sb": wb, "w": winner, "games": games_out,
                })
                n_series_pages += 1
                gdate = date[:10]
                title = f"{an} vs {bn} – {en}{' ' + stage_name if stage_name else ''}"
                seo["game"].append((gslug, f"{title} | {SITE}",
                                    f"{an} vs {bn} at {en}{', ' + stage_name if stage_name else ''} ({gdate}): drafts, builds, runes and stats for every game.",
                                    1 if any(g.get("p") for g in games_out) else 0))

            # Team rows for this tournament and the team pages' recent series
            for name, u, mine, theirs, opp in ((an, au, wa, wb, bn), (bn, bu, wb, wa, an)):
                x = tteam[(name, u)]
                x["g"] += mine + theirs
                x["w"] += mine
                if played:
                    x["sg"] += 1
                    x["sw"] += 1 if mine > theirs else 0
                if u and played:
                    fid = ctx.team_of(name, date[:10] if date else "0000")
                    latest_heap(t_recent[fid], (date, gslug or "", opp, mine, theirs, en, eslug), 15)

            stage_rows[tab or ""].append({
                "g": gslug, "a": an, "au": au, "ac": ac, "b": bn, "bu": bu, "bc": bc,
                "sa": wa if played else None, "sb": wb if played else None, "bo": bo, "date": date, "w": winner,
                "_o": ((s and s["ntab"]) or 999, (s and s["n"]) or 999, date),
            })

        if not stage_rows and op not in lp_tourn:
            continue

        # Stages in page order; knockout tabs drawn as a bracket
        is_playoffs = bool(info.get("IsPlayoffs")) or "playoff" in en.lower()
        stages = []
        for tab, rows in sorted(stage_rows.items(), key=lambda kv: (min(r["_o"][0] for r in kv[1]), min(r["_o"][2] for r in kv[1]))):
            rows.sort(key=lambda r: (r["_o"][1], r["_o"][2]))
            for r in rows:
                del r["_o"]
            # Playoffs use plain "Round 1..4" tab names for their bracket rounds
            ko = KNOCKOUT_TAB.match(tab.strip()) or (is_playoffs and ROUND_TAB.match(tab.strip()))
            stages.append({"name": tab, "kind": "bracket" if ko else "list", "series": rows})

        # Standings tables (a new table starts whenever the row number goes back to 1)
        tables = []
        for r in standings.get(op, []):
            if not tables or (num(r["N"]) or 0) <= 1:
                tables.append([])
            tables[-1].append(r)
        stand_out = []
        for i, rows in enumerate(tables):
            name = "Standings" if len(tables) == 1 else f"Group {chr(65 + i)}" if i < 26 else f"Group {i + 1}"
            stand_out.append({"name": name, "rows": [
                {"t": r["Team"], "u": team_ref(r["Team"], last_date or "")[1], "pl": num(r["Place"]),
                 "sw": num(r["WinSeries"]), "sl": num(r["LossSeries"]), "st": num(r["TieSeries"]) or None,
                 "gw": num(r["WinGames"]), "gl": num(r["LossGames"])} for r in rows]})

        res_rows, res_from = results.get(op, []), "this"
        if not res_rows and base_of(op) and results.get(base_of(op)):
            res_rows, res_from = results[base_of(op)], "event"
        res_out = []
        for r in sorted(res_rows, key=lambda r: (num(r["Place_Number"]) or 999, r["Team"])):
            if str(r.get("Showmatch") or "") in ("1", "Yes", "yes"):
                continue
            res_out.append({"p": str(r["Place"] or ""), "t": r["Team"], "u": team_ref(r["Team"], last_date or "")[1],
                            **({"usd": round(r["Prize_USD"])} if r["Prize_USD"] else {})})
        place_of = {r["t"]: r["p"] for r in res_out}

        # Leaders (players with a fair share of the games)
        max_g = max((x["g"] for x in tp.values()), default=0)
        min_g = max(2, math.ceil(max_g * 0.4))
        pool = [(page, x) for page, x in tp.items() if x["g"] >= min_g]

        def lead(key_fn, n=8, fmt=lambda v: v):
            rows = sorted(((key_fn(x), page, x) for page, x in pool if key_fn(x) is not None), key=lambda t: -t[0])[:n]
            return [{"n": ctx.pname(page), "u": player_slug.get(page), "t": x["team"].most_common(1)[0][0], "g": x["g"], "v": fmt(v)}
                    for v, page, x in rows]

        leaders = {}
        if pool:
            leaders = {
                "kda": lead(lambda x: kda(x["k"], x["d"], x["a"])),
                "kills": lead(lambda x: x["k"] / x["g"], fmt=r1),
                "csm": lead(lambda x: x["cs"] / x["min"] if x["min"] else None, fmt=r1),
                "dpm": lead(lambda x: x["dmg"] / x["min"] if x["min"] else None, fmt=round),
                "pool": lead(lambda x: len(x["champs"])),
            }
        champs_out = sorted(({"c": c, "p": v[0], "w": v[1], "b": v[2]} for c, v in tc.items()),
                            key=lambda x: -(x["p"] + x["b"]))[:40]
        teams_out = sorted(({"t": n, "u": u, **v} for (n, u), v in tteam.items()),
                           key=lambda x: (-(x["sw"]), -(x["w"]), x["t"] or ""))
        for x in teams_out:
            x.pop("name", None)

        kids = sorted(children.get(op, []), key=lambda c: ((lp_tourn.get(c) or {}).get("DateStart") or "", c))
        parent = base_of(op)
        sibs = sorted(children.get(parent, []), key=lambda c: ((lp_tourn.get(c) or {}).get("DateStart") or "", c)) if parent else []
        start = info.get("DateStart") or (first_date or "")[:10]
        end = info.get("Date") or (last_date or "")[:10]
        event = {
            "n": en, "u": eslug, "op": op, "league": info.get("League"), "region": info.get("Region"),
            "level": info.get("TournamentLevel"), "start": start, "end": end, "year": str(info.get("Year") or (start or end or "")[:4] or "unknown"),
            "country": info.get("Country"), "type": info.get("EventType"), "prize": info.get("Prizepool"), "cur": info.get("Currency"),
            "q": 1 if info.get("IsQualifier") else 0, "po": 1 if info.get("IsPlayoffs") else 0,
            "parent": {"n": ename(parent), "u": event_slug.get(parent)} if parent and parent in event_slug else None,
            "siblings": [{"n": ename(c), "u": event_slug[c]} for c in sibs if c in event_slug],
            "children": [{"n": ename(c), "u": event_slug[c]} for c in kids if c in event_slug],
            "results": res_out, "resultsFrom": res_from if res_out else None,
            "standings": stand_out, "stages": stages, "teams": teams_out,
            "leaders": leaders, "champs": champs_out, "statsGames": n_stats_games,
            "games": sum(len(v) for v in series.values()), "series": sum(1 for st in stages for _ in st["series"]),
        }
        out.json(f"event/{eslug}.json", {k: v for k, v in event.items() if v not in (None, [], {})})

        # Per-player and per-team tournament rows
        for page, x in tp.items():
            team = x["team"].most_common(1)[0][0]
            p_events[page].append({
                "e": eslug, "en": en, "date": end, "t": team, "tu": team_ref(team, last_date or "")[1], "g": x["g"], "w": x["w"],
                "k": x["k"], "d": x["d"], "a": x["a"], "kda": kda(x["k"], x["d"], x["a"]),
                "csm": r1(x["cs"] / x["min"]) if x["min"] else None, "c": [c for c, _ in x["champs"].most_common(3)],
                "pl": place_of.get(team),
            })
        for (name, u), x in tteam.items():
            if not u:
                continue
            fid = ctx.team_of(name, (last_date or "0000")[:10])
            usd = next((r.get("usd") for r in res_out if r["t"] == name and res_from == "this"), None)
            t_events[fid].append({"e": eslug, "en": en, "date": end, "as": name, "g": x["g"], "w": x["w"], "sg": x["sg"],
                                  "sw": x["sw"], "pl": place_of.get(name), **({"usd": usd} if usd else {})})

        winner_row = next((r for r in res_out if r["p"] == "1"), None)
        events_by_year[event["year"]].append({
            "n": en, "u": eslug, "l": info.get("League"), "r": info.get("Region"), "lv": info.get("TournamentLevel"),
            "st": start, "en": end, "g": event["games"], "q": event["q"],
            **({"w": winner_row["t"], "wu": winner_row["u"]} if winner_row and res_from == "this" else {}),
            **({"p": event["parent"]["u"]} if event.get("parent") else {}),
        })
        recent = end and end >= recent_cut
        wtxt = f" {winner_row['t']} won." if winner_row and res_from == "this" and not recent else ""
        seo["event"].append((eslug, f"{en} – results, bracket and stats | {SITE}",
                             f"{en} ({start} to {end}){': ' + info['League'] if info.get('League') else ''}.{wtxt} "
                             f"Every series, standings, bracket, player leaders and champion picks.",
                             1 if event["games"] >= 4 else 0))

    # Parent events with no games of their own (Worlds 2025 = Play-In + Main Event)
    for op in parents:
        info = dict(lp_tourn.get(op) or {})
        if not info.get("TournamentLevel"):
            levels = {(lp_tourn.get(c) or {}).get("TournamentLevel") for c in children[op]}
            info["TournamentLevel"] = "Primary" if "Primary" in levels else next((x for x in levels if x), None)
        eslug = event_slug[op]
        kids = sorted(children[op], key=lambda c: ((lp_tourn.get(c) or {}).get("DateStart") or "", c))
        res_out = [{"p": str(r["Place"] or ""), "t": r["Team"], "u": team_ref(r["Team"], info.get("Date") or "")[1],
                    **({"usd": round(r["Prize_USD"])} if r["Prize_USD"] else {})}
                   for r in sorted(results.get(op, []), key=lambda r: (num(r["Place_Number"]) or 999, r["Team"]))]
        event = {
            "n": ename(op), "u": eslug, "op": op, "league": info.get("League"), "region": info.get("Region"),
            "level": info.get("TournamentLevel"), "start": info.get("DateStart"), "end": info.get("Date"),
            "year": str(info.get("Year") or (info.get("DateStart") or info.get("Date") or "")[:4] or "unknown"), "country": info.get("Country"), "type": info.get("EventType"),
            "prize": info.get("Prizepool"), "cur": info.get("Currency"),
            "children": [{"n": ename(c), "u": event_slug[c]} for c in kids if c in event_slug],
            "results": res_out, "resultsFrom": "this" if res_out else None,
            "games": sum(op_games.get(c, 0) for c in kids),
        }
        out.json(f"event/{eslug}.json", {k: v for k, v in event.items() if v not in (None, [], {})})
        winner_row = next((r for r in res_out if r["p"] == "1"), None)
        events_by_year[event["year"]].append({
            "n": event["n"], "u": eslug, "l": info.get("League"), "r": info.get("Region"), "lv": info.get("TournamentLevel"),
            "st": event["start"], "en": event["end"], "g": event["games"], "q": 0, "kids": len(event["children"]),
            **({"w": winner_row["t"], "wu": winner_row["u"]} if winner_row else {}),
        })
        recent = (event["end"] or "") >= recent_cut
        seo["event"].append((eslug, f"{event['n']} – results and stages | {SITE}",
                             f"{event['n']}: {', '.join(c['n'] for c in event['children'][:4])}."
                             + (f" {winner_row['t']} won." if winner_row and not recent else "")
                             + " Results, prize money and every stage.", 1 if event["games"] >= 4 else 0))
    print(f"hub: events and series done: {n_series_pages} series pages ({time.time() - t_stage:.0f}s)")

    # -- team pages -------------------------------------------------------------------------
    search_teams = []
    alias = {}
    for fid, t in ctx.teams.items():
        u = team_slug.get(fid)
        if not u or t["g"] < 1:
            continue
        name = ctx.fr_name[fid]
        eras = sorted(ctx.fr_eras[fid], key=lambda e: e["from"], reverse=True)
        for e in eras:
            s_old = pretty(e["n"])
            if s_old and s_old != u and s_old not in team_slug.values():
                alias[s_old] = u
        lpt = lp_team.get(name) or {}
        codes = []
        for e in sorted(eras, key=lambda e: -e["g"]):
            c = str(ctx.team_shorts.get(e["n"]) or "").strip()
            if c and c.lower() not in (x.lower() for x in codes) and c.lower() != name.lower():
                codes.append(c)
        ss = ctx.team_series.get(fid, [])
        sw = sum(1 for x in ss if (x["fa"] if x["w"] == x["a"] else x["fb"]) == fid)
        og = t["obj_g"]
        roster = []
        for year in sorted(ctx.team_players[fid], reverse=True)[:12]:
            top = ctx.team_players[fid][year].most_common(10)
            roster.append({"y": year, "p": [{"n": ctx.pname(pg), "u": player_slug.get(pg), "g": n,
                                             "r": ctx.team_roles[fid][pg].most_common(1)[0][0]} for pg, n in top if n >= 3]})
        recent = sorted(t_recent.get(fid, []), reverse=True)
        tevents = sorted(t_events.get(fid, []), key=lambda x: x["date"] or "", reverse=True)
        obj = {
            "name": name, "u": u, "region": lpt.get("Region"), "codes": codes,
            "disbanded": 1 if lpt.get("IsDisbanded") else 0,
            "g": t["g"], "w": t["w"], "sg": len(ss), "sw": sw, "from": t["from"], "to": t["to"],
            "names": [{"n": e["n"], "from": e["from"], "to": e["to"], "g": e["g"]} for e in eras],
            "avgMin": r1(t["min"] / t["g"]) if t["g"] else 0,
            "kills": r1(t["kills"] / t["kg"]) if t["kg"] else None, "deaths": r1(t["deaths"] / t["kg"]) if t["kg"] else None,
            "obj": {f: r2(t["obj"][f] / og) for f in ("dragons", "barons", "towers", "heralds", "golddiff")} if og else None,
            "years": [{"y": y, "g": v["g"], "w": v["w"], "as": v["names"].most_common(1)[0][0]} for y, v in sorted(t["years"].items(), reverse=True)],
            "recent": [{"date": r[0][:10], "g": r[1] or None, "opp": r[2], "us": r[3], "them": r[4], "en": r[5], "e": r[6]} for r in recent],
            "opps": sorted(({"n": ctx.fr_name[o], "u": team_slug.get(o), **v} for o, v in t["opps"].items()), key=lambda x: -x["g"])[:60],
            "champs": [{"c": c, "g": n, "w": t["champ_w"][c]} for c, n in t["champs"].most_common(30)],
            "bans": [{"c": c, "g": n} for c, n in t["bans_by"].most_common(15)],
            "events": tevents,
            "titles": [{**{k: v for k, v in x.items() if k not in ("fid", "s")}, "e": tname_slug.get(x["t"])} for x in ctx.titles_by_team.get(fid, [])],
            "bestStreak": {"n": t["best_streak"][0], "date": t["best_streak"][1]} if t["best_streak"] else None,
            "roster": roster,
        }
        out.json(f"team/{u}.json", obj)
        search_teams.append([name, short_slug(name, u), t["g"], t["to"][:4], " | ".join(e["n"] for e in eras if e["n"] != name), " | ".join(codes),
                             lpt.get("Region") or ""])
        titles = obj["titles"]
        worlds = sum(1 for x in titles if x["kind"] == "Worlds")
        bits = [f"{t['w']:,}-{t['g'] - t['w']:,} in {t['g']:,} pro games ({t['from'][:4]}–{t['to'][:4]})"]
        if titles:
            bits.append(f"{len(titles)} titles" + (f" incl. {worlds} Worlds" if worlds else ""))
        seo["team"].append((u, f"{name} – stats, roster and history | {SITE}",
                            f"{name}{' (' + ', '.join(codes[:2]) + ')' if codes else ''}: {'; '.join(bits)}. Roster by year, head-to-head records, tournaments and champion picks.",
                            1 if t["g"] >= SEO_MIN_GAMES else 0))
    search_teams.sort(key=lambda x: -x[2])

    # -- player pages -------------------------------------------------------------------------
    search_players = []
    titles_by_event = defaultdict(list)
    for x in ctx.titles:
        titles_by_event[x["t"]].append(x)
    for page, p in ctx.players.items():
        u = player_slug.get(page)
        if not u or p["g"] < 1:
            continue
        name = ctx.pname(page)
        teams_sorted = sorted(p["teams"].items(), key=lambda kv: kv[1]["to"], reverse=True)
        last_date = teams_sorted[0][1]["to"] if teams_sorted else ""
        cutoff = str(int(last_date[:4]) - 1) + last_date[4:] if last_date else ""
        recent_clubs = [(v["g"], n) for n, v in teams_sorted if v["to"] >= cutoff and "National Team" not in n]
        club = max(recent_clubs)[1] if recent_clubs else (teams_sorted[0][0] if teams_sorted else "")
        sm = p["stat_min"]
        bio = lp_player.get(page) or {}
        my_titles = sorted({(x["t"], x["date"], x["kind"]) for x in ctx.titles if (x["t"], x["fid"]) in ctx.player_events[page]},
                           key=lambda x: x[1], reverse=True)
        role = p["roles"].most_common(1)[0][0]
        obj = {
            "name": name, "u": u, "page": page, "role": role,
            "club": club, "clubU": team_slug.get(p["teams"][club]["fid"]) if club in p["teams"] else None,
            "clubTo": p["teams"][club]["to"] if club in p["teams"] else last_date,
            "bio": {k: v for k, v in {
                "real": bio.get("Name"), "native": bio.get("NativeName"), "country": bio.get("Country"),
                "born": bio.get("Birthdate"), "res": bio.get("Residency"), "retired": 1 if bio.get("IsRetired") else None,
                "twitter": bio.get("Twitter"), "stream": bio.get("Stream"), "youtube": bio.get("Youtube"),
            }.items() if v},
            "g": p["g"], "w": p["w"], "k": p["k"], "d": p["d"], "a": p["a"], "kda": kda(p["k"], p["d"], p["a"]),
            "csm": r1(p["cs"] / sm) if sm else None, "gpm": round(p["gold"] / sm) if sm else None,
            "dpm": round(p["dmg"] / sm) if sm else None,
            "teams": [{"n": n, "u": team_slug.get(v["fid"]), "g": v["g"], "w": v["w"], "from": v["from"], "to": v["to"]} for n, v in teams_sorted],
            "years": [{"y": y, "g": v["g"], "w": v["w"], "kda": kda(v["k"], v["d"], v["a"]),
                       "team": v["teams"].most_common(1)[0][0]} for y, v in sorted(p["years"].items(), reverse=True)],
            "champs": sorted(({"c": c, **v, "kda": kda(v["k"], v["d"], v["a"])} for c, v in p["champs"].items()), key=lambda x: -x["g"])[:60],
            "nChamps": len(p["champs"]),
            "events": sorted(p_events.get(page, []), key=lambda x: x["date"] or "", reverse=True),
            "recent": [{"date": r[0][:10], "g": r[1], "c": r[2], "k": r[3], "d": r[4], "a": r[5], "win": r[6], "opp": r[7], "en": r[8], "team": r[9]}
                       for r in sorted(p_recent.get(page, []), reverse=True)],
            "best": {k: {"v": v[0], "date": v[1], "c": v[2], "opp": v[3], "en": v[4], "g": v[5]} for k, v in p_best.get(page, {}).items()},
            "titles": [{"t": t, "date": d, "kind": k, "e": tname_slug.get(t)} for t, d, k in my_titles][:60],
        }
        out.json(f"player/{u}.json", obj)
        search_players.append([name, short_slug(name, u), club, p["g"], last_date[:4], (role or "")[:1],
                               " ".join(x for x in (bio.get("Name"), bio.get("NativeName")) if x) if p["g"] >= 50 else ""])
        seo["player"].append((u, f"{name} – pro stats, champions and career | {SITE}",
                              f"{name}{' (' + bio['Name'] + ')' if bio.get('Name') else ''}, {role}{' for ' + club if club else ''}. "
                              f"{p['g']:,} pro games, KDA {obj['kda']}, {round(100 * p['w'] / p['g']) if p['g'] else 0}% wins"
                              f"{', ' + str(len(my_titles)) + ' titles' if my_titles else ''}. Champion pool, tournaments and career bests.",
                              1 if p["g"] >= SEO_MIN_GAMES else 0))
    search_players.sort(key=lambda x: -x[3])

    # -- champion pages -------------------------------------------------------------------------
    champ_slug_maker = Slugs()
    for c, v in champ.items():
        champ_slug_maker.add(c, c, v["p"])
    champ_slug = champ_slug_maker.build()
    search_champs = []
    for c, v in champ.items():
        if v["p"] + v["b"] < 1:
            continue
        u = champ_slug[c]
        players_top = sorted(v["players"].items(), key=lambda kv: -kv[1][0])[:50]
        obj = {
            "name": c, "u": u, "p": v["p"], "w": v["w"], "b": v["b"],
            "years": [{"y": y, "p": x[0], "w": x[1], "b": x[2]} for y, x in sorted(v["years"].items(), reverse=True)],
            "roles": [{"r": r, "p": n} for r, n in v["roles"].most_common()],
            "players": [{"n": ctx.pname(pg), "u": player_slug.get(pg), "g": x[0], "w": x[1], "kda": kda(x[2], x[3], x[4])} for pg, x in players_top],
            "recent": [{"date": r[0][:10], "g": r[1], "n": ctx.pname(r[2]) if r[2] else "", "u": player_slug.get(r[2]),
                        "team": r[3], "opp": r[4], "k": r[5], "d": r[6], "a": r[7], "win": r[8], "en": r[9]}
                       for r in sorted(v["recent"], reverse=True)],
        }
        out.json(f"champ/{u}.json", obj)
        search_champs.append([c, short_slug(c, u), v["p"]])
        seo["champ"].append((u, f"{c} in pro play – win rate, players and games | {SITE}",
                             f"{c} in professional League of Legends: {v['p']:,} picks, {v['b']:,} bans, "
                             f"{round(100 * v['w'] / v['p']) if v['p'] else 0}% wins. Best players, every year and the latest pro games.", 1))
    search_champs.sort(key=lambda x: -x[2])

    # -- records and titles with links to the hub pages -------------------------------------------
    team_by_name = {ctx.fr_name[fid]: u for fid, u in team_slug.items() if fid in ctx.fr_name}
    rec = json.loads(json.dumps(ctx.records, ensure_ascii=False))
    for lst in rec["game"].values():
        for x in lst:
            gid = x.pop("gid", None)
            x["g"] = gid_slug.get(gid)
            x["e"] = tname_slug.get(x["t"])
            x["au"] = team_ref(x["a"], x["date"])[1]
            x["bu"] = team_ref(x["b"], x["date"])[1]
    for lst in rec["player"].values():
        for x in lst:
            x["u"] = player_slug.get(x.pop("pk", None))
            x["g"] = gid_slug.get(x.pop("gid", None))
            x["e"] = tname_slug.get(x["t"])
            x.pop("ps", None)
    for lst in rec["career"].values():
        for x in lst:
            x["u"] = player_slug.get(x.pop("pk", None))
            x.pop("ps", None)
    for lst in rec["team"].values():
        for x in lst:
            x["u"] = team_by_name.get(x["team"])
            x.pop("s", None)
    out.json("records.json", rec)
    out.json("titles.json", [{**{k: v for k, v in x.items() if k not in ("fid", "s")}, "u": team_slug.get(x["fid"]), "e": tname_slug.get(x["t"])}
                             for x in ctx.titles])

    # -- browse, search, home, meta ----------------------------------------------------------
    search_events = []
    for year, lst in events_by_year.items():
        lst.sort(key=lambda x: (x.get("en") or "", x.get("st") or ""), reverse=True)
        out.json(f"events/{year}.json", lst)
        for x in lst:
            search_events.append([x["n"], short_slug(x["n"], x["u"]), year, x.get("l") or "", (x.get("lv") or "")[:1],
                                  x.get("en") or "", x.get("g") or 0])
    search_events.sort(key=lambda x: (x[5] or "", x[6]), reverse=True)
    out.json("search/teams.json", search_teams)
    out.json("search/players.json", search_players)
    out.json("search/events.json", search_events)
    out.json("search/champs.json", search_champs)
    out.json("alias.json", {"team": alias})

    years = sorted((y for y in events_by_year if y.isdigit()), reverse=True)
    latest_major = [x for y in years[:2] for x in events_by_year[y]
                    if x.get("lv") == "Primary" and not x.get("q") and (x.get("en") or "") <= today and x.get("g", 0) >= 4 and not x.get("p")]
    latest_major.sort(key=lambda x: x.get("en") or "", reverse=True)
    this_year = today[:4]
    busiest = sorted(((x, p) for x, p in ((ctx.players[pg], pg) for pg in ctx.players)
                      if x["years"].get(this_year, {}).get("g", 0) >= 10),
                     key=lambda t: -t[0]["years"][this_year]["g"])[:12]
    home = {
        "latest": latest_major[:12],
        "busiest": [{"n": ctx.pname(pg), "u": player_slug.get(pg), "g": x["years"][this_year]["g"], "w": x["years"][this_year]["w"],
                     "kda": kda(x["years"][this_year]["k"], x["years"][this_year]["d"], x["years"][this_year]["a"])} for x, pg in busiest],
        "year": this_year,
    }
    out.json("home.json", home)
    out.json("meta.json", {
        "version": ctx.version, "games": sum(op_games.values()), "statsGames": len(ctx.games),
        "series": n_series_pages, "teams": len(search_teams), "players": len(search_players), "events": len(search_events),
        "champs": len(search_champs), "years": years,
    })
    for kind, rows in seo.items():
        out.text(f"seo/{kind}.tsv", "".join(f"{tsv_cell(s)}\t{tsv_cell(t)}\t{tsv_cell(d)}\t{i}\n" for s, t, d, i in rows))
    out.finish()
    stats = {"series pages": n_series_pages, "teams": len(search_teams), "players": len(search_players),
             "events": len(search_events), "champions": len(search_champs), "files written": out.written,
             "files linked": out.linked, "MB written": round(out.bytes / 1e6, 1), "seconds": round(time.time() - t0)}
    for k, v in stats.items():
        checks[f"hub: {k}"] = v
    return stats
