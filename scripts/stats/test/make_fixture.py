"""Cuts the small test databases (fixture.db + fixture_lp.db, next to this file) out of a full catalog: every table the
stats build reads (gzipped), kept to a handful of tournaments chosen to reach most of the build's code (pre-2014 games without
Oracle's Elixir data, an international event with Play-In and knockouts, a league split and its playoffs, the current
season). The full build takes ~8 minutes; on these it takes seconds (test_build.py).

  py -3 scripts/stats/test/make_fixture.py --db C:/Users/TV/Tools/riftwatch-hub-dev/catalog_mepi.db --lp-db C:/Users/TV/Tools/riftwatch-hub-dev/lp_all_games.db

Re-run it when the build starts reading another table (the build fails on the fixture with "no such table").
"""
import argparse
import gzip
import json
import os
import shutil
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))

TOURNAMENTS = [
    "Season 3 World Championship",
    "2024 Season World Championship/Play-In",
    "2024 Season World Championship/Main Event",
    "2024 Mid-Season Invitational",
    "LCK/2024 Season/Summer Season",
    "LCK/2024 Season/Summer Playoffs",
    "LPL/2018 Season/Summer Playoffs",
    "2026 Season World Championship/Play-In",
    "LCK/2026 Season/Season Playoffs",
    "LEC/2026 Season/Summer Playoffs",
]

# catalog tables the build reads, and how each is cut: by the chosen games, the chosen tournaments, or kept whole
# (small reference tables: names, redirects, teams, champions)
CATALOG = {
    "matches": "game",
    "team_game_stats": "game",
    "player_game_stats": "game",
    "all_games": "overview_page",
    "game_drafts_lp": "overview_page",
    "oe_analytics_team_game": "overview_page",
    "oe_analytics_player_game": "overview_page",
    "lp_scoreboard_games": "OverviewPage",
    "lp_scoreboard_players": "pentakills",  # the build only reads its pentakill rows
    "lp_standings": "OverviewPage+",
    "lp_tournament_players": "OverviewPage",
    "lp_tournament_results": "OverviewPage+",
    "lp_tournament_rosters": "OverviewPage+",
    "lp_tournaments": "OverviewPage+",
    "lp_players": "player",
    "lp_teams": "whole",
    "lp_team_redirects": "whole",
    "lp_champions": "whole",
    "player_pages_map": "player:page",
    "player_redirects": "player:canonical_page",
}
SIDECAR = {"lp_match_schedule": "OverviewPage+"}


def copy_table(src, dst, table, where, args=()):
    sql = src.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
    if not sql:
        raise SystemExit(f"{table}: not in the source database")
    dst.execute(sql[0])
    cols = [r[1] for r in src.execute(f'PRAGMA table_info("{table}")')]
    rows = src.execute(f'SELECT * FROM "{table}" {where}', args).fetchall()
    dst.executemany(f'INSERT INTO "{table}" VALUES ({",".join("?" * len(cols))})', rows)
    print(f"  {table}: {len(rows)} rows")


def in_list(col, values):
    return f'WHERE "{col}" IN ({",".join("?" * len(values))})', tuple(values)


def cut(src, dst, tables, games, pages_plus, players):
    for table, how in tables.items():
        if how == "game":
            copy_table(src, dst, table, *in_list("game_id", games))
        elif how in ("overview_page", "OverviewPage"):
            copy_table(src, dst, table, *in_list(how, TOURNAMENTS))
        elif how == "OverviewPage+":
            copy_table(src, dst, table, *in_list("OverviewPage", pages_plus))
        elif how == "player":
            copy_table(src, dst, table, *in_list("OverviewPage", players))
        elif how.startswith("player:"):
            copy_table(src, dst, table, *in_list(how[7:], players))
        elif how == "pentakills":
            where, a = in_list("OverviewPage", TOURNAMENTS)
            copy_table(src, dst, table, where + " AND Pentakills > 0", a)
        else:
            copy_table(src, dst, table, "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True, help="the full pro_games_catalog.db (or a copy)")
    ap.add_argument("--lp-db", required=True, help="the full lp_all_games.db")
    ap.add_argument("--caches", default="C:/Users/TV/Tools/riftwatch-hub-dev",
                    help="folder with team_renames.json and team_shorts.json (Leaguepedia copies a build saved)")
    args = ap.parse_args()
    src = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    games = [g for (g,) in src.execute(f"SELECT game_id FROM matches {in_list('overview_page', TOURNAMENTS)[0]}", TOURNAMENTS)]
    # the tournaments, and the pages they sit under (2024 Season World Championship, LCK/2024 Season): event and
    # league pages are built from those too
    pages_plus = set(TOURNAMENTS)
    for t in TOURNAMENTS:
        parts = t.split("/")
        pages_plus |= {"/".join(parts[:i]) for i in range(1, len(parts))}
    pages_plus = sorted(pages_plus)
    players = sorted({p for (p,) in src.execute(
        f"SELECT DISTINCT page_key FROM player_game_stats {in_list('game_id', games)[0]} AND page_key IS NOT NULL", games)} |
        {p for (p,) in src.execute(
            f"SELECT DISTINCT Link FROM lp_tournament_players {in_list('OverviewPage', TOURNAMENTS)[0]} AND Link IS NOT NULL", TOURNAMENTS)})
    print(f"{len(games)} games, {len(pages_plus)} tournament pages, {len(players)} players")

    # the Leaguepedia lists the build downloads (an --offline build reads these): this slice's teams only
    teams = {t for (t,) in src.execute(f"SELECT team1 FROM matches {in_list('game_id', games)[0]} UNION SELECT team2 FROM matches "
                                       f"{in_list('game_id', games)[0]}", games + games)}
    with open(os.path.join(args.caches, "team_renames.json"), encoding="utf-8") as f:
        renames = [r for r in json.load(f) if r.get("OriginalName") in teams or r.get("NewName") in teams]
    with open(os.path.join(args.caches, "team_shorts.json"), encoding="utf-8") as f:
        shorts = {n: s for n, s in json.load(f).items() if n in teams}
    with gzip.open(os.path.join(HERE, "fixture_lists.json.gz"), "wt", encoding="utf-8") as f:
        json.dump({"team_renames": renames, "team_shorts": shorts}, f, ensure_ascii=False)
    print(f"fixture_lists.json.gz: {len(renames)} renames, {len(shorts)} short names")

    for name, source, tables in (("fixture.db", src, CATALOG), ("fixture_lp.db", sqlite3.connect(f"file:{args.lp_db}?mode=ro", uri=True), SIDECAR)):
        path = os.path.join(HERE, name)
        if os.path.exists(path):
            os.remove(path)
        dst = sqlite3.connect(path)
        print(name)
        cut(source, dst, tables, games, pages_plus, players)
        dst.commit()
        dst.execute("VACUUM")
        dst.close()
        # kept gzipped in the repository; test_build.py unpacks it
        with open(path, "rb") as f, gzip.open(path + ".gz", "wb", 9) as g:
            shutil.copyfileobj(f, g)
        os.remove(path)
        print(f"  {os.path.getsize(path + '.gz') / 1e6:.1f} MB gzipped")


if __name__ == "__main__":
    main()
