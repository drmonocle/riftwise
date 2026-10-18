"""Scoreboards from Oracle's Elixir for games the catalog has none for.

Some games (all 16 of the Worlds 2023 quarterfinals, for one) have a result in `matches` but no rows in
`player_game_stats` / `team_game_stats`, while Oracle's Elixir (`oe_analytics_player_game` / `oe_analytics_team_game`)
has the whole scoreboard. Without it those games are missing from every stat: Gen.G's 2-3 quarterfinal loss didn't
count in their Worlds 2023 record.

install(con) fills them in for this build only: it adds TEMP tables with the Oracle's Elixir rows in the catalog's
format and TEMP views named like the catalog tables (a TEMP view hides the table of the same name), so every query
of build_stats.py and hub.py sees the filled games. The database itself is opened read-only and never changes.
Games that already have a scoreboard are never touched.
"""
import json
from collections import Counter, defaultdict

ROLE = {"top": "Top", "jng": "Jungle", "mid": "Mid", "bot": "Bot", "sup": "Support"}


def _cols(con, table):
    return [r[1] for r in con.execute(f"PRAGMA main.table_info({table})")]


def install(con, log=print) -> dict:
    """Returns {catalog game id: minutes} of the games it filled."""
    # games with a result but no player rows, that Oracle's Elixir has ten players for
    con.execute("DROP TABLE IF EXISTS temp.oe_fill")
    con.execute("""CREATE TEMP TABLE oe_fill (game_id TEXT PRIMARY KEY, match_id TEXT, game_number INTEGER,
                   minutes REAL, k1 INTEGER, k2 INTEGER, blue TEXT)""")
    todo = con.execute("""
        SELECT m.game_id, m.match_id, m.game_number, m.team1, m.team2 FROM main.matches m
        WHERE m.match_id IS NOT NULL AND m.game_number IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM main.player_game_stats p WHERE p.game_id = m.game_id)
          AND (SELECT COUNT(*) FROM main.oe_analytics_player_game o
               WHERE o.match_id = m.match_id AND o.game_number = m.game_number) = 10""").fetchall()
    todo = [(gid, mid, n) for gid, mid, n, _t1, _t2 in todo]

    # games only in all_games (Leaguepedia's schedule, no catalog game: 2022 MSI's group stage, for one) with a result and
    # Oracle's Elixir's ten players: they get a matches row too, so they count like any other game
    mcols = _cols(con, "matches")
    con.execute("DROP TABLE IF EXISTS temp.oe_matches")
    con.execute("CREATE TEMP TABLE oe_matches AS SELECT * FROM main.matches WHERE 0")
    tier_of = {}
    for op, tier, cnt in con.execute("""SELECT overview_page, tournament_tier, COUNT(*) FROM main.matches
                                        WHERE tournament_tier IS NOT NULL GROUP BY 1, 2"""):
        if op not in tier_of or cnt > tier_of[op][1]:
            tier_of[op] = (tier, cnt)
    new_games = {}
    for mid, n in con.execute("""
            SELECT o.match_id, o.game_number FROM main.oe_analytics_player_game o
            WHERE o.match_id IS NOT NULL AND o.game_number IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM main.matches m WHERE m.match_id = o.match_id AND m.game_number = o.game_number)
            GROUP BY 1, 2 HAVING COUNT(*) = 10""").fetchall():
        a = con.execute("""SELECT tournament_name, overview_page, date_utc, patch, team1, team2, winner, best_of, is_remake
                           FROM main.all_games WHERE match_id = ? AND game_number = ?""", (mid, n)).fetchone()
        if not a or not a[4] or not a[5] or a[6] not in (a[4], a[5]) or a[8]:
            continue
        gid = f"{mid}_G{n}"
        if con.execute("SELECT 1 FROM main.matches WHERE game_id = ?", (gid,)).fetchone():
            continue
        op = a[1] or ""
        if op not in tier_of:
            continue  # a tournament the catalog leaves out (show events, invitationals it never took)
        tab = mid[len(op) + 1:].rsplit("_", 1)[0] if op and mid.startswith(op + "_") else None
        new_games[gid] = {"game_id": gid, "match_id": mid, "game_number": n, "tournament_name": a[0], "overview_page": op,
                          "tournament_tier": (tier_of.get(op) or (None,))[0], "stage_tab": tab, "date_utc": a[2], "patch": a[3],
                          "team1": a[4], "team2": a[5], "winner": a[6], "best_of": a[7]}
        todo.append((gid, mid, n))
    if not todo:
        _views(con)
        return {}

    players = defaultdict(list)
    for gid, mid, n in todo:
        for r in con.execute("""SELECT lp_team, teamname, side, position, playername, lp_page, champion, kills, deaths, assists,
                                       totalgold, total_cs, damagetochampions, visionscore, result, gamelength
                                FROM main.oe_analytics_player_game WHERE match_id = ? AND game_number = ?""", (mid, n)):
            players[gid].append(r)

    # a player's page: the one the catalog uses for that name (on that team if it can tell), else a redirect, else the name
    names = {r[4].lower() for rows in players.values() for r in rows if r[4]}
    by_name = defaultdict(Counter)        # name -> Counter((page, team))
    names_l = sorted(names)
    for i in range(0, len(names_l), 500):
        chunk = names_l[i:i + 500]
        q = ",".join("?" * len(chunk))
        for nm, page, team, cnt in con.execute(
                f"""SELECT lower(raw_name), page_key, team, COUNT(*) FROM main.player_game_stats
                    WHERE lower(raw_name) IN ({q}) AND page_key IS NOT NULL GROUP BY 1, 2, 3""", chunk):
            by_name[nm][(page, team)] += cnt
    redirect = {}
    try:
        for alias, page in con.execute("SELECT lower(alias), canonical_page FROM main.player_redirects WHERE canonical_page IS NOT NULL"):
            if alias in names:
                redirect[alias] = page
    except Exception:
        pass

    def page_of(name, lp_page, team):
        if lp_page:
            return lp_page
        if not name:
            return None
        seen = by_name.get(name.lower())
        if seen:
            same_team = [(c, p) for (p, t), c in seen.items() if t == team]
            if same_team:
                return max(same_team)[1]
            per_page = Counter()
            for (p, _t), c in seen.items():
                per_page[p] += c
            return per_page.most_common(1)[0][0]
        return redirect.get(name.lower(), name)

    pcols = _cols(con, "player_game_stats")
    tcols = _cols(con, "team_game_stats")
    con.execute("DROP TABLE IF EXISTS temp.oe_pgs")
    con.execute("CREATE TEMP TABLE oe_pgs AS SELECT * FROM main.player_game_stats WHERE 0")
    con.execute("DROP TABLE IF EXISTS temp.oe_tgs")
    con.execute("CREATE TEMP TABLE oe_tgs AS SELECT * FROM main.team_game_stats WHERE 0")
    filled = {}
    for gid, mid, n in todo:
        rows = players[gid]
        side_team = {}
        for r in rows:
            side_team.setdefault(r[2], r[0] or r[1])
        blue, red = side_team.get("Blue"), side_team.get("Red")
        if not blue or not red:
            continue
        secs = max((r[15] or 0) for r in rows)
        k = {"Blue": 0, "Red": 0}
        for r in rows:
            k[r[2]] += r[7] or 0
            team = r[0] or r[1]
            row = {
                "game_id": gid, "team": team, "raw_name": r[4], "page_key": page_of(r[4], r[5], team),
                "role": ROLE.get((r[3] or "").lower()), "side": 1 if r[2] == "Blue" else 2, "champion": r[6],
                "kills": r[7], "deaths": r[8], "assists": r[9], "gold": r[10], "cs": r[11], "damage": r[12],
                "vision": r[13], "win": r[14],
            }
            con.execute(f"INSERT INTO temp.oe_pgs ({','.join(pcols)}) VALUES ({','.join('?' * len(pcols))})",
                        [row.get(c) for c in pcols])
        cur = con.execute("SELECT * FROM main.oe_analytics_team_game WHERE match_id = ? AND game_number = ?", (mid, n))
        heads = [d[0] for d in cur.description]
        t = {x["side"]: x for x in (dict(zip(heads, v)) for v in cur.fetchall())}
        if "Blue" in t and "Red" in t:
            b, rd = t["Blue"], t["Red"]

            def picks(x, kind):
                return json.dumps([x.get(f"{kind}{i}") for i in range(1, 6) if x.get(f"{kind}{i}")])

            trow = {
                "game_id": gid, "team1": blue, "team2": red,
                "team1_bans": picks(b, "ban"), "team2_bans": picks(rd, "ban"),
                "team1_picks": picks(b, "pick"), "team2_picks": picks(rd, "pick"),
                "team1_dragons": b.get("dragons"), "team2_dragons": rd.get("dragons"),
                "team1_barons": b.get("barons"), "team2_barons": rd.get("barons"),
                "team1_towers": b.get("towers"), "team2_towers": rd.get("towers"),
                "team1_inhibitors": b.get("inhibitors"), "team2_inhibitors": rd.get("inhibitors"),
                "team1_heralds": b.get("heralds"), "team2_heralds": rd.get("heralds"),
                "team1_gold": b.get("totalgold"), "team2_gold": rd.get("totalgold"),
                "team1_kills": b.get("kills"), "team2_kills": rd.get("kills"),
                "gamelength": f"{secs // 60}:{secs % 60:02d}" if secs else None, "patch": b.get("patch"),
            }
            if not con.execute("SELECT 1 FROM main.team_game_stats WHERE game_id = ?", (gid,)).fetchone():
                con.execute(f"INSERT INTO temp.oe_tgs ({','.join(tcols)}) VALUES ({','.join('?' * len(tcols))})",
                            [trow.get(c) for c in tcols])
        minutes = round(secs / 60, 2) if secs else None
        if gid in new_games:
            m = new_games[gid]
            k1, k2 = (k["Blue"], k["Red"]) if blue == m["team1"] else (k["Red"], k["Blue"])
            m.update({"duration_minutes": minutes, "team1_kills": k1, "team2_kills": k2, "total_kills": k1 + k2})
            con.execute(f"INSERT INTO temp.oe_matches ({','.join(mcols)}) VALUES ({','.join('?' * len(mcols))})",
                        [m.get(c) for c in mcols])
        else:
            con.execute("INSERT INTO temp.oe_fill VALUES (?, ?, ?, ?, ?, ?, ?)", (gid, mid, n, minutes, k["Blue"], k["Red"], blue))
        filled[gid] = minutes
    _views(con)
    log(f"Oracle's Elixir filled {len(filled)} games without a scoreboard ({sum(1 for g in filled if g in new_games)} "
        f"of them only in Leaguepedia's schedule)")
    return filled


