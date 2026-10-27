"""
Stats hub pages (the gol.gg / Leaguepedia-style part of RiftWise's Stats tab).

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
  hub/photos.json                   {slug: "YYYYMMDD"} players with a Leaguepedia photo (photos_lp.py)
  hub/event/<slug>.json             tournament page: info, results, standings, stages and bracket, leaders
  hub/game/<slug>.json              one series: each game's draft, players, items, runes, objectives, VOD, rating
  hub/best/...                      the best-rated games and series (all time, by year, by league, by league and year)
  hub/champ/<slug>.json             champion page
  hub/teamseries/<slug>.json        every series of a team: [date, opponent, its slug, won, lost, event, event slug,
                                    series slug, stage, name played under, series rating], newest first
  hub/playergames/<slug>.json       every game of a player with stats: [date, series slug, champion, k, d, a, won, team,
                                    opponent, event, role, event slug, cs, gold, damage, vision, minutes, team kills,
                                    team damage, team gold, team vision, timeline], newest first; timeline is
                                    Oracle's Elixir's [gd10, csd10, xpd10, gd15, csd15, xpd15, gd20, csd20, xpd20,
                                    first blood 1 kill / 2 assist / 3 died / 0, wards, wards killed, control wards]
                                    or null (see timeline.py); then the game number in the series and the game's rating
  hub/csv/<event>.csv               every game of a tournament, one row per player and per team; csv/index.json
                                    (not "downloads": lolworlds.com's request filtering blocks any URL with "/download")
  hub/leagueyear/<league>/<year>.json  a league's whole season: player and team tables (percentile ranks)
  hub/teamgames/<slug>.json         every game of a team: [date, series slug, event slug, event, opponent, its slug, side b/r,
                                    won, minutes, kills, deaths, gold, opp gold, dragons, opp dragons, barons, opp barons,
                                    towers, opp towers, bans, picks, opponent's bans, roles of the picks, timeline,
                                    each pick's gold lead over its lane opponent at 15 (or null)],
                                    newest first; timeline is Oracle's Elixir's [gd10, gd15, gd20, csd15, xpd15,
                                    first blood, first tower, first mid tower, first to 3 towers, first dragon, first
                                    herald, first baron, plates, opp plates, grubs, opp grubs, wards, wards killed,
                                    control wards, vision score] or null (see timeline.py)
  hub/events/<year>.json            all tournaments of a year
  hub/records.json, hub/titles.json the Stats tab's records and title lists, with links to the hub pages
  hub/rating.json                   the player rating's weights and role-year averages (player_rating.py): the app
                                    rates each game's players with it; weekly.json / home.json carry the best averages
  hub/alias.json                    {"team": {old slug: current slug}}: teams that changed name
  hub/seo/<kind>.tsv                slug, title, description, index flag (read by the page service)
  hub/manifest.json                 file -> content hash, so the next build can hard-link unchanged files

Slugs are readable ("faker", "t1", "worlds-2025-main-event") and are what the page URLs use
(riftwise.gg/player/faker). Inputs are read-only: the catalog plus, when present, the
Leaguepedia sidecar database (lp_all_games.db) for every series' stage, order and score.
"""
import csv
import io
import datetime
import heapq
import html
import json
import math
import os
import re
import sqlite3
import time
from collections import Counter, defaultdict

import leagues_info
import player_rating as prating
import ratings as team_ratings
import timeline
from names import blue_red, champ_name, match_teams

SITE = "RiftWise"
RECENT_EVENT_DAYS = 30        # event and series descriptions leave the winner out while this fresh
SEO_MIN_GAMES = 10            # thinner team / player pages are kept out of search engines
# match pages older than this stay out of the sitemaps unless they're from a big event: 100k match pages spread a
# search engine's crawl over 2014 minor-league series instead of the pages that can rank (2026-10-27)
SEO_MATCH_FROM = (datetime.date.today() - datetime.timedelta(days=730)).isoformat()
KNOCKOUT_TAB = re.compile(
    r"^(round of \d+|(quarter|semi)-?finals?|finals?|grand finals?|(third|3rd)[- ]place( match| decider)?|"
    r"(upper|lower|winners'?|losers'?) (bracket|round|final|semifinal|quarterfinal).*|knockouts?|bracket stage|"
    r"playoffs?( round \d+)?|ub .*|lb .*|elimination match|decider match|qualification match)$",
    re.I,
)
ROUND_TAB = re.compile(r"^round \d+$", re.I)
ROLE_ORDER = {"Top": 0, "Jungle": 1, "Mid": 2, "Bot": 3, "Support": 4}
DRAKES = ("Clouds", "Infernals", "Mountains", "Oceans", "Hextechs", "Chemtechs")

