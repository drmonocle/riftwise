"""The stats build on the small test databases (make_fixture.py), in seconds instead of the full build's ~8 minutes:
the whole build runs (no downloads), then the data check (audit_data.py) reads what it wrote, and the files every
kind of page needs must be there. Catches a build that crashes or writes broken files before it reaches the server.

  py -3 scripts/stats/test/test_build.py            (exit 0 = good; --keep leaves the output folder for a look)
  py -3 scripts/stats/test/test_build.py --out DIR  (writes the stats into DIR and keeps them: CI serves them to the
                                                     web build for scripts/audit/smoke.mjs)
"""
import gzip
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
STATS = os.path.dirname(HERE)

# a file of every kind the app asks for, from the tournaments in the test database
EXPECT = [
    "latest.json",
    "{v}/hub/team/t1.json",
    "{v}/hub/player/faker.json",
    "{v}/hub/league/lol-champions-korea.json",
    "{v}/hub/event/worlds-2024-main-event.json",
    "{v}/hub/event/worlds-2026-play-in.json",
    "{v}/hub/ratings.json",
    "{v}/hub/records.json",
    "{v}/hub/records_new.json",
    "{v}/hub/weekly.json",
    "{v}/hub/rating.json",
    "{v}/hub/leagues.json",
    "{v}/hub/titles.json",
    "{v}/hub/patches.json",
    "{v}/hub/csv/index.json",
    "{v}/hub/search/teams.json",
    "{v}/hub/search/players.json",
    "{v}/hub/seo/team.tsv",
    "{v}/hub/seo/player.tsv",
    "{v}/hub/seo/event.tsv",
    "{v}/hub/seo/game.tsv",
    "{v}/hub/seo/league.tsv",
    "{v}/hub/seo/champ.tsv",
]


def rating_check() -> str:
    """The player rating on one known game: the app's copy (src/__tests__/playerRating.test.ts) must agree."""
    sys.path.insert(0, STATS)
    import player_rating as pr

    base = {"2026|Mid": {"kp": [0.65, 0.15], "ds": [0.27, 0.06], "gs": [0.22, 0.03], "cs": [8.5, 1.2], "vs": [0.14, 0.04], "dpm": [0.08, 0.04]}}
    # [date, series, champion, k, d, a, won, team, opponent, event, role, event slug, cs, gold, damage, vision,
    #  minutes, team kills, team damage, team gold, team vision]
    row = ["2026-10-20", "s", "Ahri", 5, 1, 7, 1, "T1", "G2", "Worlds", "Mid", "w", 300, 14000, 25000, 40, 32, 18, 80000, 62000, 260]
    got = pr.rate(row, base, 1.2)
    if got != 7.2:
        return f"rating {got}, want 7.2"
    lost = pr.rate(row[:6] + [0] + row[7:], base, 1.2)
    if lost != 6.2:
        return f"rating in a loss {lost}, want 6.2"
    return ""