def _views(con):
    """TEMP views named like the catalog tables: the catalog's rows plus the filled ones."""
    mcols = _cols(con, "matches")
    have = {r[0] for r in con.execute("SELECT name FROM temp.sqlite_master WHERE type = 'table'")}
    for v in ("player_game_stats", "team_game_stats", "matches"):
        con.execute(f"DROP VIEW IF EXISTS temp.{v}")
    if "oe_pgs" in have:
        con.execute("CREATE TEMP VIEW player_game_stats AS SELECT * FROM main.player_game_stats UNION ALL SELECT * FROM temp.oe_pgs")
    if "oe_tgs" in have:
        con.execute("CREATE TEMP VIEW team_game_stats AS SELECT * FROM main.team_game_stats UNION ALL SELECT * FROM temp.oe_tgs")
    if "oe_fill" in have:
        # the filled games' length and kills from Oracle's Elixir (the catalog has a placeholder 30 minutes and no kills);
        # team1 is the blue side in both, so the kills go the same way round
        over = {
            "duration_minutes": "COALESCE(f.minutes, m.duration_minutes)",
            "team1_kills": "CASE WHEN f.game_id IS NULL THEN m.team1_kills WHEN f.blue = m.team1 THEN f.k1 ELSE f.k2 END",
            "team2_kills": "CASE WHEN f.game_id IS NULL THEN m.team2_kills WHEN f.blue = m.team1 THEN f.k2 ELSE f.k1 END",
            "total_kills": "CASE WHEN f.game_id IS NULL THEN m.total_kills ELSE f.k1 + f.k2 END",
        }
        sel = ", ".join(f"{over[c]} AS {c}" if c in over else f"m.{c} AS {c}" for c in mcols)
        extra = " UNION ALL SELECT * FROM temp.oe_matches" if "oe_matches" in have else ""
        con.execute(f"CREATE TEMP VIEW matches AS SELECT {sel} FROM main.matches m LEFT JOIN temp.oe_fill f ON f.game_id = m.game_id{extra}")