from hub_util import (  # the helpers (hub_util.py)
    LEAGUE_COUNTRY, LEAGUE_NAME_COUNTRY, Slugs, Writer, champs, chunks, clean, country_code, csv_safe, fix_patch, jlist,
    kda, milestone_notes, num, parse_len, phase_rank, player_summary, pretty, r1, r2, region_code, rmin, rune_name,
    short_hash, short_slug, soloq_ids, spell_name, team_summary, tsv_cell, unesc,
)


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
    for r in con.execute("SELECT Name, Short, Region, Location, TeamLocation, IsDisbanded, Website, Twitter FROM lp_teams"):
        lp_team[r["Name"]] = {k: clean(v) for k, v in dict(r).items()}
    lp_player = {}
    for r in con.execute(
        """SELECT OverviewPage, ID, Name, NativeName, Country, Birthdate, Deathdate, Residency, Role, Team,
                  IsRetired, Twitter, Stream, Youtube, Contract, FavChamps, SoloqueueIds FROM lp_players"""
    ):
        lp_player[r["OverviewPage"]] = {k: clean(v) for k, v in dict(r).items()}
    results = defaultdict(list)
    for r in con.execute(
        "SELECT OverviewPage, Place, Place_Number, Team, Prize_USD, Showmatch, Phase FROM lp_tournament_results WHERE Team IS NOT NULL AND Team != ''"
    ):
        results[r["OverviewPage"]].append(dict(r))
    standings = defaultdict(list)
    for r in con.execute(
        "SELECT OverviewPage, Team, N, Place, WinSeries, LossSeries, TieSeries, WinGames, LossGames, Points FROM lp_standings ORDER BY rowid"
    ):
        standings[r["OverviewPage"]].append(dict(r))

    # -- every game: all_games (weekly, everything Leaguepedia knows) + matches (nightly, newest) --
    games_by_op = defaultdict(dict)  # op -> (match_id, n) -> game
    by_catalog_id = {}               # catalog game id -> (op, key) of the all_games row that already has it
    # the catalog's columns change now and then (patch_inferred came and went): ask for the ones that exist
    ag_cols = {r[1] for r in con.execute("PRAGMA table_info(all_games)")}
    patch_inf = "patch_inferred" if "patch_inferred" in ag_cols else "NULL AS patch_inferred"
    for r in con.execute(
        f"""SELECT match_id, game_number, status, tournament_name, overview_page, date_utc, patch, {patch_inf},
                  team1, team2, winner_side, winner, series_team1, series_team2, best_of, is_remake, ff, vod_url,
                  vod_game_start, vod_pb, catalog_game_id, has_stats, mvp FROM all_games WHERE overview_page IS NOT NULL"""
    ):
        if ctx.is_show(r["overview_page"], r["tournament_name"]):
            continue
        games_by_op[r["overview_page"]][(r["match_id"], r["game_number"])] = {
            "mid": r["match_id"], "n": r["game_number"] or 1, "status": r["status"], "tname": r["tournament_name"],
            "date": (r["date_utc"] or "")[:16], "patch": r["patch"] or r["patch_inferred"], "t1": r["team1"], "t2": r["team2"],
            "w": r["winner"] if r["winner"] in (r["team1"], r["team2"]) else None,
            "sa": r["series_team1"], "sb": r["series_team2"], "bo": r["best_of"], "remake": r["is_remake"], "ff": r["ff"],
            "vod": unesc(r["vod_url"]), "gid": r["catalog_game_id"] if r["has_stats"] else None, "mvp": r["mvp"] or None,
            # the same VOD at the draft and at the game's start (Leaguepedia's timestamps)
            "vpb": unesc(r["vod_pb"]), "vgs": unesc(r["vod_game_start"]),
        }
        if r["catalog_game_id"]:
            by_catalog_id[r["catalog_game_id"]] = (r["overview_page"], (r["match_id"], r["game_number"]))
    added_new = 0
    renumbered = 0
    winner_fixed = 0
    team_key = lambda t: re.sub(r"[^a-z0-9]", "", (t or "").lower())

    def same_team(x, y):
        a_, b_ = team_key(x), team_key(y)
        return a_ == b_ or (len(a_) >= 4 and len(b_) >= 4 and (a_ in b_ or b_ in a_))

    def same_pair(a1, a2, b1, b2):
        return (same_team(a1, b1) and same_team(a2, b2)) or (same_team(a1, b2) and same_team(a2, b1))

    def near_day(d1, d2):
        try:
            return abs((datetime.date.fromisoformat((d1 or "")[:10]) - datetime.date.fromisoformat((d2 or "")[:10])).days) <= 2
        except ValueError:
            return False

    linked_by_id = 0
    filled_new = 0
    tname_to_op = {}
    for r in con.execute(
        """SELECT game_id, match_id, game_number, tournament_name, overview_page, stage_tab, date_utc, patch, team1, team2,
                  winner, best_of, vod_url, mepi_rating, duration_minutes, team1_kills, team2_kills
           FROM matches WHERE overview_page IS NOT NULL"""
    ):
        op = r["overview_page"]
        if ctx.is_show(op, r["tournament_name"]):
            continue
        if r["tournament_name"]:
            tname_to_op.setdefault(r["tournament_name"], op)
        key = (r["match_id"] or r["game_id"], r["game_number"] or 1)
        g = games_by_op[op].get(key)
        moved = False
        if g is not None and g["t1"] and g["t2"] and r["team1"] and r["team2"] and not same_pair(g["t1"], g["t2"], r["team1"], r["team2"]):
            # Leaguepedia renumbered the series (NA LCS 2013 Spring semifinals 1 and 2 are swapped between the two
            # tables): this game belongs to the series with its teams, the same game number, within two days
            g = next((x for x in games_by_op[op].values() if x["n"] == key[1] and x["t1"] and x["t2"]
                      and same_pair(x["t1"], x["t2"], r["team1"], r["team2"]) and near_day(x["date"], r["date_utc"])), None)
            if g is None:
                continue  # not found: leave both alone rather than mix this game into the other series
            renumbered += 1
            moved = True
        if g is None and r["game_id"] in by_catalog_id:
            # the same game under another series id ("Season 1 World Championship_rebuilt_..." for "..._Bracket Stage_2",
            # "Third-Place Match" for "Third-Place match"): one game, not a second copy of it
            op_c, key_c = by_catalog_id[r["game_id"]]
            g = games_by_op[op_c].get(key_c)
            linked_by_id += 1 if g is not None else 0
        if g:
            g["mepi"] = r["mepi_rating"]
            g["m_min"], g["m_k"] = r["duration_minutes"], {r["team1"]: r["team1_kills"], r["team2"]: r["team2_kills"]}
            if not g["vod"] and r["vod_url"]:
                g["vod"] = unesc(r["vod_url"])
            if (moved or not g["gid"] or g["gid"] not in ctx.games) and r["game_id"] in ctx.games:
                # (after a renumbering, all_games points each series at the other one's scoreboard: this game's wins)
                g["gid"] = r["game_id"]
            mw = r["winner"] if r["winner"] in (r["team1"], r["team2"]) else None
            if mw and g["w"] and g["t1"] and g["t2"] and g["gid"] == r["game_id"] and not same_team(g["w"], mw):
                # Leaguepedia's schedule and scoreboard name different winners (35 games): the scoreboard's is the
                # team that took more towers and inhibitors in 26 of 27 that can be told, and the players' careers
                # count it, so the series page and the game logs follow it too
                to = g["t1"] if same_team(g["t1"], mw) else g["t2"] if same_team(g["t2"], mw) else None
                if to:
                    g["w"] = to
                    winner_fixed += 1
            if not (g["t1"] and g["t2"]) and r["team1"] and r["team2"]:
                # played in the last days: all_games has the slot, matches has who played and won
                g.update({"t1": r["team1"], "t2": r["team2"], "date": (r["date_utc"] or g["date"])[:16],
                          "w": r["winner"] if r["winner"] in (r["team1"], r["team2"]) else None, "status": "full"})
                g["patch"] = g["patch"] or r["patch"]
                filled_new += 1
            continue
        games_by_op[op][key] = {
            "mid": key[0], "n": key[1], "status": "full", "tname": r["tournament_name"], "date": (r["date_utc"] or "")[:16],
            "patch": r["patch"], "t1": r["team1"], "t2": r["team2"], "w": r["winner"] if r["winner"] in (r["team1"], r["team2"]) else None,
            "sa": None, "sb": None, "bo": r["best_of"], "remake": 0, "ff": 0, "vod": unesc(r["vod_url"]),
            "gid": r["game_id"] if r["game_id"] in ctx.games else None, "tab": html.unescape(r["stage_tab"] or "") or None, "mepi": r["mepi_rating"],
            "m_min": r["duration_minutes"], "m_k": {r["team1"]: r["team1_kills"], r["team2"]: r["team2_kills"]},
        }
        added_new += 1
    checks["hub: games newer than all_games (from matches)"] = added_new
    checks["hub: matches games moved to their renumbered series"] = renumbered
    checks["hub: game winners taken from the scoreboard (schedule disagreed)"] = winner_fixed
    checks["hub: matches games found in all_games by their catalog id (not added twice)"] = linked_by_id
    checks["hub: fresh games given teams from matches"] = filled_new
    placeholders = 0
    for gm in games_by_op.values():
        # keep rows that still have something to show (a VOD link, Player of the Game)
        for key in [k for k, g in gm.items()
                    if not g["t1"] and not g["t2"] and not g["w"] and not g["gid"] and not g.get("vod") and not g.get("mvp")]:
            del gm[key]
            placeholders += 1
    checks["hub: placeholder games left out (no teams, result, VOD or POG)"] = placeholders

    # -- pentakills (Leaguepedia ScoreboardPlayers), tournament rosters and their region codes --
    lp_game_key = {}
    for r in con.execute("SELECT GameId, MatchId, N_GameInMatch FROM lp_scoreboard_games WHERE GameId IS NOT NULL"):
        lp_game_key[r[0]] = (r[1], num(r[2]) or 1)
    pentas = defaultdict(list)  # (match id, game number) -> [(page, champion, count)]
    for r in con.execute("SELECT GameId, Link, Champion, Pentakills FROM lp_scoreboard_players WHERE Pentakills > 0"):
        key = lp_game_key.get(r[0])
        if key and r[1]:
            pentas[key].append((r[1], r[2] or "", num(r[3]) or 1))
    rosters = defaultdict(lambda: defaultdict(list))  # op -> team -> [(page, role, flag, order)]
    for r in con.execute(
        "SELECT OverviewPage, Team, Link, Role, Flag, N_PlayerInTeam FROM lp_tournament_players WHERE Team IS NOT NULL AND Link IS NOT NULL"
    ):
        rosters[r[0]][r[1]].append((r[2], r[3] or "", r[4] or "", num(r[5]) or 99))
    roster_region = {}
    for r in con.execute("SELECT OverviewPage, Team, Region FROM lp_tournament_rosters WHERE Region IS NOT NULL AND Region != ''"):
        roster_region[(r[0], r[1])] = region_code(r[2])

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
                    "mid": r[0], "op": r[1], "tab": html.unescape(r[2] or ""), "ntab": num(r[3]), "n": num(r[4]), "bo": num(r[5]),
                    "a": clean(r[6]), "b": clean(r[7]), "sa": num(r[8]), "sb": num(r[9]), "w": str(r[10] or ""), "date": (r[11] or "")[:16],
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
    # Leaguepedia's scoreboards sometimes spell a player's page in another case ("vital" for the page "Vital"):
    # map such a name to the one player page it can only mean
    pages_by_lower = defaultdict(list)
    for page in ctx.players:
        pages_by_lower[page.lower()].append(page)

    def canon_page(page):
        if page in ctx.players:
            return page
        same = pages_by_lower.get((page or "").lower(), [])
        return same[0] if len(same) == 1 else ctx.names.resolve(page) or page

    ops = sorted(op for op in set(games_by_op) | {op for op in sched_by_op if op in lp_tourn}
                 if not ctx.is_show(op, (lp_tourn.get(op) or {}).get("Name")))
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
    league_slug_maker = Slugs()
    league_weight = Counter()
    for op in ops + parents:
        lg = (lp_tourn.get(op) or {}).get("League")
        if lg:
            league_weight[lg] += op_games.get(op, 0) + 1
    for lg, w in league_weight.items():
        league_slug_maker.add(lg, lg, w)
    league_slug = league_slug_maker.build()

    INTL_LEAGUES = {"World Championship", "Mid-Season Invitational", "First Stand", "Esports World Cup"}

    def league_of(info):
        lg = (info or {}).get("League")
        if lg in INTL_LEAGUES and (info or {}).get("Region") not in (None, "", "International"):
            return None  # "LPL 2025 Regional Finals": China's Worlds qualifier, not a Worlds event
        return lg

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
        code = (ctx.short_of(name) or str((lp_team.get(name) or {}).get("Short") or "").strip()
                or (fr_code.get(fid) if fid in fr_code else "")) or None
        return name, u, code

    # -- per-tournament pass: series files, event files, and everything players / teams / champions collect --
    p_events = defaultdict(list)       # page -> per-tournament stats
    p_recent = defaultdict(list)       # page -> heap of the newest games
    p_best = defaultdict(dict)         # page -> stat -> (value, date, champ, opp, event, game slug)
    t_events = defaultdict(list)       # fid -> per-tournament rows
    t_recent = defaultdict(list)       # fid -> heap of the newest series
    t_series = defaultdict(list)       # team slug -> every series it played (results archive)
    t_side = defaultdict(lambda: [0, 0, 0, 0])   # fid -> blue games, blue wins, red games, red wins
    t_bans_vs = defaultdict(Counter)   # fid -> champions banned against them
    p_mvp = Counter()                  # page -> Player of the Game awards
    p_pentas = defaultdict(list)       # page -> [(date, champion, series slug, event)]
    all_pentas = []                    # (date, page, champion, game slug, event, event slug, team a, team b, count)
    patch_stats = defaultdict(lambda: {"g": 0, "from": "9", "to": "0", "p": Counter(), "w": Counter(), "b": Counter(), "pres": Counter()})
    newest_full = max((g["date"] for gm in games_by_op.values() for g in gm.values() if g["gid"]), default="")
    build_cut = (datetime.date.fromisoformat(newest_full[:10]) - datetime.timedelta(days=365)).isoformat() if newest_full else "0"
    p_games = defaultdict(list)        # page -> every game with stats (game log)
    champ = defaultdict(lambda: {"years": defaultdict(lambda: [0, 0, 0]), "roles": Counter(),
                                 "players": defaultdict(lambda: [0, 0, 0, 0, 0]), "recent": [], "p": 0, "w": 0, "b": 0,
                                 "best": None, "side": [0, 0, 0, 0], "items": Counter(), "items_w": Counter(), "bg": 0,
                                 # pick slot in the draft (B1, B2-3, B4-5, R1-2, R3, R4, R5) -> [games, wins], when the order is known
                                 "slots": defaultdict(lambda: [0, 0]),
                                 "keys": Counter(), "keys_w": Counter(), "spells": Counter(), "spells_w": Counter(),
                                 # matchups (all time, last 12 months): [games, wins, games with lane leads at 15,
                                 # sum of gold / CS / XP lead at 15, games ahead in gold at 15]; lane: the same per role
                                 "mu": defaultdict(lambda: [0] * 7), "mu12": defaultdict(lambda: [0] * 7),
                                 "lane": defaultdict(lambda: [0] * 7), "lane12": defaultdict(lambda: [0] * 7),
                                 "duo": defaultdict(lambda: [0, 0])})
    events_by_year = defaultdict(list)
    seo = defaultdict(list)
    n_series_pages = 0
    used_gslugs = set()
    # Game ratings (MEPI, 0-100, Antigravity's engine on the catalog: matches.mepi_rating) for the Best games page
    best_games, best_series = [], []
    # the weekly recap (hub/weekly.json): the last seven days' series in top leagues and international events, and
    # game 1 of each tagged for the ratings run, whose pre-game chance finds the week's upsets
    # (RIFTWISE_WEEK_TO=YYYY-MM-DD ends the week on another day: the test build's games stop on 2026-10-17)
    WEEK_TO = os.environ.get("RIFTWISE_WEEK_TO") or today
    WEEK_FROM = (datetime.date.fromisoformat(WEEK_TO) - datetime.timedelta(days=6)).isoformat()
    week_series = []  # [date, event, event slug, stage, a, a slug, b, b slug, wins a, wins b, series slug, international]
    week_tagged = {}  # rating-game tag -> series slug
    week_seen = set()
    # the week's picks and bans in the same games: champion -> [picks, bans, wins]
    week_champs = {"games": 0, "c": defaultdict(lambda: [0, 0, 0])}
    # players of the week / month count games in the main leagues and international events: each event's league here,
    # the main ones (a top league with a short name like LCK, or an international one) once the league list is made
    event_league = {}
    top_leagues = set()
    PROMO_RE = re.compile(r"promotion|qualif|relegation", re.I)
    MONTH_FROM = (datetime.date.fromisoformat(WEEK_TO) - datetime.timedelta(days=29)).isoformat()
    # champion -> (opponent champion, role) -> [games, wins, gold-lead-at-15 sum, games with it]: the counter-pick finder
    lane_vs = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0]))
    gid_slug = {}                      # catalog game id -> its series page
    gid_n = {}                         # catalog game id -> its game number in the series (links open that game)
    t_stage = time.time()

    def latest_heap(heap, item, size):
        if len(heap) < size:
            heapq.heappush(heap, item)
        elif item > heap[0]:
            heapq.heapreplace(heap, item)

    def new_tp_row():
        return {"g": 0, "w": 0, "k": 0, "d": 0, "a": 0, "cs": 0, "gold": 0, "dmg": 0, "min": 0.0,
                "team": Counter(), "champs": Counter(), "roles": Counter(), "tk": 0, "vis": 0, "vg": 0, "dmin": 0.0,
                "sdmg": 0, "tdmg": 0, "sgold": 0, "tgold": 0, "svis": 0, "tvis": 0,
                # Oracle's Elixir: games with leads at 15 and their sums; games with first blood known, taking part, dying
                "tn": 0, "g15": 0, "c15": 0, "x15": 0, "fbn": 0, "fbp": 0, "fbv": 0}

    def new_tts_row():
        return {"g": 0, "w": 0, "min": 0.0, "k": 0, "d": 0, "gd": 0, "drag": 0, "bar": 0, "tow": 0,
                "her": 0, "grub": 0, "gold": 0, "tl": 0, "odrag": 0, "obar": 0, "oher": 0, "blue": 0,
                "pg": 0, "pmin": 0.0, "cs": 0, "dmg": 0,
                # Oracle's Elixir: games with the lead at 15 and its sum; first blood / first tower; turret plates
                "tn": 0, "g15": 0, "fbn": 0, "fb": 0, "ft": 0, "pln": 0, "pl": 0, "opl": 0}

    def new_facts():
        # g = games played (matches the side wins); mg = games with a length and kills, for the averages
        return {"g": 0, "mg": 0, "min": 0.0, "kills": 0, "kg": 0, "blue": 0, "red": 0, "drakes": Counter(), "short": None,
                "long": None, "bloody": None, "pentas": [], "farm": None, "best": None}

    def stats_out(tp, tts, tc, facts, ev_mvp, tteam, regions, last_date):
        """Leaders, player / team / champion tables, facts, region and team records of a tournament
        (one stage, or a whole event's stages summed)."""
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
                # no damage before 2015: an event without it gets no damage leaders (not eight players tied at 0)
                "dpm": lead(lambda x: x["dmg"] / x["dmin"] if x["dmin"] and x["dmg"] else None, fmt=round),
                "pool": lead(lambda x: len(x["champs"])),
            }
        # Every player's numbers in this tournament (sums; the app works out the per-game and per-minute rates)
        players_out = []
        for page, x in sorted(tp.items(), key=lambda kv: -kv[1]["g"]):
            team = x["team"].most_common(1)[0][0]
            players_out.append({
                "n": ctx.pname(page), "u": player_slug.get(page), "t": team, "tu": team_ref(team, last_date or "")[1],
                "r": x["roles"].most_common(1)[0][0], "g": x["g"], "w": x["w"], "k": x["k"], "d": x["d"], "a": x["a"],
                "tk": x["tk"], "cs": x["cs"], "gold": x["gold"], "dmg": x["dmg"], "min": r1(x["min"]), "dm": r1(x["dmin"]),
                "vis": x["vis"], "vmin": r1(x["vg"]), "c": [c for c, _ in x["champs"].most_common(3)], "nc": len(x["champs"]),
                "sd": x["sdmg"], "td": x["tdmg"], "sg": x["sgold"], "tg": x["tgold"], "sv": x["svis"], "tv": x["tvis"],
                **({"mvp": ev_mvp[page]} if ev_mvp.get(page) else {}),
                **({"tn": x["tn"], "g15": x["g15"], "c15": x["c15"], "x15": x["x15"]} if x["tn"] else {}),
                **({"fbn": x["fbn"], "fbp": x["fbp"], "fbv": x["fbv"]} if x["fbn"] else {}),
            })
        team_stats_out = sorted(({"t": n, "u": team_ref(n, last_date or "")[1], **{k: (r1(v) if k == "min" else v) for k, v in z.items()}}
                                 for n, z in tts.items() if z["g"]), key=lambda x: (-x["w"] / x["g"], -x["g"]))
        overview = None
        if facts["g"]:
            overview = {
                "g": facts["g"], "min": rmin(facts["min"] / facts["mg"]) if facts["mg"] else 0,
                "kills": r1(facts["kills"] / facts["kg"]) if facts["kg"] else 0,
                "blue": facts["blue"], "red": facts["red"], "drakes": dict(facts["drakes"]),
                "short": facts["short"], "long": facts["long"], "bloody": facts["bloody"], "farm": facts["farm"],
                **({"best": facts["best"]} if facts["best"] else {}),
                "pentas": facts["pentas"],
                "mvp": [{"n": ctx.pname(pg), "u": player_slug.get(pg), "v": n} for pg, n in ev_mvp.most_common(8)],
            }
        regions_out = [{"a": k[0], "b": k[1], "wa": v[0], "wb": v[1]} for k, v in sorted(regions.items(), key=lambda kv: -sum(kv[1]))]
        champs_out = sorted(({"c": c, "p": v[0], "w": v[1], "b": v[2]} for c, v in tc.items()),
                            key=lambda x: -(x["p"] + x["b"]))[:40]
        teams_out = sorted(({"t": n, "u": u, **{k: v for k, v in x.items() if k != "name"}} for (n, u), x in tteam.items()),
                           key=lambda x: (-(x["sw"]), -(x["w"]), x["t"] or ""))
        return {"leaders": leaders, "players": players_out, "teamStats": team_stats_out, "overview": overview,
                "regions": regions_out, "champs": champs_out, "teams": teams_out}

    def results_out(res_rows, date):
        """A tournament's placings, one row per team. Leaguepedia can list several (regular season and playoffs, a
        pro and an amateur cup, weekly cups and the finals): the row of the phase that counts most wins, the prize
        money of all of a team's rows adds up."""
        best, prize = {}, Counter()
        for r in res_rows:
            if str(r.get("Showmatch") or "") in ("1", "Yes", "yes") or not r["Team"]:
                continue
            prize[r["Team"]] += r["Prize_USD"] or 0
            k = (phase_rank(r.get("Phase")), num(r["Place_Number"]) or 999, -(r["Prize_USD"] or 0))
            if r["Team"] not in best or k < best[r["Team"]][0]:
                best[r["Team"]] = (k, r)
        out_r = []
        for team_, (k, r) in sorted(best.items(), key=lambda kv: (kv[1][0], kv[0])):
            out_r.append({"p": str(r["Place"] or ""), "t": team_, "u": team_ref(team_, date or "")[1],
                          **({"usd": round(prize[team_])} if prize[team_] else {})})
        return out_r

    final_tab = re.compile(r"\b(grand\s+)?finals?\b", re.I)

    def final_winner(stages):
        """(team, slug) of the side that won the final, read off the bracket when Leaguepedia's results table has
        no first place yet (it lags the games by days; a qualifier's only lists who fell short). Only a sure thing
        counts: a stage named as the final, or a last bracket stage of one series, with every series decided."""
        brackets = [st for st in stages if st["kind"] == "bracket"]
        if not brackets:
            return None
        finals = [st for st in brackets if final_tab.search(st["name"] or "")]
        if finals:
            grand = [st for st in finals if re.search(r"grand", st["name"], re.I)]
            plain = [st for st in finals if not re.search(r"lower|upper|loser|winner|bracket", st["name"], re.I)]
            stage = (grand or plain or finals)[-1]
        else:
            stage = brackets[-1]
            if len(stage["series"]) != 1:
                return None  # a round of several series (the semifinals) is not the final
        decided = [r for r in stage["series"] if r["w"] in (1, 2) and r["a"] and r["b"]]
        if not decided or len(decided) != len(stage["series"]):
            return None
        last = max(decided, key=lambda r: r["date"] or "")
        return (last["a"], last["au"]) if last["w"] == 1 else (last["b"], last["bu"])

    def merge_stages(parts):
        """Sum the numbers kept for each stage of an event. A team that changed its name between stages ("BRION" ->
        "HANJIN BRION") is one row, under the name it had last."""
        tp_m, tts_m, facts_m = defaultdict(new_tp_row), defaultdict(new_tts_row), new_facts()
        newest = {}  # team page (or name) -> (last date, name)
        for p in parts:
            for name in p["tts"]:
                key = team_ref(name, p["last"] or "")[1] or name
                if (p["last"] or "", name) > newest.get(key, ("", "")):
                    newest[key] = (p["last"] or "", name)
        tc_m, ev_m = defaultdict(lambda: [0, 0, 0]), Counter()
        tteam_m = defaultdict(lambda: {"g": 0, "w": 0, "sg": 0, "sw": 0, "name": None})
        regions_m = defaultdict(lambda: [0, 0])
        last = ""
        for p in parts:
            for page, x in p["tp"].items():
                y = tp_m[page]
                for k, v in x.items():
                    if isinstance(v, Counter):
                        y[k].update(v)
                    else:
                        y[k] += v
            for name, z in p["tts"].items():
                y = tts_m[newest[team_ref(name, p["last"] or "")[1] or name][1]]
                for k, v in z.items():
                    y[k] += v
            for c, v in p["tc"].items():
                for i in range(3):
                    tc_m[c][i] += v[i]
            f = p["facts"]
            for k in ("g", "mg", "min", "kills", "kg", "blue", "red"):
                facts_m[k] += f[k]
            facts_m["drakes"].update(f["drakes"])
            facts_m["pentas"] += f["pentas"]
            for k, better in (("short", lambda a, b: a < b), ("long", lambda a, b: a > b), ("bloody", lambda a, b: a > b),
                              ("farm", lambda a, b: a > b), ("best", lambda a, b: a > b)):
                if f[k] and (facts_m[k] is None or better(f[k]["v"], facts_m[k]["v"])):
                    facts_m[k] = f[k]
            ev_m.update(p["mvp"])
            for key, x in p["tteam"].items():
                y = tteam_m[key]
                for k in ("g", "w", "sg", "sw"):
                    y[k] += x[k]
            for key, v in p["regions"].items():
                regions_m[key][0] += v[0]
                regions_m[key][1] += v[1]
            last = max(last, p["last"] or "")
        return tp_m, tts_m, tc_m, facts_m, ev_m, tteam_m, regions_m, last, sum(p["stats"] for p in parts)

    kept = {}                          # stage -> its sums, for the whole-event page
    champ_games = defaultdict(lambda: {"ev": {}, "g": []})  # (league slug, year) -> champion game log
    h2h_pairs = defaultdict(lambda: [0, 0])     # (code a, code b) sorted -> game wins of a, of b
    h2h_series = defaultdict(list)              # (code a, code b) -> [(date, event, wins a, wins b, Worlds/MSI/First Stand)]
    h2h_newest = ""                              # newest game in the table (its cutoff)
    h2h_names = defaultdict(dict)                # code -> team name -> its newest game under that code
    H2H_ALIASES = {"TLAW": "TL", "MKOI": "MDK", "KRX": "DRX", "DNS": "KDF", "DNF": "KDF"}  # = CODE_ALIASES in src/helpers.ts
    INTL_RE = re.compile(r"world|msi|mid-season|first stand", re.I)
    # the H2H view's "Worlds · MSI · First Stand" line: only those three (not the Esports World Cup, the Americas
    # Cup or a Worlds qualifier); same test as scripts/h2h/refresh.py and isBigEvent in src/helpers.ts
    BIG_EVENT_RE = re.compile(r"\bworlds\b|world championship|\bmsi\b|mid-season invitational|first stand", re.I)
    NOT_BIG_RE = re.compile(r"world cup|qualif", re.I)

    def big_event(name):
        return bool(name and BIG_EVENT_RE.search(name) and not NOT_BIG_RE.search(name))

    # events that get a lines file (their stats on the event page) besides the big ones: those played into last year
    # or later (~20 MB; every year would be ~140 MB a build)
    LINES_FROM = f"{datetime.date.today().year - 1}-01-01"

    # Riot's team list once per build: logos for big events' team lists, photos for current pros' page files
    try:
        import photos_lp
        riot = photos_lp.riot_index()
    except Exception as e:  # noqa: BLE001 - an extra: the app still finds the pictures in Riot's list later
        print(f"hub: Riot pictures skipped: {e}")
        riot = {"p": {}, "n": {}, "c": {}}
    rating_games = []  # (date, league, international, fid a, fid b, a won, tier, region) for the ratings
    rating_extra = []  # per rating game: (a on blue side, gold a - gold b, minutes, players a, players b) or None
    rating_tags = []   # per rating game: a lines-file game (Worlds / MSI / First Stand) to get its pre-game chance, or None
    lines_tagged = {}  # tag -> (lines file, game index in it)
    lines_pending = []  # (event slug, lines file): written once the ratings are known

    def fid_on(name, day):
        try:
            return ctx.team_of(name, day or "0000")
        except Exception:
            return None
    fr_code = {}      # fid -> its current code (from its newest name that has one)
    code_owner = {}   # code -> (newest date, fid) of the franchise that uses it now
    for fid, eras in ctx.fr_eras.items():
        for e in sorted(eras, key=lambda e: e["to"], reverse=True):
            c = (ctx.short_of(e["n"]) or str((lp_team.get(e["n"]) or {}).get("Short") or "").strip()).upper()
            if c:
                c = H2H_ALIASES.get(c, c)
                fr_code[fid] = c
                last = max(x["to"] for x in eras)
                if c not in code_owner or last > code_owner[c][0]:
                    code_owner[c] = (last, fid)
                break

    def h2h_code(name, date, code_then):
        try:
            fid = ctx.team_of(name, date[:10] if date else "0000")
        except Exception:
            fid = None
        c = fr_code.get(fid)
        if c and code_owner.get(c, (0, None))[1] == fid:
            return c
        if c and fid in ctx.fr_name:
            # a newer team uses this code now (TPA, GMB, UOL...): this one goes by its name, not dropped
            return ctx.fr_name[fid].upper()
        if fid is not None and fid not in fr_code and fid in ctx.fr_name:
            return ctx.fr_name[fid].upper()  # a team with no code at all goes by its name (as in Riot's own table)
        c = H2H_ALIASES.get((code_then or "").upper(), (code_then or "").upper())
        # the code at the time, unless an active franchise owns it now (then this old team is left out)
        return c if c and code_owner.get(c, (0, fid))[1] in (fid, None) else None
    dl_index = defaultdict(lambda: defaultdict(list))  # league slug -> year -> [[event slug, name, games]]
    CSV_HEAD = ["date", "league", "tournament", "stage", "patch", "series", "game", "url", "side", "position", "player", "team",
                "opponent", "champion", "pick_order", "result", "length_sec", "kills", "deaths", "assists", "team_kills",
                "team_deaths", "cs", "gold", "damage", "vision", "dragons", "opp_dragons", "barons", "opp_barons", "towers",
                "opp_towers", "heralds", "void_grubs", "ban1", "ban2", "ban3", "ban4", "ban5", "pick1", "pick2", "pick3",
                "pick4", "pick5"]
    POS = {"Top": "top", "Jungle": "jungle", "Mid": "mid", "Bot": "bot", "Support": "support"}
    t_games = defaultdict(list)        # fid -> every game: see teamgames/<slug>.json

    for op in ops:
        info = lp_tourn.get(op) or {}
        lg_ev = league_of(info)
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
        g_by_gid = {g["gid"]: g for lst in series.values() for g in lst if g["gid"]}
        for gid_, rows_ in list(prow.items()):
            g_ = g_by_gid.get(gid_)
            m_ = match_teams([r["team"] for r in rows_], g_["t1"], g_["t2"]) if g_ else {}
            fixed = []
            for r in rows_:
                team_ = m_.get(r["team"])
                if team_:
                    d_ = dict(r)
                    d_["team"] = team_
                    d_["page_key"] = ctx.names.page(r["page_key"], team_)
                    d_["champion"] = champ_name(r["champion"])
                    d_["keystone"] = rune_name(r["keystone"])
                    fixed.append(d_)
            if fixed:
                prow[gid_] = fixed
            else:
                # the scoreboard belongs to two other teams: a bad link in the catalog, so this game has no stats
                del prow[gid_]
                trow.pop(gid_, None)
                if g_:
                    g_["gid"] = None
                checks["hub: scoreboards of other teams left out"] += 1
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
        oe = timeline.load(con, mids, chunks)

        # Per-tournament aggregates
        tp = defaultdict(new_tp_row)
        # team stats in this tournament (games with a scoreboard): sums, divided by "g" in the app
        tts = defaultdict(new_tts_row)
        facts = new_facts()
        ev_mvp = Counter()
        regions = defaultdict(lambda: [0, 0])  # (region a, region b) sorted -> series won by a, by b
        tc = defaultdict(lambda: [0, 0, 0])  # champion -> picks, wins, bans
        tteam = defaultdict(lambda: {"g": 0, "w": 0, "sg": 0, "sw": 0, "name": None})
        stage_rows = defaultdict(list)
        n_stats_games = 0
        csv_rows = []
        # every game's scoreboard in one small file (lines/<event>.json) for the event's stats (most kills so far, a
        # player's line in a series, 0-5 champions, objectives, bans...), instead of one file per series: Worlds / MSI /
        # First Stand of every year, every other event from LINES_FROM on (written only if it has games, below)
        ev_lines = {"s": [], "g": [], "p": []}
        # the teams' logos for the Worlds page's pickers (big events only: their pages show them)
        ev_logos = big_event(en)
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
            fa_, fb_ = ctx.team_of(a, date[:10] or "0000"), ctx.team_of(b, date[:10] or "0000")

            def team_side(name, a=a, b=b, fa_=fa_, fb_=fb_, d_=date[:10] or "0000"):
                """1 = series team a, 2 = team b, 0 = neither (exact name, then spelling, then franchise)."""
                if not name:
                    return 0
                if name == a:
                    return 1
                if name == b:
                    return 2
                m_ = match_teams([name], a, b).get(name)
                if m_ in (a, b):
                    return 1 if m_ == a else 2
                f_ = ctx.team_of(name, d_)
                if f_ == fa_ and f_ != fb_:
                    return 1
                if f_ == fb_ and f_ != fa_:
                    return 2
                # a club's sister team (LoL Masters 2014: "SK Telecom T1 K" for "SK Telecom T1 (Club Masters)"):
                # the club's first word, when only one side has it
                first = lambda x: (re.sub(r"[^a-z0-9 ]", " ", x.lower()).split() or [""])[0]
                t_, ta_, tb_ = first(name), first(a), first(b)
                if len(t_) >= 2 and (t_ == ta_) != (t_ == tb_):
                    return 1 if t_ == ta_ else 2
                return 0

            def win_side(g):
                """The series side of a game's winner; when only the loser is known, the other side."""
                w_ = team_side(g["w"])
                if w_ or not g["w"]:
                    return w_
                other = g["t2"] if g["w"] == g["t1"] else g["t1"] if g["w"] == g["t2"] else None
                o_ = team_side(other) if other else 0
                return 3 - o_ if o_ else 0

            wa = sum(1 for g in glist if win_side(g) == 1)
            wb = sum(1 for g in glist if win_side(g) == 2)
            if not glist and s and s["sa"] is not None and s["sb"] is not None:
                wa, wb = s["sa"], s["sb"]  # forfeits and series with no game list
            awarded = False  # the league's result differs from the games played: a win given by forfeit
            if s and s["sa"] is not None and s["sb"] is not None and (s["sa"], s["sb"]) != (wa, wb) and glist and (
                    s.get("ff") or len(glist) < s["sa"] + s["sb"]):
                awarded = bool(s.get("ff"))
                wa, wb = s["sa"], s["sb"]  # a forfeit, or games missing from the catalog (Worlds Season 1 final: 2-1)
            bo = (s and s["bo"]) or (glist and glist[0]["bo"]) or max(1, len(glist))
            if max(wa, wb) > bo // 2 + 1:
                bo = 2 * max(wa, wb) - 1  # Leaguepedia's best-of is sometimes off (a 3-1 marked Bo3): the score decides
            played = bool(glist) and any(g["w"] for g in glist) or (wa + wb > 0)
            winner = 1 if wa > wb else 2 if wb > wa else 0
            tab = (s and s["tab"]) or next((g.get("tab") for g in glist if g.get("tab")), None)
            if not tab:
                rest = mid[len(op) + 1:] if mid.startswith(op + "_") else ""
                tab = rest.rsplit("_", 1)[0] if "_" in rest else ""
            if tab and tab.strip().lower() in ("scoreboards", "scoreboard", "overview"):
                tab = ""
            an, au, ac = team_ref(a, date)
            bn, bu, bc = team_ref(b, date)
            if date:
                first_date = min(first_date or date, date)
                last_date = max(last_date or date, date)

            # Series page (only when there is something to show beyond the two names)
            has_page = any(g["gid"] or g["vod"] or g.get("vgs") or g["w"] for g in glist)
            s_rating = None
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
                        gid_n[g["gid"]] = g["n"]
                games_out = []
                for g in glist:
                    blue_is_a = g["t1"] == a or (g["t1"] != b and (team_side(g["t1"]) == 1 or team_side(g["t2"]) == 2))
                    gw = win_side(g)
                    item = {"n": g["n"], "w": gw, "blue": "a" if blue_is_a else "b", "patch": fix_patch(g["patch"], g["date"]),
                            "date": g["date"], "st": {"full": "f", "results_only": "r"}.get(g["status"], "s")}
                    if g["vod"]:
                        item["vod"] = g["vod"]
                    for key in ("vpb", "vgs"):
                        if g.get(key) and g[key] != g["vod"]:
                            item[key] = g[key]
                    if g["ff"]:
                        item["ff"] = 1
                    if g["remake"]:
                        item["remake"] = 1
                    if g.get("mepi") is not None and gw and not g["remake"]:
                        item["r"] = round(float(g["mepi"]), 1)
                    mvp_pg = ctx.names.resolve(g.get("mvp"), [(r["page_key"], r["raw_name"]) for r in prow.get(g["gid"], [])]
                                               if g["gid"] else []) if g.get("mvp") else None
                    if mvp_pg:
                        item["mvp"] = {"n": ctx.pname(mvp_pg), "u": player_slug.get(mvp_pg)}
                        ev_mvp[mvp_pg] += 1
                        p_mvp[mvp_pg] += 1
                    if g["w"] and not g["remake"]:
                        facts["g"] += 1
                        facts["blue" if g["w"] == g["t1"] else "red"] += 1
                        for name, side_won in ((g["t1"], g["w"] == g["t1"]), (g["t2"], g["w"] == g["t2"])):
                            tr = team_ref(name, g["date"])
                            if tr[1]:
                                fid = ctx.team_of(name, g["date"][:10] if g["date"] else "0000")
                                sd4 = t_side[fid]
                                if name == g["t1"]:
                                    sd4[0] += 1
                                    sd4[1] += 1 if side_won else 0
                                else:
                                    sd4[2] += 1
                                    sd4[3] += 1 if side_won else 0
                    # the player comes from this game's scoreboard (one champion per game), so Leaguepedia's
                    # other spellings ("Scary Jerry" for ScaryJerry, an old name like "GotzY" for Aeon) still link
                    penta_by_champ = ({r["champion"]: r["page_key"] for r in prow.get(g["gid"], []) if r["champion"] and r["page_key"]}
                                      if g["gid"] and (mid, g["n"]) in pentas else {})
                    for page, ch, cnt in pentas.get((mid, g["n"]), []):
                        page = penta_by_champ.get(ch) or canon_page(page)
                        facts["pentas"].append({"n": ctx.pname(page), "u": player_slug.get(page), "c": ch, "g": gslug, "x": cnt, "gn": g["n"]})
                        p_pentas[page].append((g["date"][:10], ch, gslug, en, cnt, g["n"]))
                        all_pentas.append((g["date"][:10], page, ch, gslug, en, eslug, an, bn, cnt,
                                           bool((ctx.games.get(g["gid"]) or {}).get("major")) if g["gid"] else False, g["n"]))
                    gid = g["gid"]
                    base = ctx.games.get(gid) if gid else None
                    if base:
                        item["min"] = rmin(base["min"]) if base["min"] else None
                    t = trow.get(gid) if gid else None
                    sb = sbg.get((mid, g["n"]))
                    dr = drafts.get((mid, g["n"]))
                    sides = {}
                    draft_order = {}  # side -> its picks in pick order (only the draft table has it; the team table is in role order)
                    t_pre = dict(zip(("blue", "red"), blue_red(t["team1"], t["team2"], g["t1"], g["t2"]))) if t is not None else {}
                    d_pre = dict(zip(("blue", "red"), blue_red(dr["team1"], dr["team2"], g["t1"], g["t2"]))) if dr is not None else {}
                    s_pre = dict(zip(("blue", "red"), blue_red(sb["Team1"], sb["Team2"], g["t1"], g["t2"]))) if sb is not None else {}
                    # "0-0" in the team table is a score that was never filled in
                    t_kills_ok = t is not None and (t["team1_kills"] or 0) + (t["team2_kills"] or 0) > 0
                    for side in ("blue", "red"):
                        sd = {}
                        if t is not None:
                            pre = t_pre[side]
                            for f, key in (("kills", "k"), ("gold", "gold"), ("towers", "towers"), ("dragons", "drag"),
                                           ("barons", "barons"), ("heralds", "heralds"), ("inhibitors", "inhib")):
                                v = t[f"{pre}_{f}"]
                                if v is not None and (f != "kills" or t_kills_ok):
                                    sd[key] = v
                            sd["bans"] = champs(t[f"{pre}_bans"])
                            sd["picks"] = champs(t[f"{pre}_picks"])
                        if sb is not None:
                            p2 = "Team1" if s_pre[side] == "team1" else "Team2"
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
                            # The draft's Team1 is usually blue; matched by name (never both sides to one team)
                            dpre = d_pre[side]
                            bans, picks = champs(dr[f"{dpre}_bans"]), champs(dr[f"{dpre}_picks"])
                            if bans:
                                sd["bans"] = bans
                            if picks:
                                sd["picks"] = picks
                                draft_order[side] = picks
                        sides[side] = sd
                    g_rows = prow.get(gid, []) if gid else []
                    for side, name in (("blue", g["t1"]), ("red", g["t2"])):
                        mine = [r for r in g_rows if r["team"] == name]
                        if len(mine) == 5:
                            sd = sides.setdefault(side, {})
                            if sd.get("k") is None and all(r["kills"] is not None for r in mine):
                                sd["k"] = sum(r["kills"] for r in mine)
                            if sd.get("gold") is None and all(r["gold"] is not None for r in mine):
                                sd["gold"] = sum(r["gold"] for r in mine)
                    # Oracle's Elixir's numbers for this game (leads at 15, firsts, plates...), when it has the game
                    oe_g = timeline.pick(oe.get((mid, g["n"])), {r["champion"] for r in g_rows if r["champion"]})
                    oe_side = {}
                    oe_team_side = {}  # team -> its side in Oracle's Elixir's rows (tells blind-pick mirror champions apart)
                    if oe_g:
                        for side, name in (("blue", g["t1"]), ("red", g["t2"])):
                            r_oe = timeline.team_row(oe_g, name, [r["champion"] for r in g_rows if r["team"] == name], side)
                            if r_oe is not None:
                                oe_team_side[name] = r_oe["side"]
                            tl_ = timeline.team_tl(r_oe, g["date"]) if r_oe is not None else None
                            if not tl_:
                                continue
                            oe_side[side] = tl_
                            sd = sides.setdefault(side, {})
                            # gold leads at 10/15/20 and the XP lead at 15 (the match page's lead chart)
                            for key, v in (("g15", tl_[1]), ("g10", tl_[0]), ("g20", tl_[2]), ("x15", tl_[4]), ("fb", tl_[5]),
                                           ("ft", tl_[6]), ("pl", tl_[12])):
                                if v is not None:
                                    sd[key] = v
                            if "grubs" not in sd and tl_[14]:
                                sd["grubs"] = tl_[14]
                            z = tts[name]
                            if tl_[1] is not None:
                                z["tn"] += 1
                                z["g15"] += tl_[1]
                            if tl_[5] is not None and tl_[6] is not None:
                                z["fbn"] += 1
                                z["fb"] += tl_[5]
                                z["ft"] += tl_[6]
                            if tl_[12] is not None and tl_[13] is not None:
                                z["pln"] += 1
                                z["pl"] += tl_[12]
                                z["opl"] += tl_[13]
                    # each player's Oracle's Elixir row, and their gold lead over the lane opponent at 15 (team logs,
                    # game finder), by (team, champion)
                    oe_row = {}
                    gd15_of = {}
                    if oe_g:
                        for r in g_rows:
                            r_ = timeline.player_row(oe_g, r["champion"], oe_team_side.get(r["team"]))
                            if r_ is not None:
                                oe_row[(r["team"], r["champion"])] = r_
                                if r_["golddiffat15"] is not None:
                                    gd15_of[(r["team"], r["champion"])] = timeline.ival(r_["golddiffat15"])
                    if any(sides.values()):
                        item["t"] = sides
                    if base and item.get("min") is None and t is not None:
                        m = parse_len(t["gamelength"])
                        if m:
                            item["min"] = rmin(m)
                    mins_g = item.get("min") or 0
                    k_blue, k_red = (sides.get("blue") or {}).get("k"), (sides.get("red") or {}).get("k")
                    if mins_g and k_blue is not None and k_red is not None:
                        facts["mg"] += 1
                        facts["min"] += mins_g
                        tk_all = k_blue + k_red
                        facts["kills"] += tk_all
                        facts["kg"] += 1
                        ref = {"g": gslug, "a": an, "b": bn, "v": None, "n": g["n"]}
                        if mins_g >= 14 and (facts["short"] is None or mins_g < facts["short"]["v"]):
                            facts["short"] = {**ref, "v": mins_g}
                        if facts["long"] is None or mins_g > facts["long"]["v"]:
                            facts["long"] = {**ref, "v": mins_g}
                        if facts["bloody"] is None or tk_all > facts["bloody"]["v"]:
                            facts["bloody"] = {**ref, "v": tk_all}
                    for sd in sides.values():
                        for dk, n_dk in (sd.get("drakes") or {}).items():
                            facts["drakes"][dk] += n_dk
                        if sd.get("elders"):
                            facts["drakes"]["elder"] += sd["elders"]
                    if any((sd or {}).get("bans") for sd in sides.values()):
                        # bans against each team (what the other side banned)
                        for side, name, other in (("blue", g["t1"], "red"), ("red", g["t2"], "blue")):
                            if team_ref(name, g["date"])[1]:
                                fid = ctx.team_of(name, g["date"][:10] if g["date"] else "0000")
                                for ch in sides.get(other, {}).get("bans", []):
                                    t_bans_vs[fid][ch] += 1
                    if (sides.get("blue") or {}).get("gold") is not None and (sides.get("red") or {}).get("gold") is not None:
                        g["_gold"] = (sides["blue"]["gold"], sides["red"]["gold"])
                        for side, name, other in (("blue", g["t1"], "red"), ("red", g["t2"], "blue")):
                            sd, od = sides.get(side, {}), sides.get(other, {})
                            z = tts[name]
                            z["blue"] += 1 if side == "blue" else 0
                            z["gold"] += sd.get("gold") or 0
                            z["tl"] += od.get("towers") or 0
                            z["odrag"] += od.get("drag") or 0
                            z["obar"] += od.get("barons") or 0
                            z["oher"] += od.get("heralds") or 0
                            z["g"] += 1
                            z["w"] += 1 if g["w"] == name else 0
                            z["min"] += item.get("min") or 0
                            z["k"] += sd.get("k") or 0
                            z["d"] += od.get("k") or 0
                            z["gd"] += (sd.get("gold") or 0) - (od.get("gold") or 0)
                            z["drag"] += sd.get("drag") or 0
                            z["bar"] += sd.get("barons") or 0
                            z["tow"] += sd.get("towers") or 0
                            z["her"] += sd.get("heralds") or 0
                            z["grub"] += sd.get("grubs") or 0
                    if g["t1"] and g["t2"] and g["w"]:
                        pick_role = {(r["team"], r["champion"]): ROLE_ORDER.get(r["role"] or "", -1)
                                     for r in (prow.get(gid, []) if gid else []) if r["champion"]}
                        for side, name, other_name in (("blue", g["t1"], g["t2"]), ("red", g["t2"], g["t1"])):
                            if not team_ref(name, g["date"])[1]:
                                continue
                            sd, od = sides.get(side, {}), sides.get("red" if side == "blue" else "blue", {})
                            t_games[ctx.team_of(name, g["date"][:10] if g["date"] else "0000")].append([
                                g["date"][:10], gslug, eslug, en, other_name, team_ref(other_name, g["date"])[1], side[0],
                                1 if g["w"] == name else 0, item.get("min"), sd.get("k"), od.get("k"), sd.get("gold"), od.get("gold"),
                                sd.get("drag"), od.get("drag"), sd.get("barons"), od.get("barons"), sd.get("towers"), od.get("towers"),
                                sd.get("bans") or [], sd.get("picks") or [], od.get("bans") or [],
                                [pick_role.get((name, ch), -1) for ch in (sd.get("picks") or [])], oe_side.get(side),
                                [gd15_of.get((name, ch)) for ch in (sd.get("picks") or [])] if gd15_of else None])
                    rows = prow.get(gid, []) if gid else []
                    # one ban per champion per game, never a champion that was picked (bans written twice, blind picks)
                    game_bans = {ch for sd in sides.values() for ch in sd.get("bans", [])} - {
                        ch for sd in sides.values() for ch in sd.get("picks", [])} - {r["champion"] for r in rows if r["champion"]}
                    if rows and g["w"] and WEEK_FROM <= (g["date"] or "")[:10] <= WEEK_TO and (info.get("TournamentLevel") or "") == "Primary":
                        week_champs["games"] += 1
                        for r in rows:
                            if r["champion"]:
                                wc_ = week_champs["c"][r["champion"]]
                                wc_[0] += 1
                                wc_[2] += 1 if r["team"] == g["w"] else 0
                        for ch in game_bans:
                            week_champs["c"][ch][1] += 1
                    if rows:
                        n_stats_games += 1
                        plist = []
                        opp_of = {g["t1"]: g["t2"], g["t2"]: g["t1"]}
                        team_kills, team_dmg, team_gold, team_vis = Counter(), Counter(), Counter(), Counter()
                        lane = defaultdict(dict)  # role -> team -> champion
                        for r in rows:
                            team_kills[r["team"]] += r["kills"] or 0
                            team_dmg[r["team"]] += r["damage"] or 0
                            team_gold[r["team"]] += r["gold"] or 0
                            team_vis[r["team"]] += r["vision"] or 0
                            if r["role"] and r["champion"]:
                                lane[r["role"]][r["team"]] = r["champion"]
                        gpatch = fix_patch(g["patch"], g["date"])
                        if gpatch:
                            ps = patch_stats[gpatch]
                            ps["g"] += 1
                            ps["from"] = min(ps["from"], g["date"][:10])
                            ps["to"] = max(ps["to"], g["date"][:10])
                            picked_g = {r["champion"] for r in rows if r["champion"]} | {
                                ch for sd in sides.values() for ch in sd.get("picks", [])}
                            for ch in game_bans - picked_g:
                                ps["b"][ch] += 1
                            for ch in picked_g | game_bans:
                                ps["pres"][ch] += 1
                        for name in team_kills:
                            z = tts[name]
                            z["pg"] += 1
                            z["pmin"] += item.get("min") or 0
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
                            ptl = timeline.player_tl(oe_row[(r["team"], r["champion"])]) if (r["team"], r["champion"]) in oe_row else None
                            if ptl:
                                row.update({"g15": ptl[3], "c15": ptl[4], "x15": ptl[5],
                                            "g10": ptl[0], "x10": ptl[2], "g20": ptl[6], "x20": ptl[8]})
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
                                    if r["damage"]:
                                        x["dmin"] += mins
                                x["team"][team_name] += 1
                                x["roles"][r["role"] or "?"] += 1
                                x["tk"] += team_kills[team_name]
                                if r["damage"] is not None:
                                    x["sdmg"] += r["damage"]
                                    x["tdmg"] += team_dmg[team_name]
                                if r["gold"] is not None:
                                    x["sgold"] += r["gold"]
                                    x["tgold"] += team_gold[team_name]
                                if r["vision"] is not None:
                                    x["svis"] += r["vision"]
                                    x["tvis"] += team_vis[team_name]
                                if mins and r["cs"] is not None:
                                    cpm = r["cs"] / mins
                                    if mins >= 14 and (facts["farm"] is None or cpm > facts["farm"]["v"]):
                                        facts["farm"] = {"v": round(cpm, 2), "n": ctx.pname(page), "u": player_slug.get(page),
                                                         "c": r["champion"], "cs": r["cs"], "min": rmin(mins), "g": gslug, "gn": g["n"]}
                                if r["vision"] is not None and mins:
                                    x["vis"] += r["vision"]
                                    x["vg"] += mins
                                if r["champion"]:
                                    x["champs"][r["champion"]] += 1
                                if ptl and ptl[3] is not None:
                                    x["tn"] += 1
                                    x["g15"] += ptl[3]
                                    x["c15"] += ptl[4] or 0
                                    x["x15"] += ptl[5] or 0
                                if ptl and ptl[9] is not None:
                                    x["fbn"] += 1
                                    x["fbp"] += 1 if ptl[9] in (1, 2) else 0
                                    x["fbv"] += 1 if ptl[9] == 3 else 0
                                opp = opp_of.get(team_name, "")
                                p_games[page].append((g["date"][:10], gslug, r["champion"] or "", k, d, aa, won, team_name, opp, en,
                                                      r["role"] or "", eslug, r["cs"], r["gold"], r["damage"], r["vision"],
                                                      rmin(mins) if mins else None, team_kills[team_name],
                                                      team_dmg[team_name] if r["damage"] is not None else None,
                                                      team_gold[team_name] if r["gold"] is not None else None,
                                                      team_vis[team_name] if r["vision"] is not None else None, ptl, g["n"],
                                                      round(float(g["mepi"]), 1) if g.get("mepi") is not None else None))
                                latest_heap(p_recent[page], (g["date"], gslug, r["champion"] or "", k, d, aa, won, opp, en, team_name, g["n"],
                                                             round(float(g["mepi"]), 1) if g.get("mepi") is not None else None), 20)
                                if ctx.consistent.get(gid):
                                    for key, val in (("kills", k), ("assists", aa), ("dmg", r["damage"] or 0), ("cs", r["cs"] or 0)):
                                        cur = p_best[page].get(key)
                                        if cur is None or val > cur[0]:
                                            p_best[page][key] = (val, g["date"][:10], r["champion"] or "", opp, en, gslug, g["n"])
                            tz = tts[team_name]
                            tz["cs"] += r["cs"] or 0
                            tz["dmg"] += r["damage"] or 0
                            if r["champion"]:
                                c = champ[r["champion"]]
                                y = (g["date"] or "0000")[:4]
                                is_blue = r["team"] == g["t1"]
                                c["side"][0 if is_blue else 2] += 1
                                c["side"][1 if is_blue else 3] += won
                                order_c = draft_order.get("blue" if is_blue else "red") or []
                                if r["champion"] in order_c and order_c.index(r["champion"]) < 5:
                                    ix_c = order_c.index(r["champion"])
                                    slot_c = ("B1", "B2-3", "B2-3", "B4-5", "B4-5")[ix_c] if is_blue else ("R1-2", "R1-2", "R3", "R4", "R5")[ix_c]
                                    c["slots"][slot_c][0] += 1
                                    c["slots"][slot_c][1] += won
                                if gpatch:
                                    patch_stats[gpatch]["p"][r["champion"]] += 1
                                    patch_stats[gpatch]["w"][r["champion"]] += won
                                if g["date"][:10] >= build_cut:
                                    c["bg"] += 1
                                    for it in set(jlist(r["items"])):
                                        c["items"][it] += 1
                                        c["items_w"][it] += won
                                    if r["keystone"]:
                                        c["keys"][r["keystone"]] += 1
                                        c["keys_w"][r["keystone"]] += won
                                    sp = " + ".join(sorted(map(spell_name, jlist(r["spells"])), key=lambda x: (x != "Flash", x)))  # Flash first
                                    if sp:
                                        c["spells"][sp] += 1
                                        c["spells_w"][sp] += won
                                role = r["role"]
                                recent_g = g["date"][:10] >= build_cut
                                lane_keys = []
                                if role:
                                    lane_keys += [("lane", role)] + ([("lane12", role)] if recent_g else [])
                                if role in lane and len(lane[role]) == 2:
                                    other_team = opp_of.get(r["team"])
                                    oc = lane[role].get(other_team)
                                    if oc:
                                        lane_keys += [("mu", (role, oc))] + ([("mu12", (role, oc))] if recent_g else [])
                                for kind, key in lane_keys:
                                    m = c[kind][key]
                                    m[0] += 1
                                    m[1] += won
                                    if ptl and ptl[3] is not None:
                                        m[2] += 1
                                        m[3] += ptl[3]
                                        m[4] += ptl[4] or 0
                                        m[5] += ptl[5] or 0
                                        m[6] += 1 if ptl[3] > 0 else 0
                                partner_role = {"Bot": "Support", "Support": "Bot"}.get(role or "")
                                if partner_role and lane.get(partner_role, {}).get(r["team"]):
                                    d2 = c["duo"][lane[partner_role][r["team"]]]
                                    d2[0] += 1
                                    d2[1] += won
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
                                latest_heap(c["recent"], (g["date"], gslug, page or "", r["team"], opp_of.get(r["team"], ""), k, d, aa, won, en,
                                                          tuple(jlist(r["items"])), r["keystone"] or "", r["secondary_tree"] or "",
                                                          tuple(jlist(r["spells"])), r["role"] or "", g["n"]), 20)
                                tc[r["champion"]][0] += 1
                                tc[r["champion"]][1] += won
                        item["p"] = plist
                    # Champion game log per league and year (the Champions page filters)
                    lu_c = league_slug.get(lg_ev)
                    if lu_c and g["t1"] and g["t2"] and g["w"]:
                        rows_by = defaultdict(dict)  # team -> champion -> scoreboard row
                        for r in rows:
                            if r["champion"]:
                                rows_by[r["team"]][r["champion"]] = r
                        picks_out = []
                        for side, tname_c in (("blue", g["t1"]), ("red", g["t2"])):
                            team_rows = rows_by.get(tname_c, {})
                            order = (sides.get(side) or {}).get("picks") or [
                                r["champion"] for r in sorted(team_rows.values(), key=lambda r: ROLE_ORDER.get(r["role"] or "", 9))]
                            lst = []
                            for ch in order:
                                r = team_rows.get(ch)
                                lst.append([ch, -1] if r is None else [ch, ROLE_ORDER.get(r["role"] or "", -1), r["kills"], r["deaths"],
                                                                       r["assists"], r["cs"], r["gold"], r["damage"],
                                                                       ctx.pname(r["page_key"]) if r["page_key"] else r["raw_name"],
                                                                       player_slug.get(r["page_key"]),
                                                                       *([gd15_of[(tname_c, ch)]] if (tname_c, ch) in gd15_of else [])])
                            picks_out.append(lst)
                        if picks_out[0] and picks_out[1]:
                            # lane matchups: the two champions with the same role, with the blue pick's gold lead at 15
                            for rr in range(5):
                                pa_ = next((x for x in picks_out[0] if x[1] == rr), None)
                                pb_ = next((x for x in picks_out[1] if x[1] == rr), None)
                                if not pa_ or not pb_ or pa_[0] == pb_[0]:
                                    continue
                                blue_won = 1 if g["w"] == g["t1"] else 0
                                gd_a = pa_[10] if len(pa_) > 10 and pa_[10] is not None else None
                                for ca_, cb_, won_, gd_ in ((pa_[0], pb_[0], blue_won, gd_a), (pb_[0], pa_[0], 1 - blue_won, -gd_a if gd_a is not None else None)):
                                    mu = lane_vs[ca_][(cb_, rr)]
                                    mu[0] += 1
                                    mu[1] += won_
                                    if gd_ is not None:
                                        mu[2] += gd_
                                        mu[3] += 1
                        if picks_out[0] or picks_out[1]:
                            cg = champ_games[(lu_c, (g["date"] or "0000")[:4])]
                            ei = cg["ev"].setdefault(eslug, (len(cg["ev"]), en))[0]
                            cg["g"].append([g["date"][:10], fix_patch(g["patch"], g["date"]) or "", ei, 1 if g["w"] == g["t1"] else 0,
                                            item.get("min"), picks_out[0], picks_out[1],
                                            (sides.get("blue") or {}).get("bans") or [], (sides.get("red") or {}).get("bans") or [],
                                            1 if (sides.get("blue") or {}).get("picks") else 0,
                                            # for the game finder: teams, their pages, the series page and game number
                                            g["t1"], g["t2"], team_ref(g["t1"], g["date"])[1], team_ref(g["t2"], g["date"])[1], gslug, g["n"]])
                    # Download rows: one per player and one per team
                    if g["t1"] and g["t2"] and (g["w"] or rows):
                        g_len = round((item.get("min") or 0) * 60) or ""
                        for side, tname_c, oname_c in (("blue", g["t1"], g["t2"]), ("red", g["t2"], g["t1"])):
                            sd, od = sides.get(side) or {}, sides.get("red" if side == "blue" else "blue") or {}
                            result = 1 if g["w"] == tname_c else 0 if g["w"] else ""
                            common = [g["date"][:10], lg_ev or "", en, tab or "", item.get("patch") or "", gslug, g["n"],
                                      f"https://riftwise.gg/match/{gslug}", side.capitalize()]
                            team_rows = sorted((r for r in rows if r["team"] == tname_c), key=lambda r: ROLE_ORDER.get(r["role"] or "", 9))
                            order = sd.get("picks") or []
                            for r in team_rows:
                                csv_rows.append(common + [
                                    POS.get(r["role"] or "", r["role"] or ""), ctx.pname(r["page_key"]) if r["page_key"] else r["raw_name"] or "",
                                    tname_c, oname_c, r["champion"] or "",
                                    order.index(r["champion"]) + 1 if r["champion"] in order else "", result, g_len,
                                    r["kills"], r["deaths"], r["assists"], sd.get("k", ""), od.get("k", ""), r["cs"], r["gold"],
                                    r["damage"], r["vision"]] + [""] * 18)
                            sums = lambda key: sum((r[key] or 0) for r in team_rows) if team_rows else ""
                            bans5 = (list(sd.get("bans") or []) + [""] * 5)[:5]
                            picks5 = (list(order) + [""] * 5)[:5]
                            csv_rows.append(common + [
                                "team", "", tname_c, oname_c, "", "", result, g_len, sd.get("k", ""), od.get("k", ""), sums("assists"),
                                sd.get("k", ""), od.get("k", ""), sums("cs"), sd.get("gold", "") if sd.get("gold") is not None else sums("gold"),
                                sums("damage"), sums("vision"), sd.get("drag", ""), od.get("drag", ""), sd.get("barons", ""),
                                od.get("barons", ""), sd.get("towers", ""), od.get("towers", ""), sd.get("heralds", ""),
                                sd.get("grubs", "")] + bans5 + picks5)
                    # Bans count for champion and tournament pages
                    for ch in game_bans:
                        tc[ch][2] += 1
                        champ[ch]["b"] += 1
                        champ[ch]["years"][(g["date"] or "0000")[:4]][2] += 1
                    games_out.append(item)
                stage_name = tab or ""
                rated = [x for x in games_out if x.get("r") is not None]
                s_best = max(rated, key=lambda x: (x["r"], x["n"])) if rated else None
                if s_best and (facts["best"] is None or s_best["r"] > facts["best"]["v"]):
                    facts["best"] = {"g": gslug, "a": an, "b": bn, "v": s_best["r"], "n": s_best["n"]}
                played_n = sum(1 for x in games_out if x.get("w") and not x.get("remake"))
                s_rating = None
                if s_best:
                    rs = sorted((x["r"] for x in rated), reverse=True)
                    if len(rs) >= 2:
                        # its best game counts most, then its best three, then every game; a 3-2 gets a little more
                        top3 = sum(rs[:3]) / len(rs[:3])
                        adj = 1.5 if sorted((wa, wb)) == [2, 3] else (-2.0 if wa == 0 or wb == 0 else 0.0)
                        s_rating = round(min(100.0, 0.55 * rs[0] + 0.30 * top3 + 0.15 * (sum(rs) / len(rs)) + adj), 1)
                    else:
                        s_rating = rs[0]
                out.json(f"game/{gslug}.json", {
                    "e": eslug, "en": en, "stage": stage_name, "date": date, "bo": bo,
                    "a": {"n": an, "u": au, "c": ac}, "b": {"n": bn, "u": bu, "c": bc},
                    "sa": wa, "sb": wb, "w": winner, "games": games_out, **({"r": s_rating} if s_rating is not None else {}),
                    **({"ff": 1} if awarded else {}),
                })
                if ev_lines is not None and an and bn:
                    si = len(ev_lines["s"])
                    ev_lines["s"].append([gslug, stage_name, date, an, au, ac, bn, bu, bc, wa, wb, bo])
                    for x in games_out:
                        if x.get("remake") or not x.get("p"):
                            continue
                        a_blue = x.get("blue") == "a"
                        sides_ = x.get("t") or {}
                        ta, tb_ = (sides_.get("blue") or {}, sides_.get("red") or {}) if a_blue else (sides_.get("red") or {}, sides_.get("blue") or {})
                        gi = len(ev_lines["g"])
                        # series, game, a on blue, winner side (1 a, 2 b, 0 not known), minutes, towers / kills / gold a and b,
                        # then a's pre-game chance in % (filled in after the ratings) and a's gold lead at 15 (Oracle's Elixir)
                        # (2026-10-25 on) then objectives a / b: dragons, barons, heralds, void grubs, elder dragons, turret
                        # plates, inhibitors; first blood and first tower (1 a, 2 b, 0 not known); each side's bans
                        g15_a = ta.get("g15")

                        def first_(key):
                            return 1 if ta.get(key) == 1 else 2 if tb_.get(key) == 1 else 0

                        ev_lines["g"].append([si, x["n"], 1 if a_blue else 0, x.get("w") or 0, x.get("min"),
                                              ta.get("towers"), tb_.get("towers"), ta.get("k"), tb_.get("k"), ta.get("gold"), tb_.get("gold"),
                                              None, g15_a,
                                              ta.get("drag"), tb_.get("drag"), ta.get("barons"), tb_.get("barons"),
                                              ta.get("heralds"), tb_.get("heralds"), ta.get("grubs"), tb_.get("grubs"),
                                              (ta.get("drakes") or {}).get("elder"), (tb_.get("drakes") or {}).get("elder"),
                                              ta.get("pl"), tb_.get("pl"), ta.get("inhib"), tb_.get("inhib"),
                                              first_("fb"), first_("ft"), ta.get("bans") or [], tb_.get("bans") or []])
                        ev_lines.setdefault("_gi", {})[(gslug, x["n"])] = gi
                        for p_ in x["p"]:
                            side_b = 0 if (p_.get("s") == 1) == a_blue else 1
                            # game, side (0 a, 1 b), player, page, role, champion, kills, deaths, assists, cs, damage, then
                            # (2026-10-25 on) vision score and gold
                            ev_lines["p"].append([gi, side_b, p_.get("n"), p_.get("u"), p_.get("r"), p_.get("c"), p_.get("k"), p_.get("d"),
                                                  p_.get("a"), p_.get("cs"), p_.get("dm"), p_.get("v"), p_.get("gd")])
                lu_b = league_slug.get(lg_ev)
                region_b = (info or {}).get("Region") if not lu_b else None  # Regional Finals: the region's league (below)
                g_by_n = {g["n"]: g for g in glist}
                for x in rated:
                    sd_ = x.get("t") or {}
                    ka, kb = ((sd_.get("blue") or {}).get("k"), (sd_.get("red") or {}).get("k"))
                    if x["blue"] == "b":
                        ka, kb = kb, ka
                    g_ = g_by_n.get(x["n"]) or {}
                    if ka is None or kb is None:
                        # no scoreboard: the kills the catalog's match row has
                        mk = g_.get("m_k") or {}
                        ka_, kb_ = None, None
                        for nm, kk in mk.items():
                            sd_n = team_side(nm)
                            if sd_n == 1:
                                ka_ = kk
                            elif sd_n == 2:
                                kb_ = kk
                        if ka_ is not None and kb_ is not None:
                            ka, kb = ka_, kb_
                    best_games.append([x["r"], gslug, x["n"], (x["date"] or date)[:10], en, eslug, stage_name, an, au, bn, bu, x["w"],
                                       x.get("min") or (rmin(g_["m_min"]) if g_.get("m_min") else None), ka, kb,
                                       1 if x.get("vod") or x.get("vgs") else 0, lu_b, region_b])
                if s_best and played_n >= 2:
                    # each played game's rating in order (null when a game has none), for the G1 89 · G2 91 strip
                    per_game = [round(x["r"]) if x.get("r") is not None else None
                                for x in sorted(games_out, key=lambda x: x["n"]) if x.get("w") and not x.get("remake")]
                    best_series.append([s_rating, gslug, date[:10], en, eslug, stage_name, an, au, bn, bu, wa, wb, s_best["n"],
                                        played_n, lu_b, per_game, region_b])
                if played and gslug and WEEK_FROM <= date[:10] <= WEEK_TO and (info.get("TournamentLevel") or "") == "Primary":
                    week_series.append([date[:10], en, eslug, stage_name, an, au, bn, bu, wa, wb, gslug, 1 if INTL_RE.search(en or "") else 0])
                # (not a promotion series or a qualifier by name: "LCS 2027 Promotion" is filed under the LCS; Leaguepedia's
                # IsQualifier flag would also drop the Worlds Play-In)
                if lg_ev and (info.get("TournamentLevel") or "") == "Primary" and not PROMO_RE.search(en or ""):
                    event_league[eslug] = lg_ev
                n_series_pages += 1
                gdate = date[:10]
                title = f"{an} vs {bn} – {en}{' ' + stage_name if stage_name else ''}"
                seo["game"].append((gslug, f"{title} | {SITE}",
                                    f"{an} vs {bn} at {en}{', ' + stage_name if stage_name else ''} ({gdate}): drafts, builds, runes and stats for every game.",
                                    1 if any(g.get("p") for g in games_out) and (big_event(en) or (gdate or "") >= SEO_MATCH_FROM) else 0))

            # Team rows for this tournament and the team pages' recent series
            for name, u, mine, theirs, opp, opp_u in ((an, au, wa, wb, bn, bu), (bn, bu, wb, wa, an, au)):
                x = tteam[(name, u)]
                x["g"] += mine + theirs
                x["w"] += mine
                if played:
                    x["sg"] += 1
                    x["sw"] += 1 if mine > theirs else 0
                if u and played:
                    fid = ctx.team_of(name, date[:10] if date else "0000")
                    latest_heap(t_recent[fid], (date, gslug or "", opp, mine, theirs, en, eslug, s_rating), 15)
                    t_series[u].append((date[:10], opp, opp_u, mine, theirs, en, eslug, gslug, tab or "", name, s_rating))
            if played and (wa or wb):
                ca, cb = h2h_code(a, date, ac), h2h_code(b, date, bc)
                if ca and cb and ca != cb and "TBD" not in (ca, cb):
                    for c_, n_ in ((ca, a), (cb, b)):
                        if date[:10] > h2h_names[c_].get(n_, ""):
                            h2h_names[c_][n_] = date[:10]
                    ga, gb = wa, wb
                    if ca > cb:
                        ca, cb, ga, gb = cb, ca, gb, ga
                    h2h_pairs[(ca, cb)][0] += ga
                    h2h_pairs[(ca, cb)][1] += gb
                    h2h_series[(ca, cb)].append((date[:10], en, ga, gb, 1 if big_event(en) else 0))
                    newest_g = max((g["date"] for g in glist if g["w"]), default=date)
                    if newest_g > h2h_newest:
                        h2h_newest = newest_g
            if played and not (s and s.get("ff")) and (info.get("TournamentLevel") or "") not in ("Showmatch", "Show Match"):
                # national teams (Asian Games, KeSPA Cup guests) never get a home league
                intl_r = 1 if (info.get("Region") == "International" or INTL_RE.search(en or "")
                               or "national team" in f"{a} {b}".lower()) else 0
                lg_r = info.get("League")
                tier_r = 1 if info.get("TournamentLevel") == "Primary" else 2
                reg_r = info.get("Region")
                if any(g["w"] in (a, b) for g in glist):
                    for g in glist:
                        if g["w"] in (a, b):
                            gd = (g["date"] or date)[:10]
                            tag_r = None
                            if ev_lines is not None and (gslug, g.get("n")) in ev_lines.get("_gi", {}):
                                tag_r = len(rating_games)
                                lines_tagged[tag_r] = (ev_lines, ev_lines["_gi"][(gslug, g.get("n"))])
                            if gslug and WEEK_FROM <= gd <= WEEK_TO and tier_r == 1 and gslug not in week_seen:
                                week_seen.add(gslug)
                                tag_r = len(rating_games)
                                week_tagged[tag_r] = gslug
                            rating_tags.append(tag_r)
                            rating_games.append((gd, lg_r, intl_r, fid_on(a, gd), fid_on(b, gd), 1 if g["w"] == a else 0, tier_r, reg_r))
                            gid_r = g["gid"]
                            blue_r = (1 if g["t1"] == a else 0) if g["t1"] in (a, b) else None
                            t_r = trow.get(gid_r) if gid_r else None
                            gold_r = None
                            if blue_r is not None and g.get("_gold") and all(g["_gold"]):
                                gold_r = (g["_gold"][0] - g["_gold"][1]) * (1 if blue_r else -1)
                            base_r = ctx.games.get(gid_r) if gid_r else None
                            side_p = {g["t1"]: [], g["t2"]: []}
                            for r in (prow.get(gid_r, []) if gid_r else []):
                                if r["page_key"] and r["team"] in side_p:
                                    side_p[r["team"]].append(canon_page(r["page_key"]))
                            rating_extra.append((blue_r, gold_r, (base_r or {}).get("min"), side_p.get(a) or [], side_p.get(b) or []))
                elif wa + wb and date:
                    fa_r, fb_r = fid_on(a, date[:10]), fid_on(b, date[:10])
                    rating_games += ([(date[:10], lg_r, intl_r, fa_r, fb_r, 1, tier_r, reg_r)] * wa
                                     + [(date[:10], lg_r, intl_r, fa_r, fb_r, 0, tier_r, reg_r)] * wb)
                    rating_extra += [None] * (wa + wb)
                    rating_tags += [None] * (wa + wb)
            if played and winner:
                ra, rb = roster_region.get((op, a)), roster_region.get((op, b))
                if ra and rb and ra != rb:
                    key2 = tuple(sorted((ra, rb)))
                    regions[key2][0 if (ra == key2[0]) == (winner == 1) else 1] += 1

            stage_rows[tab or ""].append({
                "g": gslug, "a": an, "au": au, "ac": ac, "b": bn, "bu": bu, "bc": bc,
                "sa": wa if played else None, "sb": wb if played else None, "bo": bo, "date": date, "w": winner,
                **({"r": s_rating} if s_rating is not None and played else {}),
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

        def tiebreak(r):
            # teams sharing a place (Leaguepedia lists them A to Z): better game difference, then game win rate, first
            gw, gl = num(r["WinGames"]), num(r["LossGames"])
            games_known = gw is not None and gl is not None and gw + gl > 0
            return (num(r["Place"]) or 9999, -(gw - gl) if games_known else 0, -(gw / (gw + gl)) if games_known else 0)

        for i, rows in enumerate(tables):
            rows = sorted(rows, key=tiebreak)
            name = "Standings" if len(tables) == 1 else f"Group {chr(65 + i)}" if i < 26 else f"Group {i + 1}"
            stand_out.append({"name": name, "rows": [
                {"t": r["Team"], "u": team_ref(r["Team"], last_date or "")[1], "pl": num(r["Place"]),
                 "sw": num(r["WinSeries"]), "sl": num(r["LossSeries"]), "st": num(r["TieSeries"]) or None,
                 "gw": num(r["WinGames"]), "gl": num(r["LossGames"])} for r in rows]})

        res_rows, res_from = results.get(op, []), "this"
        if not res_rows and base_of(op) and results.get(base_of(op)):
            res_rows, res_from = results[base_of(op)], "event"
        res_out = results_out(res_rows, last_date)
        place_of = {r["t"]: r["p"] for r in res_out}

        so = stats_out(tp, tts, tc, facts, ev_mvp, tteam, regions, last_date)
        leaders, players_out, team_stats_out, overview = so["leaders"], so["players"], so["teamStats"], so["overview"]
        roster_out = []
        for tname_r, plist_r in sorted(rosters.get(op, {}).items()):
            roster_out.append({"t": tname_r, "u": team_ref(tname_r, last_date or "")[1], "r": roster_region.get((op, tname_r)),
                               "p": [[ctx.pname(pg_r), player_slug.get(pg_r), role, flag]
                                     for pg, role, flag, _ in sorted(plist_r, key=lambda x: x[3])
                                     for pg_r in [ctx.names.resolve(pg) or pg]]})
        regions_out, champs_out, teams_out = so["regions"], so["champs"], so["teams"]
        if ev_logos and riot["n"]:
            for t_ in teams_out:
                lg_ = photos_lp.riot_logo(riot, t_.get("t"))
                if lg_:
                    t_["img"] = lg_

        kids = sorted(children.get(op, []), key=lambda c: ((lp_tourn.get(c) or {}).get("DateStart") or "", c))
        parent = base_of(op)
        sibs = sorted(children.get(parent, []), key=lambda c: ((lp_tourn.get(c) or {}).get("DateStart") or "", c)) if parent else []
        start = info.get("DateStart") or (first_date or "")[:10]
        end = info.get("Date") or (last_date or "")[:10]
        event = {
            "n": en, "u": eslug, "op": op, "league": lg_ev, "lu": league_slug.get(lg_ev), "region": info.get("Region"),
            "level": info.get("TournamentLevel"), "start": start, "end": end, "year": str(info.get("Year") or (start or end or "")[:4] or "unknown"),
            "country": info.get("Country"), "type": info.get("EventType"), "prize": info.get("Prizepool"), "cur": info.get("Currency"),
            "q": 1 if info.get("IsQualifier") else 0, "po": 1 if info.get("IsPlayoffs") else 0,
            "parent": {"n": ename(parent), "u": event_slug.get(parent)} if parent and parent in event_slug else None,
            "siblings": [{"n": ename(c), "u": event_slug[c]} for c in sibs if c in event_slug],
            "children": [{"n": ename(c), "u": event_slug[c]} for c in kids if c in event_slug],
            "results": res_out, "resultsFrom": res_from if res_out else None,
            "standings": stand_out, "stages": stages, "teams": teams_out,
            "leaders": leaders, "champs": champs_out, "statsGames": n_stats_games,
            "players": players_out, "teamStats": team_stats_out, "overview": overview, "rosters": roster_out,
            "regions": regions_out,
            "games": sum(len(v) for v in series.values()), "series": sum(1 for st in stages for _ in st["series"]),
            # series with at least one game, from the same list as "games" (the stage tables can miss some series)
            "played": sum(1 for v in series.values() if v),
            # 1: lines/<event>.json exists (the event page's stats come from it)
            "ln": 1 if ev_lines["g"] and (big_event(en) or (last_date or "") >= LINES_FROM) else None,
        }
        out.json(f"event/{eslug}.json", {k: v for k, v in event.items() if v not in (None, [], {})})
        kept[op] = {"tp": tp, "tts": tts, "tc": tc, "facts": facts, "mvp": ev_mvp, "tteam": tteam, "regions": regions,
                    "last": last_date, "stats": n_stats_games, "rosters": roster_out, "series": event["series"], "played": event["played"],
                    "lu": league_slug.get(lg_ev), "y": event["year"], "en": en, "eslug": eslug}
        if ev_lines["g"] and (big_event(en) or (last_date or "") >= LINES_FROM):
            # each team's region and final place, for the Worlds page's region table (every year and all years)
            ev_lines["rg"] = {t_["u"]: t_["r"] for t_ in roster_out if t_.get("u") and t_.get("r")}
            ev_lines["pl"] = {r_["u"]: r_["p"] for r_ in res_out if r_.get("u") and r_.get("p")}
            if info.get("Country"):
                ev_lines["host"] = info.get("Country")
            # pentakills (Leaguepedia): [game index, player page, player, champion, how many in that game]
            gi_of = ev_lines.get("_gi", {})
            ev_lines["pk"] = [[gi_of[(pk_["g"], pk_["gn"])], pk_.get("u"), pk_.get("n"), pk_.get("c"), pk_.get("x") or 1]
                              for pk_ in facts["pentas"] if (pk_.get("g"), pk_.get("gn")) in gi_of]
            lines_pending.append((eslug, ev_lines))  # written after the ratings (each game's pre-game chance)
            checks["hub: event line files"] = checks.get("hub: event line files", 0) + 1
        if csv_rows:
            buf = io.StringIO()
            wcsv = csv.writer(buf, lineterminator="\n")
            wcsv.writerow(CSV_HEAD)
            wcsv.writerows([csv_safe(c) for c in r] for r in csv_rows)
            out.text(f"csv/{eslug}.csv", buf.getvalue())
            n_games_csv = sum(1 for r in csv_rows if r[9] == "team") // 2
            dl_index[league_slug.get(lg_ev) or "other-events"][(start or end or "")[:4] or event["year"]].append([eslug, en, n_games_csv, start or ""])

        # Per-player and per-team tournament rows
        for page, x in tp.items():
            team = x["team"].most_common(1)[0][0]
            p_events[page].append({
                "e": eslug, "en": en, "date": end, "t": team, "tu": team_ref(team, last_date or "")[1], "g": x["g"], "w": x["w"],
                "k": x["k"], "d": x["d"], "a": x["a"], "kda": kda(x["k"], x["d"], x["a"]),
                "csm": r1(x["cs"] / x["min"]) if x["min"] else None, "c": [c for c, _ in x["champs"].most_common(3)],
                **({"pl": place_of.get(team)} if res_from == "this" else {"_pp": place_of.get(team), "_pe": base_of(op)}),
                **({"lu": league_slug.get(lg_ev)} if lg_ev else {}),
            })
        for (name, u), x in tteam.items():
            if not u:
                continue
            fid = ctx.team_of(name, (last_date or "0000")[:10])
            usd = next((r.get("usd") for r in res_out if r["t"] == name and res_from == "this"), None)
            # prize listed on the whole event: shown later on this team's last stage of it
            pusd = next((r.get("usd") for r in res_out if r["t"] == name and res_from == "event"), None)
            t_events[fid].append({"e": eslug, "en": en, "date": end, "as": name, "g": x["g"], "w": x["w"], "sg": x["sg"],
                                  "sw": x["sw"], **({"pl": place_of.get(name)} if res_from == "this" else {}),
                                  **({"usd": usd} if usd else {}),
                                  **({"_pu": pusd, "_pp": place_of.get(name), "_pe": base_of(op)} if res_from == "event" else {}),
                                  **({"lu": league_slug.get(lg_ev)} if lg_ev else {})})

        winner_row = next((r for r in res_out if r["p"] == "1"), None)
        won = (winner_row["t"], winner_row["u"]) if winner_row and res_from == "this" else None
        if not won and res_from == "this" and event["q"]:
            # a qualifier's results say who went through ("Q"): one team through is its winner
            q_rows = [r for r in res_out if r["p"] == "Q"]
            if len(q_rows) == 1:
                won = (q_rows[0]["t"], q_rows[0]["u"])
        if not won and end and end <= today:
            won = final_winner(stages)
        events_by_year[event["year"]].append({
            "n": en, "u": eslug, "l": lg_ev, "r": info.get("Region"), "lv": info.get("TournamentLevel"),
            "st": start, "en": end, "g": event["games"], "q": event["q"], "sp": event["played"],
            **({"m": overview["min"]} if overview and overview.get("min") else {}),
            **({"w": won[0], "wu": won[1]} if won else {}),
            **({"p": event["parent"]["u"]} if event.get("parent") else {}),
        })
        recent = end and end >= recent_cut
        wtxt = f" {winner_row['t']} won." if winner_row and res_from == "this" and not recent else ""
        seo["event"].append((eslug, f"{en} – results, bracket and stats | {SITE}",
                             f"{en} ({start} to {end}){': ' + info['League'] if info.get('League') else ''}.{wtxt} "
                             f"Every series, standings, bracket, player leaders and champion picks.",
                             1 if event["games"] >= 4 else 0,
                             f"{en} ran from {start} to {end}, with {event['games']:,} games played.{wtxt}"
                             if event["games"] >= 20 and start and end else ""))

    # Parent events with no games of their own (Worlds 2025 = Play-In + Main Event)
    for op in parents:
        info = dict(lp_tourn.get(op) or {})
        kid_info = [lp_tourn.get(c) or {} for c in children[op]]
        if not info.get("TournamentLevel"):
            levels = {k.get("TournamentLevel") for k in kid_info}
            info["TournamentLevel"] = "Primary" if "Primary" in levels else next((x for x in levels if x), None)
        # A grouping page ("NA LCS/2014 Season") often has no league, year or dates of its own: use its stages'
        for field in ("League", "Region"):
            if not info.get(field):
                seen = Counter(k.get(field) for k in kid_info if k.get(field))
                info[field] = seen.most_common(1)[0][0] if seen else None
        if not info.get("DateStart"):
            info["DateStart"] = min((k["DateStart"] for k in kid_info if k.get("DateStart")), default=None)
        if not info.get("Date"):
            info["Date"] = max((k["Date"] for k in kid_info if k.get("Date")), default=None)
        if not info.get("Year"):
            years_k = Counter(str(k["Year"]) for k in kid_info if k.get("Year"))
            info["Year"] = years_k.most_common(1)[0][0] if years_k else None
        eslug = event_slug[op]
        kids = sorted(children[op], key=lambda c: ((lp_tourn.get(c) or {}).get("DateStart") or "", c))
        res_out = results_out(results.get(op, []), info.get("Date") or "")
        event = {
            "n": ename(op), "u": eslug, "op": op, "league": info.get("League"), "lu": league_slug.get(info.get("League")), "region": info.get("Region"),
            "level": info.get("TournamentLevel"), "start": info.get("DateStart"), "end": info.get("Date"),
            "year": str(info.get("Year") or (info.get("DateStart") or info.get("Date") or "")[:4] or "unknown"), "country": info.get("Country"), "type": info.get("EventType"),
            "prize": info.get("Prizepool"), "cur": info.get("Currency"),
            "children": [{"n": ename(c), "u": event_slug[c]} for c in kids if c in event_slug],
            "results": res_out, "resultsFrom": "this" if res_out else None,
            "games": sum(op_games.get(c, 0) for c in kids),
        }
        parts = [kept[c] for c in kids if c in kept]
        if parts:
            tp_m, tts_m, tc_m, facts_m, ev_m, tteam_m, regions_m, last_m, n_stats_m = merge_stages(parts)
            so = stats_out(tp_m, tts_m, tc_m, facts_m, ev_m, tteam_m, regions_m, last_m)
            seen_teams, rosters_m = set(), []
            for p in parts:
                for ro in p["rosters"]:
                    if ro["t"] not in seen_teams:
                        seen_teams.add(ro["t"])
                        rosters_m.append(ro)
            event.update({"leaders": so["leaders"], "players": so["players"], "teamStats": so["teamStats"],
                          "overview": so["overview"], "regions": so["regions"], "champs": so["champs"], "teams": so["teams"],
                          "statsGames": n_stats_m, "rosters": sorted(rosters_m, key=lambda r: r["t"] or ""), "whole": 1,
                          "series": sum(p["series"] for p in parts)})
        out.json(f"event/{eslug}.json", {k: v for k, v in event.items() if v not in (None, [], {})})
        winner_row = next((r for r in res_out if r["p"] == "1"), None)
        events_by_year[event["year"]].append({
            "n": event["n"], "u": eslug, "l": info.get("League"), "r": info.get("Region"), "lv": info.get("TournamentLevel"),
            "st": event["start"], "en": event["end"], "g": event["games"], "q": 0, "kids": len(event["children"]),
            "sp": sum(kept[c].get("played", 0) for c in kids if c in kept),
            **({"m": event["overview"]["min"]} if (event.get("overview") or {}).get("min") else {}),
            # its stages' pages (Worlds page "all years": each stage's lines file without loading every event)
            "c": [c["u"] for c in event["children"]],
            **({"res": 1} if res_out else {}),
            **({"w": winner_row["t"], "wu": winner_row["u"]} if winner_row else {}),
        })
        recent = (event["end"] or "") >= recent_cut
        seo["event"].append((eslug, f"{event['n']} – results and stages | {SITE}",
                             f"{event['n']}: {', '.join(c['n'] for c in event['children'][:4])}."
                             + (f" {winner_row['t']} won." if winner_row and not recent else "")
                             + " Results, prize money and every stage.", 1 if event["games"] >= 4 else 0))
    print(f"hub: events and series done: {n_series_pages} series pages ({time.time() - t_stage:.0f}s)")

    team_earnings = Counter()
    for op_r, rows_r in results.items():
        if base_of(op_r) and results.get(base_of(op_r)):
            continue  # the whole event lists the prize money already
        date_r = ((lp_tourn.get(op_r) or {}).get("Date") or (lp_tourn.get(op_r) or {}).get("DateStart") or "")[:10]
        for r in rows_r:
            if not r["Prize_USD"] or str(r.get("Showmatch") or "") in ("1", "Yes", "yes"):
                continue
            name, u_r, _ = team_ref(r["Team"], date_r)
            if u_r:
                team_earnings[ctx.team_of(r["Team"], date_r or "0000")] += r["Prize_USD"]

    # -- storylines: collected on the team and player pages, the best go to notes.json ---------
    two_years_ago = (datetime.date.today() - datetime.timedelta(days=730)).isoformat()
    champ_top = {}  # champion -> (games, page) of the player with the most pro games on it
    for pg_, px_ in ctx.players.items():
        for c_, v_ in px_["champs"].items():
            if v_["g"] > champ_top.get(c_, (0, None))[0]:
                champ_top[c_] = (v_["g"], pg_)
    all_notes = []
    notes_cut = (datetime.date.today() - datetime.timedelta(days=30)).isoformat()

    def note_score(nt):
        """How notable a note is (rough): an unbeaten run at the event on now, records and comebacks first, then big
        round numbers and long streaks."""
        k = nt["k"]
        if k == "ms":
            return nt["n"] / {"games": 100, "wins": 80, "kills": 500, "assists": 1000}[nt["s"]] - nt["left"] * 0.05
        if k == "streak":
            return nt["n"] * 0.8
        if k == "evunb":
            return 2 + nt["n"] * 1.2
        if k == "crec":
            return 3 + nt["n"] / 50
        if k == "comeback":
            return nt["n"] * 1.5
        if k == "penta":
            return 1.5 + nt["n"] * 1.2
        if k == "cms":
            return nt["n"] / 40 - nt["left"] * 0.2
        if k == "form":
            return nt["w"] * 0.4
        return nt["n"] * 0.5

    # -- ratings: win chances and power rankings ---------------------------------------------
    if os.environ.get("RW_DUMP_RATING_GAMES"):  # for tuning scripts/stats/ratings.py offline
        with open(os.environ["RW_DUMP_RATING_GAMES"], "w", encoding="utf-8") as f:
            json.dump([[d, lg, i, str(fa), str(fb), w, t_, r_] + (list(x) if x else [None, None, None, [], []])
                       for (d, lg, i, fa, fb, w, t_, r_), x in zip(rating_games, rating_extra)], f)
    # with each game's side, gold difference and lineups when known (players carry their rating between teams)
    if len(rating_extra) != len(rating_games):  # never mismatch games and details: drop the details instead
        rating_extra = [None] * len(rating_games)
    rating_series = []
    rating_chances = {}
    if len(rating_tags) != len(rating_games):
        rating_tags = [None] * len(rating_games)
    rated, rating_tests, rated_leagues = team_ratings.run(
        [g + (tuple(x) if x else (None, None, None, [], [])) + (t,) for g, x, t in zip(rating_games, rating_extra, rating_tags)],
        series_out=rating_series, chances_out=rating_chances)
    # the Worlds / MSI / First Stand lines files: each game's pre-game chance, then out they go
    # team a's chance in game 1 of each series this week (before it was played)
    week_chance = {gs: rating_chances[tag] for tag, gs in week_tagged.items() if tag in rating_chances}
    for tag_c, (lines_c, gi_c) in lines_tagged.items():
        if tag_c in rating_chances:
            lines_c["g"][gi_c][11] = round(rating_chances[tag_c] * 100)
    for eslug_c, lines_c in lines_pending:
        lines_c.pop("_gi", None)
        out.json(f"lines/{eslug_c}.json", lines_c)
    # TIER2_GAP pulls every rating down a few hundred points; shift them all by one number so the average active
    # top-league team is 1500 (only differences matter for rankings, win chances and the backtest)
    newest_r0 = max((x["last"] for x in rated.values()), default="0000-00-00")
    if newest_r0[0] != "0":
        cut_r0 = (datetime.date.fromisoformat(newest_r0) - datetime.timedelta(days=120)).isoformat()
        tops_r = [x["r"] for fid, x in rated.items()
                  if x["last"] >= cut_r0 and x["g"] >= 15 and x["league"] and team_slug.get(fid) and fid in ctx.fr_name
                  and "national team" not in ctx.fr_name[fid].lower() and rated_leagues.get(x["league"], (2, None))[0] == 1]
        if tops_r:
            shift_r = 1500 - sum(tops_r) / len(tops_r)
            for x in rated.values():
                x["r"] += shift_r
                x["hist"] = [(d_, v_ + shift_r) for d_, v_ in x["hist"]]
    newest_r = max((x["last"] for x in rated.values()), default="0000-00-00")
    active_cut = (datetime.date.fromisoformat(newest_r) - datetime.timedelta(days=120)).isoformat() if newest_r[0] != "0" else "9"
    before_30 = (datetime.date.fromisoformat(newest_r) - datetime.timedelta(days=30)).isoformat() if newest_r[0] != "0" else "0"
    # active teams with a home league; national teams are left out (their games still count for the clubs they met)
    ranked = sorted(((fid, x) for fid, x in rated.items()
                     if x["last"] >= active_cut and x["g"] >= 15 and x["league"] and team_slug.get(fid) and fid in ctx.fr_name
                     and "national team" not in ctx.fr_name[fid].lower()),
                    key=lambda kv: -kv[1]["r"])
    tier_of = lambda lg_: rated_leagues.get(lg_, (2, None))[0]
    n_top = sum(1 for _, x in ranked if tier_of(x["league"]) == 1)
    team_rating = {}
    league_rank = Counter()
    world_rank = 0
    rank_rows = []
    trend_of = {}  # team slug -> its rating after each game day of the last 30 days (the rankings page trend line)
    for fid, x in ranked:
        lg_r = x["league"]
        league_rank[lg_r] += 1
        top_r = tier_of(lg_r) == 1
        world_rank += 1 if top_r else 0
        was = team_ratings.rating_on(x["hist"], before_30)
        trend_of[team_slug[fid]] = ([[before_30, round(was)]] if was is not None else []) + [
            [d_, round(v_)] for d_, v_ in x["hist"] if d_ > before_30]
        # a world rank only for top-league teams: second-tier leagues never meet them, so theirs is a league rank
        team_rating[fid] = {"r": round(x["r"]), "rank": world_rank if top_r else None, "of": n_top, "league": lg_r,
                            "lrank": league_rank[lg_r], "chg30": round(x["r"] - was) if was is not None else None}
        lpt_r = lp_team.get(ctx.fr_name[fid]) or {}
        code_r = ctx.short_of(ctx.fr_name[fid]) or str(lpt_r.get("Short") or "").strip()
        # the country the team plays in (Leaguepedia's TeamLocation), else the organisation's; for a team Leaguepedia
        # files under another name (LYON (2024 American Team), Kiwoom DRX) its name without the note, or an older name
        # of the franchise; else the league's country
        nm_r = ctx.fr_name[fid]
        # a region-suffixed name plays in that region (Ninjas in Pyjamas.CN: China, not the Swedish organisation)
        cc_r = {"CN": "cn", "KR": "kr", "VN": "vn", "BR": "br", "JP": "jp"}.get(nm_r.rsplit(".", 1)[-1]) if "." in nm_r else None
        older = [e["n"] for e in sorted(ctx.fr_eras.get(fid, []), key=lambda e: e.get("to") or "", reverse=True)]
        for cand in [] if cc_r else [nm_r, re.sub(r"\s*\(.*\)\s*$", "", nm_r)] + older:
            t_ = lp_team.get(cand) or {}
            cc_r = country_code(t_.get("TeamLocation")) or country_code(t_.get("Location"))
            if cc_r:
                break
        if not cc_r:
            cc_r = LEAGUE_COUNTRY.get(leagues_info.SHORT.get(lg_r) or "") or LEAGUE_NAME_COUNTRY.get(lg_r or "")
        rank_rows.append([team_slug[fid], ctx.fr_name[fid], code_r, lg_r, league_slug.get(lg_r), round(x["r"]),
                          team_rating[fid]["chg30"], x["g"], x["last"], 1 if top_r else 2,
                          leagues_info.SHORT.get(lg_r) or "", cc_r])
    # league strength: average of each top league's best four active teams
    by_league_r = defaultdict(list)
    for row in rank_rows:
        if row[9] == 1:
            by_league_r[row[3]].append(row[5])
    league_rows = sorted(([lg_r, league_slug.get(lg_r), round(sum(sorted(v, reverse=True)[:4]) / min(4, len(v))), len(v)]
                          for lg_r, v in by_league_r.items() if lg_r and len(v) >= 4), key=lambda r: -r[2])
    # the last few days' rated series ("date|team|team", slugs in order), so the app adds only results that came in
    # after this build (from Riot's schedule) and never counts one twice; and the published points a game moves
    rated_cut = (datetime.date.fromisoformat(newest_r) - datetime.timedelta(days=4)).isoformat() if newest_r[0] != "0" else "9"
    rated_recent = sorted({f"{gd_}|{'|'.join(sorted((team_slug.get(fa_) or '', team_slug.get(fb_) or '')))}"
                           for gd_, _lg, _in, fa_, fb_, *_ in rating_games if gd_ >= rated_cut and team_slug.get(fa_) and team_slug.get(fb_)})
    out.json("ratings.json", {
        "asof": newest_r, "games": len(rating_games),
        "rated": rated_recent,
        "k": {"top": round(team_ratings.CONF_TOP * team_ratings.K, 1),
              "intl": round(team_ratings.CONF_TOP * team_ratings.K * team_ratings.K_INTL, 1)},
        "teams": rank_rows, "leagues": league_rows,
        # ratings are on the top-league scale; the app multiplies a difference by "intl" for two teams from different
        # leagues and by "other" below the top leagues, and scales a series' per-game edge by series[best of]
        "adjust": {"intl": round(team_ratings.CONF_INTL / team_ratings.CONF_TOP, 4),
                   "other": round(team_ratings.CONF_OTHER / team_ratings.CONF_TOP, 4),
                   "series": {str(k): v for k, v in team_ratings.SERIES.items()}},
        "test": {"from": team_ratings.TEST_FROM, "all": team_ratings.score(rating_tests),
                 "series": {str(bo): team_ratings.series_calibration(rating_series, bo) for bo in (3, 5)},
                 "intl": team_ratings.score(rating_tests, lambda t: t[3]),
                 "settled": team_ratings.score(rating_tests, lambda t: t[4]),
                 "cross": team_ratings.cross(rating_tests),
                 "calibration": team_ratings.calibration(rating_tests)},
    })
    checks["hub: rated teams (active)"] = len(rank_rows)
    # rating history: one point per team per day (kept across builds in <out>/ratings-history.json; only the newest
    # point of a day is kept, and points older than 400 days go)
    rating_hist = {}
    hist_path = os.path.join(getattr(ctx, "out_root", "") or "", "ratings-history.json")
    try:
        with open(hist_path, encoding="utf-8") as f:
            rating_hist = json.load(f)
    except (OSError, ValueError):
        rating_hist = {}
    cutoff_h = (datetime.date.today() - datetime.timedelta(days=400)).isoformat()
    rank_of = {row[0]: i + 1 for i, row in enumerate(r_ for r_ in rank_rows if r_[9] == 1)}
    for row in rank_rows:
        pts = [p for p in rating_hist.get(row[0], []) if p[0] >= cutoff_h and p[0] != today]
        pts.append([today, row[5], rank_of.get(row[0])])
        rating_hist[row[0]] = pts
    if getattr(ctx, "out_root", None):
        try:
            tmp_h = hist_path + ".tmp"
            with open(tmp_h, "w", encoding="utf-8") as f:
                json.dump(rating_hist, f, separators=(",", ":"))
            os.replace(tmp_h, hist_path)
        except OSError as e:
            checks["hub: rating history not saved"] = str(e)
    # the rankings page's trend lines, top-league teams: the rating after each game day over the same 30 days as the
    # "30 days" column, from the rating run itself (the daily snapshots above only began on 2026-10-18, so a line made
    # from them covered a week and often went the other way from the number beside it)
    out.json("ratings-history.json", {row[0]: trend_of[row[0]] for row in rank_rows if row[9] == 1 and row[0] in trend_of})
    checks["hub: teams with rating history"] = sum(1 for v in rating_hist.values() if len(v) > 1)
    checks["hub: rated teams in top leagues"] = n_top
    checks["hub: rating test accuracy"] = team_ratings.score(rating_tests).get("acc")

    # -- team pages -------------------------------------------------------------------------
    stakes_team = {}    # team slug -> name, notes, starters (active teams), for hub/stakes.json
    stakes_player = {}  # player slug -> (notes as of, notes)
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
        tg_rows = sorted(t_games.get(fid, []), key=lambda r: (r[0], r[1]), reverse=True)
        t_has2y = False
        if tg_rows:
            out.json(f"teamgames/{u}.json", tg_rows)
            # the last two years first on the team page (T1's full log is ~160 KB compressed), the rest after
            tg_recent = [r for r in tg_rows if r[0] >= two_years_ago]
            if tg_recent and len(tg_rows) > 200 and len(tg_recent) < len(tg_rows) * 0.8:
                out.json(f"teamgames2y/{u}.json", tg_recent)
                t_has2y = True
        prize_shown = set()
        for x in tevents:  # newest first: the event's prize and placing go on the last stage this team played
            pe, pu, pp = x.pop("_pe", None), x.pop("_pu", None), x.pop("_pp", None)
            if pe and pe not in prize_shown:
                prize_shown.add(pe)
                if pu:
                    x.setdefault("usd", pu)
                if pp:
                    x["pl"] = pp
        obj = {
            "name": name, "u": u, "region": lpt.get("Region"), "codes": codes, "rating": team_rating.get(fid),
            # the team's rating over the last year, [date, rating] (builds from 2026-10-18 on)
            **({"rh": [[p[0], p[1]] for p in rating_hist.get(u, [])]} if len(rating_hist.get(u, [])) > 1 else {}),
            "disbanded": 1 if lpt.get("IsDisbanded") else 0,
            "g": t["g"], "w": t["w"], "sg": len(ss), "sw": sw, "from": t["from"], "to": t["to"],
            "names": [{"n": e["n"], "from": e["from"], "to": e["to"], "g": e["g"]} for e in eras],
            "avgMin": r1(t["min"] / t["g"]) if t["g"] else 0,
            "kills": r1(t["kills"] / t["kg"]) if t["kg"] else None, "deaths": r1(t["deaths"] / t["kg"]) if t["kg"] else None,
            "obj": {f: r2(t["obj"][f] / og) for f in ("dragons", "barons", "towers", "heralds", "golddiff")} if og else None,
            "years": [{"y": y, "g": v["g"], "w": v["w"], "as": v["names"].most_common(1)[0][0]} for y, v in sorted(t["years"].items(), reverse=True)],
            "recent": [{"date": r[0][:10], "g": r[1] or None, "opp": r[2], "us": r[3], "them": r[4], "en": r[5], "e": r[6],
                        **({"r": r[7]} if r[7] is not None else {})} for r in recent],
            "opps": sorted(({"n": ctx.fr_name[o], "u": team_slug.get(o), **v} for o, v in t["opps"].items()), key=lambda x: -x["g"])[:60],
            "champs": [{"c": c, "g": n, "w": t["champ_w"][c]} for c, n in t["champs"].most_common(30)],
            "bans": [{"c": c, "g": n} for c, n in t["bans_by"].most_common(15)],
            "events": tevents,
            "titles": [{**{k: v for k, v in x.items() if k not in ("fid", "s")}, "e": tname_slug.get(x["t"])} for x in ctx.titles_by_team.get(fid, [])],
            "bestStreak": {"n": t["best_streak"][0], "date": t["best_streak"][1]} if t["best_streak"] else None,
            "roster": roster,
            "earnings": round(team_earnings.get(fid, 0)),
            "sides": t_side.get(fid),
            "bansVs": [{"c": c, "g": n} for c, n in t_bans_vs.get(fid, Counter()).most_common(15)],
        }
        # -- storylines -------------------------------------------------------------------------
        notes = milestone_notes({"wins": t["w"], "games": t["g"]})
        ss_sorted = sorted(ss, key=lambda x: (x["date"], x["id"]))
        if ss_sorted:
            won_last = (ss_sorted[-1]["fa"] if ss_sorted[-1]["w"] == ss_sorted[-1]["a"] else ss_sorted[-1]["fb"]) == fid
            n_streak = 0
            for x in reversed(ss_sorted):
                if ((x["fa"] if x["w"] == x["a"] else x["fb"]) == fid) != won_last:
                    break
                n_streak += 1
            if n_streak >= 4:
                notes.append({"k": "streak", "w": 1 if won_last else 0, "n": n_streak})
            # unbeaten at the tournament it's playing now (its newest series in the last 10 days)
            last_s = ss_sorted[-1]
            if last_s["date"][:10] >= (datetime.date.today() - datetime.timedelta(days=10)).isoformat():
                here = [x for x in ss_sorted if x["t"] == last_s["t"]]
                won_here = [x for x in here if ((x["fa"] if x["w"] == x["a"] else x["fb"]) == fid)]
                if len(here) >= 3 and len(won_here) == len(here):
                    gw = sum(x["wa"] if x["fa"] == fid else x["wb"] for x in here)
                    gl = sum(x["wb"] if x["fa"] == fid else x["wa"] for x in here)
                    notes.append({"k": "evunb", "e": last_s["t"], "n": len(here), "gw": gw, "gl": gl})
        this_year = today[:4]
        tg_sorted = sorted(t_games.get(fid, []), key=lambda r: r[0])
        # form over the last 10 games (when the series streak doesn't already say it)
        last10 = tg_sorted[-10:]
        if len(last10) == 10 and not any(nt["k"] == "streak" for nt in notes):
            w10 = sum(r[7] for r in last10)
            if w10 >= 9:
                notes.append({"k": "form", "w": w10, "n": 10})
        # comebacks: games won this year from 2,500+ gold down at 15 minutes (Oracle's Elixir)
        comebacks = sum(1 for r in tg_sorted if r[0][:4] == this_year and r[7] and r[23] and r[23][1] is not None and r[23][1] <= -2500)
        if comebacks >= 2:
            notes.append({"k": "comeback", "n": comebacks, "y": this_year})
        side_rec = {"b": [0, 0], "r": [0, 0]}
        for r in t_games.get(fid, []):
            if r[0][:4] == this_year:
                side_rec[r[6]][0] += 1
                side_rec[r[6]][1] += r[7]
        for sd_k, (g_s, w_s) in side_rec.items():
            if g_s >= 6 and w_s == g_s:
                notes.append({"k": "side", "side": sd_k, "n": g_s, "y": this_year})
        if notes:
            as_of = max([x["date"] for x in ss_sorted[-1:]] + [t["to"] or ""])[:10]
            obj["notes"] = {"asOf": as_of, "list": notes}
            if (t["to"] or "") >= notes_cut:
                lu_last = next((x.get("lu") for x in tevents if x.get("lu")), None)
                for nt in notes:
                    all_notes.append((note_score(nt), lu_last, {**nt, "t": "team", "name": name, "u": u, "asOf": as_of}))
        starters = []
        if (t["to"] or "") >= active_cut:
            year_pages = ctx.team_players[fid].get(max(ctx.team_players[fid])) if ctx.team_players[fid] else {}
            last_for = {pg: max((v["to"] for v in ctx.players[pg]["teams"].values() if v["fid"] == fid), default="")
                        for pg in (year_pages or {}) if pg in ctx.players}
            for role_s in ("Top", "Jungle", "Mid", "Bot", "Support"):
                cands = [pg for pg in last_for if ctx.team_roles[fid].get(pg) and ctx.team_roles[fid][pg].most_common(1)[0][0] == role_s
                         and player_slug.get(pg)]
                best_s = max(cands, key=lambda pg: (last_for[pg], year_pages[pg]), default=None)
                if best_s:
                    starters.append([ctx.pname(best_s), player_slug[best_s], role_s])
            stakes_team[u] = {"n": name, "a": obj["notes"]["asOf"] if notes else None, "l": notes or [], "p": starters}
        if starters:
            obj["starters"] = starters  # [name, slug, role]: who played the team's latest games, by role
        if t_has2y:
            obj["g2y"] = 1  # teamgames2y/<slug>.json exists
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
                            1 if t["g"] >= SEO_MIN_GAMES else 0, team_summary(name, t, obj, worlds)))
    search_teams.sort(key=lambda x: -x[2])

    # Every series of each team (results archive, Compare's head-to-head list): newest first
    for u, rows in t_series.items():
        rows.sort(key=lambda r: r[0], reverse=True)
        out.json(f"teamseries/{u}.json", [list(r) for r in rows])

    # -- player pages -------------------------------------------------------------------------
    def whole_event_places(evs):
        """Newest first: a whole event's placing goes on the last stage the player played of it."""
        seen = set()
        for x in evs:
            pe, pp = x.pop("_pe", None), x.pop("_pp", None)
            if pe and pe not in seen:
                seen.add(pe)
                if pp:
                    x["pl"] = pp
        return evs

    search_players = []
    # roster moves (hub/moves.json): players who started at a new club in the last 150 days, newest first (not
    # "moves": the patch notes below use that name for champions moving up and down)
    roster_moves = []
    moves_cut = (datetime.date.today() - datetime.timedelta(days=150)).isoformat()
    club_of = {}  # page -> (current club, its slug)
    titles_by_event = defaultdict(list)
    for x in ctx.titles:
        titles_by_event[x["t"]].append(x)
    riot_pics = riot["p"]  # Riot's photo of current pros (matched by name and current team), in their own page file
    n_riot_pics = 0
    for page, p in ctx.players.items():
        u = player_slug.get(page)
        if not u or p["g"] < 1:
            continue
        name = ctx.pname(page)
        teams_sorted = sorted(p["teams"].items(), key=lambda kv: kv[1]["to"], reverse=True)
        last_date = teams_sorted[0][1]["to"] if teams_sorted else ""
        club = ctx.current_club(teams_sorted) or ""
        sm = p["stat_min"]
        bio = lp_player.get(page) or {}
        my_titles = sorted({(x["t"], x["date"], x["kind"]) for x in ctx.titles if (x["t"], x["fid"]) in ctx.player_events[page]},
                           key=lambda x: x[1], reverse=True)
        role = p["roles"].most_common(1)[0][0]
        tn_ = re.sub(r"[\W_]+", "", club.lower())
        img = next((im for t_, im in riot_pics.get(re.sub(r"[\W_]+", "", (name or "").lower()), [])
                    if t_ and tn_ and (t_ == tn_ or tn_ in t_ or t_ in tn_)), None)
        n_riot_pics += 1 if img else 0
        obj = {
            "name": name, "u": u, "page": page, "role": role, **({"img": img} if img else {}),
            "club": club, "clubU": team_slug.get(p["teams"][club]["fid"]) if club in p["teams"] else None,
            "clubTo": p["teams"][club]["to"] if club in p["teams"] else last_date,
            "bio": {k: v for k, v in {
                "real": bio.get("Name"), "native": bio.get("NativeName"), "country": bio.get("Country"),
                "cc": country_code(bio.get("Country")),  # so the app can name the country in the reader's language
                "born": bio.get("Birthdate"), "res": bio.get("Residency"), "retired": 1 if bio.get("IsRetired") else None,
                "twitter": bio.get("Twitter"), "stream": bio.get("Stream"), "youtube": bio.get("Youtube"),
                "contract": bio.get("Contract"), "fav": jlist(bio.get("FavChamps")) or None,
                "soloq": soloq_ids(bio.get("SoloqueueIds")) or None,
            }.items() if v},
            "mvp": p_mvp.get(page, 0),
            "pentas": [{"date": d, "c": c, "g": g_, "en": e_, "x": x_, "gn": n_} for d, c, g_, e_, x_, n_ in sorted(p_pentas.get(page, []), reverse=True)],
            "g": p["g"], "w": p["w"], "k": p["k"], "d": p["d"], "a": p["a"], "kda": kda(p["k"], p["d"], p["a"]),
            "csm": r1(p["cs"] / sm) if sm else None, "gpm": round(p["gold"] / sm) if sm else None,
            "dpm": round(p["dmg"] / p["dmg_min"]) if p.get("dmg_min") else None,
            "teams": [{"n": n, "u": team_slug.get(v["fid"]), "g": v["g"], "w": v["w"], "from": v["from"], "to": v["to"]} for n, v in teams_sorted],
            "years": [{"y": y, "g": v["g"], "w": v["w"], "kda": kda(v["k"], v["d"], v["a"]),
                       "team": v["teams"].most_common(1)[0][0]} for y, v in sorted(p["years"].items(), reverse=True)],
            "champs": sorted(({"c": c, **v, "kda": kda(v["k"], v["d"], v["a"])} for c, v in p["champs"].items()), key=lambda x: -x["g"])[:60],
            "nChamps": len(p["champs"]),
            "events": whole_event_places(sorted(p_events.get(page, []), key=lambda x: x["date"] or "", reverse=True)),
            "recent": [{"date": r[0][:10], "g": r[1], "c": r[2], "k": r[3], "d": r[4], "a": r[5], "win": r[6], "opp": r[7], "en": r[8], "team": r[9],
                        "gn": r[10], **({"r": r[11]} if r[11] is not None else {})}
                       for r in sorted(p_recent.get(page, []), reverse=True)],
            "best": {k: {"v": v[0], "date": v[1], "c": v[2], "opp": v[3], "en": v[4], "g": v[5], "gn": v[6]} for k, v in p_best.get(page, {}).items()},
            "titles": [{"t": t, "date": d, "kind": k, "e": tname_slug.get(t)} for t, d, k in my_titles][:60],
        }
        # -- storylines -------------------------------------------------------------------------
        notes = milestone_notes({"games": p["g"], "wins": p["w"], "kills": p["k"], "assists": p["a"]})
        this_year = today[:4]
        champ_rec = defaultdict(lambda: [0, 0])
        for r in p_games.get(page, []):
            if r[0][:4] == this_year and r[2]:
                champ_rec[r[2]][0] += 1
                champ_rec[r[2]][1] += r[6]
        # unbeaten on a champion this year: only a run long enough to mean something
        unbeaten = sorted(((g_c, c) for c, (g_c, w_c) in champ_rec.items() if g_c >= 7 and w_c == g_c), reverse=True)
        if unbeaten:
            notes.append({"k": "champ", "c": unbeaten[0][1], "n": unbeaten[0][0], "y": this_year})
        # the most pro games on a champion of any player
        recs = sorted(((v["g"], c) for c, v in p["champs"].items() if v["g"] >= 40 and champ_top.get(c, (0, None))[1] == page), reverse=True)
        if recs:
            notes.append({"k": "crec", "c": recs[0][1], "n": recs[0][0]})
        # one game from a round number of games on one champion (50, 100, 150...): under fearless rules a champion
        # is played once per series, so only "one away" can happen in the next series
        near = sorted((((v["g"] // 50 + 1) * 50, (v["g"] // 50 + 1) * 50 - v["g"], c) for c, v in p["champs"].items()
                       if v["g"] >= 40 and (v["g"] // 50 + 1) * 50 - v["g"] <= 1), reverse=True)
        if near:
            notes.append({"k": "cms", "c": near[0][2], "n": near[0][0], "left": near[0][1]})
        # pentakills this year
        pent_y = sum(x_ for d_, _c, _g, _e, x_, _n in p_pentas.get(page, []) if d_[:4] == this_year)
        if pent_y >= 2:
            notes.append({"k": "penta", "n": pent_y, "y": this_year})
        if notes:
            as_of = (last_date or "")[:10]
            obj["notes"] = {"asOf": as_of, "list": notes}
            if (last_date or "") >= notes_cut and p["g"] >= 100:
                lu_last = next((x.get("lu") for x in obj["events"] if x.get("lu")), None)
                for nt in notes:
                    all_notes.append((note_score(nt), lu_last, {**nt, "t": "player", "name": name, "u": u, "asOf": as_of}))
            stakes_player[u] = (as_of, notes)
        games = sorted(p_games.get(page, []), key=lambda r: r[0], reverse=True)
        # Match prep and the player page load this smaller file first (the last two years) and the full log after;
        # g2y says it exists, so the app never asks for one that isn't there
        recent2 = [r for r in games if r[0] >= two_years_ago]
        has2y = bool(recent2) and len(games) > 200 and len(recent2) < len(games) * 0.8
        if has2y:
            obj["g2y"] = 1
        # a move: the newest club stint began recently and the one before was another club (national teams and
        # renames of the same club don't count)
        clubs = sorted((t for t in obj.get("teams") or [] if t.get("u") and "national team" not in (t.get("n") or "").lower()),
                       key=lambda t: t.get("from") or "", reverse=True)
        if p["g"] >= 30 and len(clubs) >= 2 and (clubs[0].get("from") or "") >= moves_cut:
            prev = next((t for t in clubs[1:] if t["u"] != clubs[0]["u"]), None)
            if prev and (prev.get("to") or "") >= (datetime.date.fromisoformat(clubs[0]["from"][:10]) - datetime.timedelta(days=400)).isoformat():
                roster_moves.append({"d": clubs[0]["from"][:10], "n": name, "u": u, "r": role or "",
                              "from": {"n": prev["n"], "u": prev["u"], "to": (prev.get("to") or "")[:10]},
                              "to": {"n": clubs[0]["n"], "u": clubs[0]["u"], "g": clubs[0]["g"]}, "g": p["g"],
                              # the league the new club plays in (its newest event), so the app can show top leagues only
                              "lu": next((e.get("lu") for e in obj.get("events") or [] if e.get("tu") == clubs[0]["u"] and e.get("lu")), None)})
        club_of[page] = (obj.get("club") or "", obj.get("clubU"))
        out.json(f"player/{u}.json", obj)
        if games:
            out.json(f"playergames/{u}.json", [list(r) for r in games])
            if has2y:
                out.json(f"playergames2y/{u}.json", [list(r) for r in recent2])
        search_players.append([name, short_slug(name, u), club, p["g"], last_date[:4], (role or "")[:1],
                               " ".join(x for x in (bio.get("Name"), bio.get("NativeName")) if x) if p["g"] >= 50 else ""])
        seo["player"].append((u, f"{name} – pro stats, champions and career | {SITE}",
                              f"{name}{' (' + bio['Name'] + ')' if bio.get('Name') else ''}, {role}{' for ' + club if club else ''}. "
                              f"{p['g']:,} pro games, KDA {obj['kda']}, {round(100 * p['w'] / p['g']) if p['g'] else 0}% wins"
                              f"{', ' + str(len(my_titles)) + ' titles' if my_titles else ''}. Champion pool, tournaments and career bests.",
                              1 if p["g"] >= SEO_MIN_GAMES else 0, player_summary(name, role, club, p, obj, my_titles)))
    search_players.sort(key=lambda x: -x[3])

    # -- what's at stake: storylines of every active team and its starters, for "On the line today" ------
    stakes = {}
    for u_s, x in stakes_team.items():
        ps = [[n_, pu, r_, *stakes_player[pu]] for n_, pu, r_ in x["p"] if pu in stakes_player]
        if x["l"] or ps:
            stakes[u_s] = {"n": x["n"], "a": x["a"], "l": x["l"], "p": ps}
    out.json("stakes.json", stakes)
    checks["hub: teams with stakes"] = len(stakes)

    # -- champion pages -------------------------------------------------------------------------
    # Newest patches with a fair number of games (the champion pages' patch trend)
    def patch_order(pt):
        try:
            return tuple(int(x) for x in pt.split("."))
        except ValueError:
            return (0,)

    recent_patches = sorted((pt for pt, x in patch_stats.items() if x["g"] >= 30), key=lambda pt: (patch_order(pt), patch_stats[pt]["to"]),
                            reverse=True)[:16]
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
        def top_counts(cnt, wins, n, min_games=1):
            return [[k, g_, wins[k]] for k, g_ in cnt.most_common(n) if g_ >= min_games]

        def lane_tail(m):
            """Lane numbers of a matchup / role: [games with leads, avg gold, CS, XP lead at 15, games ahead at 15]."""
            return [m[2], round(m[3] / m[2]), round(m[4] / m[2], 1), round(m[5] / m[2]), m[6]] if m[2] else []

        def mu_out(src, min_g, keep):
            out_m = defaultdict(list)
            for (role, oc), m in src.items():
                if m[0] >= min_g:
                    out_m[role].append([oc, m[0], m[1], *lane_tail(m)])
            for role in out_m:
                out_m[role].sort(key=lambda x: -x[1])
                del out_m[role][keep:]
            return out_m or None

        matchups = mu_out(v["mu"], 3, 30)
        obj = {
            "name": c, "u": u, "p": v["p"], "w": v["w"], "b": v["b"],
            "side": v["side"],
            "slots": {k_s: v["slots"][k_s] for k_s in ("B1", "B2-3", "B4-5", "R1-2", "R3", "R4", "R5") if k_s in v["slots"]} or None,
            "builds": {"since": build_cut, "g": v["bg"], "items": top_counts(v["items"], v["items_w"], 40, 2),
                       "keys": top_counts(v["keys"], v["keys_w"], 6, 2), "spells": top_counts(v["spells"], v["spells_w"], 5, 2)}
            if v["bg"] else None,
            "matchups": matchups,
            # the last 12 months (this meta), and the champion's own lane numbers per role
            "matchups12": mu_out(v["mu12"], 2, 30),
            "lane": {role: [m[0], m[1], *lane_tail(m)] for role, m in v["lane"].items() if m[0]} or None,
            "lane12": {role: [m[0], m[1], *lane_tail(m)] for role, m in v["lane12"].items() if m[0]} or None,
            "duos": sorted([[k, x[0], x[1]] for k, x in v["duo"].items() if x[0] >= 3], key=lambda x: -x[1])[:20] or None,
            "patches": [{"p": pt, "pk": patch_stats[pt]["p"].get(c, 0), "w": patch_stats[pt]["w"].get(c, 0),
                         "b": patch_stats[pt]["b"].get(c, 0), "pr": patch_stats[pt]["pres"].get(c, 0), "g": patch_stats[pt]["g"]}
                        for pt in recent_patches],
            "years": [{"y": y, "p": x[0], "w": x[1], "b": x[2]} for y, x in sorted(v["years"].items(), reverse=True)],
            "roles": [{"r": r, "p": n} for r, n in v["roles"].most_common()],
            "players": [{"n": ctx.pname(pg), "u": player_slug.get(pg), "g": x[0], "w": x[1], "kda": kda(x[2], x[3], x[4])} for pg, x in players_top],
            "recent": [{"date": r[0][:10], "g": r[1], "n": ctx.pname(r[2]) if r[2] else "", "u": player_slug.get(r[2]),
                        "team": r[3], "opp": r[4], "k": r[5], "d": r[6], "a": r[7], "win": r[8], "en": r[9],
                        "it": list(r[10]), "ks": r[11], "stt": r[12], "sp": list(r[13]), "r": r[14], "gn": r[15]}
                       for r in sorted(v["recent"], reverse=True)],
        }
        out.json(f"champ/{u}.json", obj)
        vs_rows = sorted((([opp_, rr_, m_[0], m_[1], round(m_[2] / m_[3]) if m_[3] else None]) for (opp_, rr_), m_ in lane_vs.get(c, {}).items()),
                         key=lambda x: -x[2])
        if vs_rows:
            out.json(f"matchups/{u}.json", {"c": c, "g": sum(x[2] for x in vs_rows), "vs": vs_rows[:400]})
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
            x["gn"] = gid_n.get(gid)
            x["e"] = tname_slug.get(x["t"])
            x["au"] = team_ref(x["a"], x["date"])[1]
            x["bu"] = team_ref(x["b"], x["date"])[1]
    for lst in rec["player"].values():
        for x in lst:
            x["u"] = player_slug.get(x.pop("pk", None))
            gid = x.pop("gid", None)
            x["g"] = gid_slug.get(gid)
            x["gn"] = gid_n.get(gid)
            x["e"] = tname_slug.get(x["t"])
            x.pop("ps", None)
    for lst in [*rec["career"].values(), *rec.get("careerAll", {}).values()]:
        for x in lst:
            x["u"] = player_slug.get(x.pop("pk", None))
            x.pop("ps", None)
    for lst in rec["team"].values():
        for x in lst:
            x["u"] = team_by_name.get(x["team"])
            x.pop("s", None)
    all_pentas = [x for x in all_pentas if x[9]]
    most_pentas = Counter()
    for x in all_pentas:
        most_pentas[x[1]] += x[8]
    rec["pentas"] = {
        "total": sum(x[8] for x in all_pentas),
        "recent": [{"date": d, "n": ctx.pname(pg), "u": player_slug.get(pg), "c": ch, "g": g_, "t": en_, "e": eu_, "a": a_, "b": b_, "x": x_,
                    "gn": n_} for d, pg, ch, g_, en_, eu_, a_, b_, x_, _, n_ in sorted(all_pentas, reverse=True)[:100]],
        "most": [{"n": ctx.pname(pg), "u": player_slug.get(pg), "v": n} for pg, n in most_pentas.most_common(15)],
    }
    out.json("records.json", rec)
    # the all-time #1 rows set in the last two days: the push service's "record broken" alerts (server/push/records.go)
    rec_cut = (datetime.date.today() - datetime.timedelta(days=2)).isoformat()
    rec_new = []
    for sec in ("game", "player", "team"):
        for key, lst in (rec.get(sec) or {}).items():
            if lst and isinstance(lst[0], dict) and (lst[0].get("date") or "") >= rec_cut:
                rec_new.append({"s": sec, "k": key, "r": lst[0]})
    out.json("records_new.json", rec_new)

    # -- the week in one file (hub/weekly.json: the /stats/weekly page, its card, the feed's weekly item) -------------
    wk = sorted(week_series, key=lambda r: (r[0], r[11]), reverse=True)
    upsets = []
    for r in wk:
        p_a = week_chance.get(r[10])
        if p_a is None or r[8] == r[9]:
            continue
        a_won = r[8] > r[9]
        p_w = p_a if a_won else 1 - p_a
        if p_w < 0.4:
            upsets.append({"g": r[10], "date": r[0], "t": r[1], "e": r[2], "w": r[4] if a_won else r[6], "wu": r[5] if a_won else r[7],
                           "l": r[6] if a_won else r[4], "lu": r[7] if a_won else r[5], "s": f"{max(r[8], r[9])}-{min(r[8], r[9])}",
                           "p": round(p_w, 3)})
    upsets.sort(key=lambda x: x["p"])
    week_ago = (datetime.date.fromisoformat(WEEK_TO) - datetime.timedelta(days=7)).isoformat()
    movers = []
    for row in rank_rows:
        pts = [p_ for p_ in rating_hist.get(row[0]) or [] if p_[0] <= week_ago]
        if row[9] == 1 and pts and round(row[5] - pts[-1][1]):
            movers.append({"u": row[0], "n": row[1], "c": row[2], "lg": row[3], "r": round(row[5]), "chg": round(row[5] - pts[-1][1])})
    movers.sort(key=lambda x: -abs(x["chg"]))
    wk_records = []
    for sec in ("game", "player", "team"):
        for key, lst in (rec.get(sec) or {}).items():
            if lst and isinstance(lst[0], dict) and WEEK_FROM <= (lst[0].get("date") or "") <= WEEK_TO:
                wk_records.append({"s": sec, "k": key, "r": lst[0]})
    wk_best = heapq.nlargest(5, [r for r in best_games if WEEK_FROM <= r[3] <= WEEK_TO and r[0] is not None], key=lambda r: r[0])

    # -- player ratings (player_rating.py): the averages the app rates games with, and the week's / month's best ------
    all_prows = [r for rows_ in p_games.values() for r in rows_]
    r_base = prating.baselines(all_prows)
    # the spread of the form part from the last three seasons (today's game, not 2014's)
    r_scale = prating.scale_for([r for r in all_prows if r[0] >= str(int(today[:4]) - 2)], r_base)
    out.json("rating.json", prating.file(r_base, r_scale, today))
    del all_prows
    checks["hub: rating role-years"] = len(r_base)
    # the week's most present champions: picked or banned in the most of its games
    wk_champs = sorted(week_champs["c"].items(), key=lambda x: -(x[1][0] + x[1][1]))[:10]
    # (written once the players of the week are known: they need the league list, further down)
    weekly_doc = {
        "from": WEEK_FROM, "to": WEEK_TO, "series": len(wk), "games": sum(r[8] + r[9] for r in wk), "upsetCount": len(upsets),
        "results": [{"date": r[0], "t": r[1], "e": r[2], "st": r[3], "a": r[4], "au": r[5], "b": r[6], "bu": r[7], "sa": r[8], "sb": r[9],
                     "g": r[10], "i": r[11]} for r in wk[:60]],
        "upsets": upsets[:5],
        "movers": movers[:8],
        "records": wk_records,
        "best": [{"r": round(r[0], 1), "g": r[1], "gn": r[2], "date": r[3], "t": r[4], "e": r[5], "a": r[7], "b": r[9], "w": r[11], "min": r[12]}
                 for r in wk_best],
        # (builds from 0.7.54 on) picks / bans / wins of the most present champions; "players" is added below
        "champs": [[c, v[0], v[1], v[2]] for c, v in wk_champs],
        "champGames": week_champs["games"],
    }
    checks["hub: weekly recap series"] = len(wk)
    for year, ry in (getattr(ctx, "records_by_year", None) or {}).items():
        ry = json.loads(json.dumps(ry, ensure_ascii=False))
        for lst in ry["game"].values():
            for x in lst:
                gid = x.pop("gid", None)
                x["g"] = gid_slug.get(gid)
                x["gn"] = gid_n.get(gid)
                x["e"] = tname_slug.get(x["t"])
                x["au"] = team_ref(x["a"], x["date"])[1]
                x["bu"] = team_ref(x["b"], x["date"])[1]
        for lst in ry["player"].values():
            for x in lst:
                x["u"] = player_slug.get(x.pop("pk", None))
                gid = x.pop("gid", None)
                x["g"] = gid_slug.get(gid)
                x["gn"] = gid_n.get(gid)
                x["e"] = tname_slug.get(x["t"])
                x.pop("ps", None)
        py_ = [x for x in all_pentas if x[0][:4] == year]
        most_y = Counter()
        for x in py_:
            most_y[x[1]] += x[8]
        ry["pentas"] = {
            "total": sum(x[8] for x in py_),
            "recent": [{"date": d, "n": ctx.pname(pg), "u": player_slug.get(pg), "c": ch, "g": g_, "t": en_, "e": eu_, "a": a_, "b": b_, "x": x_,
                        "gn": n_} for d, pg, ch, g_, en_, eu_, a_, b_, x_, _, n_ in sorted(py_, reverse=True)[:60]],
            "most": [{"n": ctx.pname(pg), "u": player_slug.get(pg), "v": n} for pg, n in most_y.most_common(10)],
        }
        ry["year"] = year
        out.json(f"records/{year}.json", ry)
    out.json("titles.json", [{**{k: v for k, v in x.items() if k not in ("fid", "s")}, "u": team_slug.get(x["fid"]), "e": tname_slug.get(x["t"])}
                             for x in ctx.titles])

    # -- patch history: every patch with its games and most present champions --------------------------
    patches_out = []
    for pt, x in sorted(patch_stats.items(), key=lambda kv: (patch_order(kv[0]), kv[1]["to"]), reverse=True):
        if x["g"] < 10:
            continue
        pres = x["pres"]
        patches_out.append({"p": pt, "from": x["from"], "to": x["to"], "g": x["g"],
                            "c": [[ch, x["p"][ch], x["b"][ch], x["w"][ch], n_] for ch, n_ in pres.most_common(12)]})
    # patch movers: biggest changes in presence (picked or banned) against the patch before
    # (both with 30+ games): [champion, presence now, presence before, wins, picks now]
    big = [p_["p"] for p_ in patches_out if p_["g"] >= 30]
    for p_ in patches_out:
        if p_["p"] not in big or big.index(p_["p"]) + 1 >= len(big):
            continue
        now_s, was_s = patch_stats[p_["p"]], patch_stats[big[big.index(p_["p"]) + 1]]
        moves = []
        for ch in set(now_s["pres"]) | set(was_s["pres"]):
            pn = now_s["pres"][ch] / now_s["g"]
            pw = was_s["pres"][ch] / was_s["g"]
            if max(pn, pw) >= 0.1:
                moves.append((pn - pw, [ch, round(pn, 3), round(pw, 3), now_s["w"][ch], now_s["p"][ch]]))
        moves.sort(key=lambda m: m[0])
        p_["prev"] = big[big.index(p_["p"]) + 1]
        p_["up"] = [m[1] for m in reversed(moves[-6:]) if m[0] >= 0.05]
        p_["down"] = [m[1] for m in moves[:6] if m[0] <= -0.05]
    out.json("patches.json", patches_out)

    # -- league history: every tournament of a league with its winner ----------------------------
    # A parent with its own results (Worlds 2025) stands for its stages; a bare grouping page
    # (NA LCS 2014 Season) is replaced by its stages (Spring Season, Spring Playoffs...).
    # A regular season's first place is not the split's title (its playoffs decide that): kept, but marked
    names_all = {x["n"] for lst in events_by_year.values() for x in lst}
    for lst in events_by_year.values():
        for x in lst:
            if x.get("w") and f"{x['n']} Playoffs" in names_all:
                x["rs"] = 1
    with_results = {x["u"] for lst in events_by_year.values() for x in lst if x.get("kids") and x.get("res")}
    league_events = defaultdict(list)
    for year, lst in events_by_year.items():
        for x in lst:
            if not x.get("l"):
                continue
            if x.get("kids") and x["u"] not in with_results:
                continue
            if x.get("p") and x["p"] in with_results:
                continue
            league_events[x["l"]].append({k: v for k, v in x.items() if k not in ("kids", "res", "p")} | {"y": year})
    # the seasons that get a whole-season file below (leagueyear/<league>/<year>.json): the app only asks for those
    season_years = defaultdict(set)
    for k_ in kept.values():
        if k_["lu"] and k_["y"] and k_["y"].isdigit() and k_["tp"]:
            season_years[k_["lu"]].add(k_["y"])
    leagues_out = []
    league_years = {}  # league -> (first year, last year) with games, for history chains without fixed years
    for lg, lst in league_events.items():
        played_y = sorted({(e.get("st") or e.get("en") or e["y"])[:4] for e in lst if e.get("g")} - {""})
        if played_y:
            league_years[lg] = (played_y[0], played_y[-1])

    def league_history(lg):
        """[{l, s, u, y}] of the renamed / merged leagues this one belongs to (leagues_info.HISTORY), or None."""
        chain = leagues_info.history_of(lg)
        if not chain:
            return None
        out_h = []
        for name, years in chain:
            if years is None:
                f_, t_ = league_years.get(name, (None, None))
                years = (f_ if f_ == t_ else f"{f_}–{t_}") if f_ else None
            out_h.append({"l": name, "s": leagues_info.SHORT.get(name), "u": league_slug.get(name), "y": years})
        return out_h

    every_event = defaultdict(set)  # league -> all its event slugs, stages included
    for lst_y in events_by_year.values():
        for x in lst_y:
            if x.get("l"):
                every_event[x["l"]].add(x["u"])
    cur_year = int(today[:4])
    for lg, lst in league_events.items():
        lst.sort(key=lambda e: (e.get("en") or "", e.get("st") or ""), reverse=True)
        event_ids = every_event[lg] | {e["u"] for e in lst}
        wins = Counter()
        for x in ctx.titles:
            if tname_slug.get(x["t"]) in event_ids:
                wins[(ctx.fr_name[x["fid"]], team_slug.get(x["fid"]))] += 1
        lu = league_slug[lg]
        played = [e for e in lst if e.get("g")]
        games_l = sum(e.get("g") or 0 for e in lst)
        intl = (next((e.get("r") for e in lst if e.get("r")), "") or "").lower() == "international"
        # Main list: real leagues and recurring internationals, not one-off shows
        primary = any(e.get("lv") == "Primary" for e in lst) and (games_l >= 100 or (intl and len(played) >= 2))
        years_l = sorted({y for e in (played or lst) for y in [(e.get("st") or e.get("en") or e["y"])[:4]] if y.isdigit()})
        if primary and years_l and int(years_l[-1]) >= cur_year - 1:
            # still running: main only while its recent events are (TCL, VCS, LJL and PCS were, then dropped a tier)
            primary = any(e.get("lv") == "Primary" and int(((e.get("st") or e.get("en") or e["y"])[:4]) or 0) >= cur_year - 1
                          for e in lst if (e.get("st") or e.get("en") or e["y"])[:4].isdigit())
        short_l = leagues_info.SHORT.get(lg)
        if primary and (short_l or intl):
            top_leagues.add(lg)  # players of the week / month (LCK, LEC, Worlds...; not a cup or a college league)
        hist_l = league_history(lg)
        out.json(f"league/{lu}.json", {
            "l": lg, "u": lu, "s": short_l, "history": hist_l, "seasons": sorted(season_years.get(lu, ())),
            "region": next((e.get("r") for e in lst if e.get("r")), None), "primary": primary,
            "events": lst, "titles": [{"t": t_, "u": u_, "n": n_} for (t_, u_), n_ in wins.most_common(30)],
        })
        if not games_l:
            continue  # nothing played yet (or ever): a page, but not in the list
        leagues_out.append({"l": lg, "u": lu, "s": short_l, "r": next((e.get("r") for e in lst if e.get("r")), None), "n": len(lst),
                            "from": years_l[0] if years_l else None, "to": years_l[-1] if years_l else None,
                            "sy": sorted(season_years.get(lu, ())),
                            "pr": 1 if primary else 0, "g": games_l, **({"h": hist_l} if hist_l else {})})
        seo["league"].append((lu, f"{lg} – every season, champions and results | {SITE}",
                              f"{lg}: {len(lst)} tournaments{' from ' + years_l[0] + ' to ' + years_l[-1] if years_l else ''}, "
                              f"every winner and full results, standings and stats.", 1 if primary or len(lst) >= 4 else 0))
    leagues_out.sort(key=lambda x: (-x["pr"], -x["g"]))
    out.json("leagues.json", leagues_out)

    # Best games and series: all time, each year, each league, each league's year (best first, then newest)
    region_main = {}
    for lg_row in leagues_out:
        if lg_row["pr"] and lg_row.get("r"):
            region_main.setdefault(str(lg_row["r"]).lower(), lg_row["u"])
    for rows_, li in ((best_games, 16), (best_series, 14)):
        for r in rows_:
            region = r.pop()
            if not r[li] and region:
                r[li] = region_main.get(str(region).lower())
    # a league's earlier names count as that league (OGN Champions in LCK, NA LCS in LCS...)
    lineage_of = {}
    for lg_row in leagues_out:
        for step in lg_row.get("h") or []:
            if step.get("u") and step["u"] != lg_row["u"]:
                lineage_of.setdefault(step["u"], set()).add(lg_row["u"])

    def top(rows, n):
        return heapq.nlargest(n, rows, key=lambda r: (r[0], r[3] if len(r) > 16 else r[2]))
    year_of_g, year_of_s = (lambda r: r[3][:4]), (lambda r: r[2][:4])
    by_year_g, by_year_s = defaultdict(list), defaultdict(list)
    by_lg_g, by_lg_s = defaultdict(list), defaultdict(list)
    for r in best_games:
        by_year_g[year_of_g(r)].append(r)
        if r[16]:
            for lu_ in {r[16]} | lineage_of.get(r[16], set()):
                by_lg_g[lu_].append(r)
    for r in best_series:
        by_year_s[year_of_s(r)].append(r)
        if r[14]:
            for lu_ in {r[14]} | lineage_of.get(r[14], set()):
                by_lg_s[lu_].append(r)
    out.json("best/all.json", {"g": top(best_games, 300), "s": top(best_series, 200)})
    for y in by_year_g:
        out.json(f"best/{y}.json", {"g": top(by_year_g[y], 200), "s": top(by_year_s.get(y, []), 100)})
    best_leagues = []
    for lg_row in leagues_out:
        lu_ = lg_row["u"]
        rows_g = by_lg_g.get(lu_, [])
        if len(rows_g) < 20:
            continue
        rows_s = by_lg_s.get(lu_, [])
        out.json(f"best/l/{lu_}.json", {"g": top(rows_g, 200), "s": top(rows_s, 100)})
        yg, ys = defaultdict(list), defaultdict(list)
        for r in rows_g:
            yg[year_of_g(r)].append(r)
        for r in rows_s:
            ys[year_of_s(r)].append(r)
        for y in yg:
            out.json(f"best/l/{lu_}/{y}.json", {"g": top(yg[y], 100), "s": top(ys.get(y, []), 50)})
        best_leagues.append([lu_, lg_row["l"], lg_row.get("s"), lg_row["pr"], sorted(yg, reverse=True)])
    out.json("best/index.json", {"years": sorted(by_year_g, reverse=True), "leagues": best_leagues, "n": len(best_games)})
    checks["hub: rated games (MEPI)"] = len(best_games)

    # storylines for the stats home: teams and players whose latest tournament is in a main league
    main_leagues = {l["u"] for l in leagues_out if l["pr"]}
    all_notes.sort(key=lambda x: -x[0])
    # national teams (Asian Games, KeSPA Cup guests) aren't what fans follow week to week
    # the stats home's list: the best first, but no more than 8 of one kind, so it isn't all milestones
    picked, per_kind = [], Counter()
    for _s, lu_n, nt in all_notes:
        if lu_n in main_leagues and "national team" not in nt["name"].lower() and per_kind[nt["k"]] < 8:
            picked.append(nt)
            per_kind[nt["k"]] += 1
        if len(picked) >= 40:
            break
    out.json("notes.json", picked)

    # -- champion game logs per league and year, and their index -----------------------------------
    cg_years = defaultdict(dict)
    for (lu_c, year_c), cg in champ_games.items():
        if not year_c.isdigit():
            continue
        cg["g"].sort(key=lambda x: x[0])
        events_c = [[slug_c, name_c] for slug_c, (_, name_c) in sorted(cg["ev"].items(), key=lambda kv: kv[1][0])]
        out.json(f"champgames/{lu_c}/{year_c}.json", {"events": events_c, "games": cg["g"]})
        cg_years[lu_c][year_c] = len(cg["g"])
    out.json("champgames/index.json", [{"u": l["u"], "l": l["l"], "r": l["r"], "pr": l["pr"], "y": cg_years[l["u"]]}
                                       for l in leagues_out if l["u"] in cg_years])

    # -- head-to-head base for the app's H2H meters (see .github/workflows/h2h-data.yml) ----------
    h2h_out = {"version": 1, "cutoff": (h2h_newest.replace(" ", "T") + ":00Z") if h2h_newest else None,
               "pairs": {f"{a}__{b}": v for (a, b), v in sorted(h2h_pairs.items())}, "series": {},
               # lets the H2H workflow match a team whose lolesports code differs from ours (e.g. "100" / "100T");
               # newest name first
               "names": {c: sorted(n, key=lambda x: n[x], reverse=True) for c, n in sorted(h2h_names.items())}}
    for (a, b), lst in h2h_series.items():
        lst.sort(reverse=True)
        h2h_out["series"][f"{a}__{b}"] = {
            "intl": [sum(x[2] for x in lst if x[4]), sum(x[3] for x in lst if x[4])],
            "recent": [[d, en_, ga, gb] for d, en_, ga, gb, _ in lst[:10]],
        }
    out.json("h2h/base.json", h2h_out)
    checks["hub: h2h pairs"] = len(h2h_pairs)

    # -- a league's whole season (all splits + playoffs) for percentile ranks ------------------------
    by_season = defaultdict(list)
    for op_k, k in kept.items():
        if k["lu"] and k["y"] and k["y"].isdigit() and k["tp"]:
            by_season[(k["lu"], k["y"])].append(k)
    n_seasons = 0
    for (lu_s, y_s), parts_s in by_season.items():
        tp_m, tts_m, tc_m, facts_m, ev_m, tteam_m, regions_m, last_m, n_stats_m = merge_stages(parts_s)
        so = stats_out(tp_m, tts_m, tc_m, facts_m, ev_m, tteam_m, regions_m, last_m)
        out.json(f"leagueyear/{lu_s}/{y_s}.json", {
            "events": [[p["eslug"], p["en"]] for p in sorted(parts_s, key=lambda p: p["last"] or "")],
            "statsGames": n_stats_m, "players": so["players"], "teamStats": so["teamStats"],
        })
        n_seasons += 1
    checks["hub: league seasons"] = n_seasons

    # -- downloads index: league -> year -> tournaments with a CSV ------------------------------------
    names_l = {l["u"]: l for l in leagues_out}
    dl_out = []
    names_l["other-events"] = {"l": "Other events", "r": None, "pr": 0}
    for lu_d, years_d in dl_index.items():
        l = names_l.get(lu_d) or {}
        dl_out.append({"u": lu_d, "l": l.get("l") or "", "r": l.get("r"), "pr": l.get("pr", 0),
                       "g": sum(x[2] for evs in years_d.values() for x in evs),
                       "y": {y: sorted(evs, key=lambda x: x[3]) for y, evs in sorted(years_d.items(), reverse=True)}})
    dl_out.sort(key=lambda x: (-x["pr"], -x["g"]))
    out.json("csv/index.json", dl_out)

    # -- browse, search, home, meta ----------------------------------------------------------
    search_events = []
    for year, lst in events_by_year.items():
        lst.sort(key=lambda x: (x.get("en") or "", x.get("st") or ""), reverse=True)
        out.json(f"events/{year}.json", lst)
        for x in lst:
            if not x.get("g") and (x.get("en") or x.get("st") or "9") < today:
                continue  # over and nothing was played
            search_events.append([x["n"], short_slug(x["n"], x["u"]), year, x.get("l") or "", (x.get("lv") or "")[:1],
                                  x.get("en") or "", x.get("g") or 0])
    search_events.sort(key=lambda x: (x[5] or "", x[6]), reverse=True)
    roster_moves.sort(key=lambda m: (m["d"], m["g"]), reverse=True)
    out.json("moves.json", {"since": moves_cut, "list": roster_moves[:1000]})
    out.json("search/teams.json", search_teams)
    out.json("search/players.json", search_players)
    out.json("search/events.json", search_events)
    out.json("search/champs.json", search_champs)
    league_alias = {}
    for full, short in leagues_info.SHORT.items():
        if full in league_slug and pretty(short) and pretty(short) != league_slug[full] and pretty(short) not in league_slug.values():
            league_alias.setdefault(pretty(short), league_slug[full])
    # A team's short names ("hle", "skt") and its name with the dots as dashes ("gen-g") lead to it too, so typed
    # addresses work (the page service 301s them, the app follows them). A shared short name goes to the team with the
    # most games; a real team slug or an old slug always wins.
    team_slugs_all = {r[1] or pretty(r[0]) for r in search_teams}
    n_short = 0
    for r in sorted(search_teams, key=lambda r: -r[2]):
        u_t = r[1] or pretty(r[0])
        keys = [pretty(c) for c in r[5].split(" | ") if c.strip()]
        if "." in r[0]:
            keys.append(pretty(r[0].replace(".", " ")))
        for k in keys:
            if k and k != u_t and k not in team_slugs_all and k not in alias:
                alias[k] = u_t
                n_short += 1
    checks["hub: team short-name addresses"] = n_short
    out.json("alias.json", {"team": alias, "league": league_alias})

    years = sorted((y for y in events_by_year if y.isdigit()), reverse=True)
    latest_major = [x for y in years[:2] for x in events_by_year[y]
                    if x.get("lv") == "Primary" and not x.get("q") and (x.get("en") or "") <= today and x.get("g", 0) >= 4 and not x.get("p")]
    latest_major.sort(key=lambda x: x.get("en") or "", reverse=True)
    # Running now or starting within two weeks (main leagues and internationals, whole events not stages)
    soon = (datetime.date.today() + datetime.timedelta(days=14)).isoformat()
    # top-level events, plus international invitationals Leaguepedia files as second-level (Demacia Cup), until the
    # day after their last match (it's still that day in the Americas when the build runs)
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    current = [x for y in years[:2] for x in events_by_year[y]
               if (x.get("lv") == "Primary" or (x.get("lv") == "Secondary" and x.get("r") == "International"))
               and not x.get("q") and not x.get("p") and (x.get("st") or "9") <= soon
               and (x.get("en") or "") >= yesterday]
    current.sort(key=lambda x: (x.get("r") != "International", x.get("st") or ""))
    # players of the week and of the month: the best average ratings in the main leagues and international events
    def best_rated(lo, hi, min_g, n):
        keep = lambda r: lo <= r[0] <= hi and event_league.get(r[11]) in top_leagues  # noqa: E731
        return [{"n": ctx.pname(pg), "u": player_slug.get(pg), "t": club_of.get(pg, ("", None))[0], "tu": club_of.get(pg, ("", None))[1],
                 "r": br[10], "g": g_, "rt": avg, "best": {"g": br[1], "gn": br[22], "c": br[2], "rt": bv, "opp": br[8]}}
                for avg, g_, pg, br, bv in prating.leaders(p_games, keep, r_base, r_scale, min_g, n)]

    weekly_doc["players"] = best_rated(WEEK_FROM, WEEK_TO, 2, 5)
    out.json("weekly.json", weekly_doc)
    potm = best_rated(MONTH_FROM, WEEK_TO, 6, 6)
    checks["hub: players of the week"] = len(weekly_doc["players"])
    checks["hub: players of the month"] = len(potm)
    checks["hub: leagues for players of the week"] = len(top_leagues)
    this_year = today[:4]
    busiest = sorted(((x, p) for x, p in ((ctx.players[pg], pg) for pg in ctx.players)
                      if x["years"].get(this_year, {}).get("g", 0) >= 10),
                     key=lambda t: -t[0]["years"][this_year]["g"])[:12]
    home = {
        "latest": latest_major[:12],
        "now": [{k: v for k, v in x.items() if k not in ("w", "wu")} for x in current[:12]],
        "busiest": [{"n": ctx.pname(pg), "u": player_slug.get(pg), "g": x["years"][this_year]["g"], "w": x["years"][this_year]["w"],
                     "kda": kda(x["years"][this_year]["k"], x["years"][this_year]["d"], x["years"][this_year]["a"]),
                     "t": club_of.get(pg, ("", None))[0], "tu": club_of.get(pg, ("", None))[1]} for x, pg in busiest],
        "year": this_year,
        # the best average player ratings of the last 30 days (builds from 0.7.54 on)
        "potm": potm,
        "potmFrom": MONTH_FROM,
    }
    out.json("home.json", home)
    # Headline counts: games with a recorded result (not slots with only a VOD link), and tournaments counted once
    # (Worlds 2025, not also its Play-In and Main Event) with at least one game
    games_played = sum(1 for gm in games_by_op.values() for g in gm.values() if g["w"])
    tournaments_played = sum(1 for lst in events_by_year.values() for x in lst if not x.get("p") and x.get("g"))
    out.json("meta.json", {
        "version": ctx.version, "games": games_played, "statsGames": len(ctx.games),
        "series": n_series_pages, "teams": len(search_teams), "players": len(search_players), "events": tournaments_played,
        "champs": len(search_champs), "years": years,
    })
    # slug, title, description, index flag, and for the bigger pages a few sentences with numbers (page_summary below)
    for kind, rows in seo.items():
        out.text(f"seo/{kind}.tsv", "".join(
            "\t".join([tsv_cell(r[0]), tsv_cell(r[1]), tsv_cell(r[2]), str(r[3])] + ([tsv_cell(r[4])] if len(r) > 4 and r[4] else [])) + "\n"
            for r in rows))
    # Players with a Leaguepedia photo (fetched nightly by photos_lp.py into <out>/photos/<slug>.webp):
    # {slug: "YYYYMMDD"}, so the app shows a picture where Riot has none
    try:
        import photos_lp
        photos = photos_lp.photos_map(ctx.out_root, player_slug)
    except Exception as e:  # noqa: BLE001 - photos are an extra; a build must not fail over them
        print(f"hub: photos map skipped: {e}")
        photos = {}
    out.json("photos.json", photos)
    checks["hub: player photos"] = len(photos)
    checks["hub: players with a Riot photo in their file"] = n_riot_pics
    # Riot's champion / item / spell / rune lists boiled down for the app (dd.json, dd/<language>.json): a few KB
    # instead of Riot's full lists before the first champion picture shows
    try:
        import ddragon_maps
        checks["hub: ddragon languages"] = ddragon_maps.write(out)
    except Exception as e:  # noqa: BLE001 - the app falls back to Riot's own lists
        print(f"hub: ddragon lists skipped: {e}")
        checks["hub: ddragon languages"] = 0
    out.finish()
    # search-engine summaries of the Worlds / MSI / First Stand pages, from the files just written (seo_pages.py)
    try:
        import seo_pages
        checks["hub: search summaries"] = seo_pages.write(out.root)
    except Exception as e:  # noqa: BLE001 - the pages work without them
        print(f"hub: search summaries skipped: {e}")
        checks["hub: search summaries"] = 0
    stats = {"series pages": n_series_pages, "teams": len(search_teams), "players": len(search_players),
             "events": len(search_events), "champions": len(search_champs), "files written": out.written,
             "files linked": out.linked, "MB written": round(out.bytes / 1e6, 1), "seconds": round(time.time() - t0)}
    for k, v in stats.items():
        checks[f"hub: {k}"] = v
    return stats