def copies_check() -> str:
    """Games the catalog has twice are found (build_stats.duplicates): VOD copies of a Leaguepedia series still in
    matches, and the catalog's own "duplicate of" exclusions; same-day rematches are not."""
    import sqlite3
    sys.path.insert(0, STATS)
    import build_stats

    con = sqlite3.connect(":memory:")
    con.execute("""CREATE TABLE all_games (match_id, game_number, overview_page, date_utc, team1, team2, winner,
                   stats_source, catalog_state, catalog_game_id)""")
    con.execute("CREATE TABLE matches (game_id)")
    con.execute("CREATE TABLE excluded_matches (game_id, match_id, game_number, exclude_reason)")
    gpl, day = "2015 GPL Summer", "2015-07-15 11:00:00"
    rows = [
        # the same series on Leaguepedia's two pages: Leaguepedia's scoreboard and the VOD copy
        ("GPL_Stage 1 W4_1", 1, gpl, day, "Mineski", "Bangkok Titans", "Bangkok Titans", "leaguepedia", "in_matches", "lp1"),
        ("GPL_Stage 1 W4_1", 2, gpl, "2015-07-15 12:00:00", "Bangkok Titans", "Mineski", "Bangkok Titans", "leaguepedia", "in_matches", "lp2"),
        ("GPL_Week 4_1", 1, gpl, day, "Mineski", "Bangkok Titans", "Bangkok Titans", "vod_recovered", "in_matches", "v1"),
        ("GPL_Week 4_1", 2, gpl, day, "Mineski", "Bangkok Titans", "Bangkok Titans", "vod_recovered", "in_matches", "v2"),
        # a tiebreaker the same day, both from Leaguepedia: a rematch
        ("GPL_Stage 1 W4_2", 1, gpl, day, "Saigon Jokers", "Mineski", "Mineski", "leaguepedia", "in_matches", "lp3"),
        ("GPL_Tiebreakers_1", 1, gpl, "2015-07-15 15:00:00", "Saigon Jokers", "Mineski", "Saigon Jokers", "leaguepedia", "in_matches", "lp4"),
        # a grand final after the winners' final, both from VODs: a rematch
        ("IPL_Winners Final_1", 1, "IPL", "2012-04-08 21:00:00", "TSM", "CLG", "CLG", "vod_recovered", "in_matches", "v3"),
        ("IPL_Grand Final_1", 1, "IPL", "2012-04-08 23:00:00", "TSM", "CLG", "TSM", "vod_recovered", "in_matches", "v4"),
        # a VOD series with a game Leaguepedia doesn't have: not a copy
        ("GPL_Stage 1 W4_3", 1, gpl, day, "ZOTAC United", "Full Louis", "Full Louis", "leaguepedia", "in_matches", "lp5"),
        ("GPL_Week 4_3", 1, gpl, day, "ZOTAC United", "Full Louis", "Full Louis", "vod_recovered", "in_matches", "v5"),
        ("GPL_Week 4_3", 2, gpl, day, "ZOTAC United", "Full Louis", "ZOTAC United", "vod_recovered", "in_matches", "v6"),
        # all_games out of date: it says both are in matches, but the catalog already left Leaguepedia's out
        ("GPL_Stage 1 W4_4", 1, gpl, day, "Hanoi Fate", "Mineski", "Hanoi Fate", "leaguepedia", "in_matches", "lp6"),
        ("GPL_Week 4_4", 1, gpl, day, "Hanoi Fate", "Mineski", "Hanoi Fate", "vod_recovered", "in_matches", "v7"),
        # the catalog's own decision: the Week page's copy left out as a duplicate, its series has nothing left
        ("GPL_Stage 1 W4_5", 1, gpl, day, "Go To Sleep", "Mineski", "Mineski", "leaguepedia", "in_matches", "lp7"),
        ("GPL_Week 4_5", 1, gpl, day, "Go To Sleep", "Mineski", "Mineski", "vod_recovered", "excluded", "v8"),
    ]
    con.executemany("INSERT INTO all_games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
    con.executemany("INSERT INTO matches VALUES (?)", [(r[9],) for r in rows if r[9] not in ("lp6", "v8")])
    con.execute("INSERT INTO excluded_matches VALUES ('lp6', 'GPL_Stage 1 W4_4', 1, 'duplicate of v7')")
    con.execute("INSERT INTO excluded_matches VALUES ('v8', 'GPL_Week 4_5', 1, 'duplicate of lp7')")
    d = build_stats.duplicates(con)
    want_rows = {("GPL_Week 4_1", 1), ("GPL_Week 4_1", 2), ("GPL_Stage 1 W4_4", 1), ("GPL_Week 4_5", 1)}
    want_series = {"GPL_Week 4_1", "GPL_Stage 1 W4_4", "GPL_Week 4_5"}
    if d.copies != {"v1": "lp1", "v2": "lp2"} or d.rows != want_rows or d.series != want_series:
        return f"found copies {d.copies}, rows {sorted(d.rows)}, series {sorted(d.series)}"
    return ""


def main() -> int:
    bad = rating_check()
    if bad:
        print(f"FAIL: player rating: {bad}")
        return 1
    bad = copies_check()
    if bad:
        print(f"FAIL: VOD copies: {bad}")
        return 1
    keep = "--keep" in sys.argv
    out_dir = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    work = tempfile.mkdtemp(prefix="riftwise-stats-test-")
    t0 = time.time()
    try:
        for name in ("fixture.db", "fixture_lp.db"):
            with gzip.open(os.path.join(HERE, name + ".gz"), "rb") as f, open(os.path.join(work, name), "wb") as g:
                shutil.copyfileobj(f, g)
        with gzip.open(os.path.join(HERE, "fixture_lists.json.gz"), "rt", encoding="utf-8") as f:
            lists = json.load(f)
        for key in ("team_renames", "team_shorts"):
            with open(os.path.join(work, key + ".json"), "w", encoding="utf-8") as f:
                json.dump(lists[key], f, ensure_ascii=False)
        out = os.path.abspath(out_dir) if out_dir else os.path.join(work, "out")
        build = subprocess.run(
            [sys.executable, "-u", os.path.join(STATS, "build_stats.py"), "--db", os.path.join(work, "fixture.db"),
             "--lp-db", os.path.join(work, "fixture_lp.db"), "--out", out,
             "--renames-cache", os.path.join(work, "team_renames.json"), "--offline"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            env={**os.environ, "RIFTWISE_WEEK_TO": "2026-10-17"})  # the test games' last week (weekly.json)
        print(build.stdout[-3000:])
        if build.returncode != 0 or "\ndone: " not in "\n" + build.stdout:
            print(build.stderr[-6000:])
            print(f"FAIL: the build exited {build.returncode}")
            return 1
        with open(os.path.join(out, "latest.json"), encoding="utf-8") as f:
            v = json.load(f)["version"]
        missing = [p.format(v=v) for p in EXPECT if not os.path.exists(os.path.join(out, p.format(v=v)))]
        if missing:
            print("FAIL: the build didn't write " + ", ".join(missing))
            return 1
        with open(os.path.join(out, v, "hub", "weekly.json"), encoding="utf-8") as f:
            week = json.load(f)
        if not week["series"] or not week["results"]:
            print(f"FAIL: weekly.json has no series for {week['from']} to {week['to']}")
            return 1
        if not week.get("players") or not week.get("champs"):
            print("FAIL: weekly.json has no players of the week or champions")
            return 1
        with open(os.path.join(out, v, "hub", "rating.json"), encoding="utf-8") as f:
            rating = json.load(f)
        if not rating.get("base", {}).get("all|Mid") or not 0.3 < rating.get("scale", 0) < 5:
            print(f"FAIL: rating.json: scale {rating.get('scale')}, roles {sorted(rating.get('base', {}))[:6]}")
            return 1
        audit = subprocess.run([sys.executable, "-u", os.path.join(STATS, "audit_data.py"), out],
                               capture_output=True, text=True, encoding="utf-8", errors="replace")
        print(audit.stdout[-2500:])
        if audit.returncode != 0:
            print(audit.stderr[-3000:])
            print("FAIL: the data check found broken files")
            return 1
        print(f"ok: test build {v} checked in {time.time() - t0:.0f}s")
        return 0
    finally:
        if keep:
            print(f"output kept in {work}")
        else:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
