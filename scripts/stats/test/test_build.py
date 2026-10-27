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


def main() -> int:
    bad = rating_check()
    if bad:
        print(f"FAIL: player rating: {bad}")
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
