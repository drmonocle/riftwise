"""
Oracle's Elixir numbers for the hub's game logs: gold / CS / XP leads at 10, 15 and 20 minutes, first blood,
wards, turret plates, void grubs and the "firsts" (tower, mid tower, three towers, dragon, herald, baron).

The data is Tim Sevenhuysen's (oracleselixir.com), free for non-commercial use with credit; the site credits it
on the About page. It sits in the catalog as oe_analytics_player_game / oe_analytics_team_game, already tied to
Leaguepedia's games by (match_id, game_number). A catalog without those tables, or a game OE doesn't have,
just gives no numbers (null), and the app leaves those games out of these averages.
"""
import sqlite3
from collections import Counter, defaultdict

# leads at 10 / 15 / 20 minutes (the player's lane opponent; the other team for a team row)
P_DIFF = ("golddiffat10", "csdiffat10", "xpdiffat10", "golddiffat15", "csdiffat15", "xpdiffat15",
          "golddiffat20", "csdiffat20", "xpdiffat20")
T_DIFF = ("golddiffat10", "golddiffat15", "golddiffat20", "csdiffat15", "xpdiffat15")
T_FIRST = ("firstblood", "firsttower", "firstmidtower", "firsttothreetowers", "firstdragon", "firstherald", "firstbaron")
GRUBS_FROM = "2024"  # void grubs came in with the 2024 season; earlier rows are zeros, not data


def ival(v):
    return None if v is None else int(round(v))


def load(con, mids, chunks) -> dict:
    """(match_id, game_number) -> [{"p": {champion: row}, "t": {"Blue"/"Red": row}}], one per OE game found."""
    games = defaultdict(dict)
    try:
        for part in chunks(list(mids)):
            q = ",".join("?" * len(part))
            for r in con.execute(
                f"""SELECT match_id, game_number, oe_gameid, side, champion, lp_team, {", ".join(P_DIFF)},
                           firstbloodkill, firstbloodassist, firstbloodvictim, wardsplaced, wardskilled, controlwardsbought
                    FROM oe_analytics_player_game WHERE match_id IN ({q})""", part):
                if r["champion"]:
                    games[(r["match_id"], r["game_number"])].setdefault(r["oe_gameid"], {"p": {}, "t": {}})["p"][r["champion"]] = r
            for r in con.execute(
                f"""SELECT match_id, game_number, oe_gameid, side, lp_team, {", ".join(T_DIFF)}, {", ".join(T_FIRST)},
                           turretplates, opp_turretplates, void_grubs, opp_void_grubs, wardsplaced, wardskilled,
                           controlwardsbought, visionscore
                    FROM oe_analytics_team_game WHERE match_id IN ({q})""", part):
                if r["side"]:
                    games[(r["match_id"], r["game_number"])].setdefault(r["oe_gameid"], {"p": {}, "t": {}})["t"][r["side"]] = r
    except sqlite3.OperationalError:
        return {}
    return {k: list(v.values()) for k, v in games.items()}


def pick(cands, champs):
    """The OE game that is this one: (nearly) the same ten champions; with no scoreboard here, the only candidate."""
    if not cands:
        return None
    if not champs:
        return cands[0] if len(cands) == 1 else None
    best = max(cands, key=lambda e: len(champs & e["p"].keys()))
    return best if len(champs & best["p"].keys()) >= max(1, len(champs) - 2) else None


def team_row(e, name, champs, side):
    """OE's row for one team of the game: by name, else by the side its champions were on, else by our side."""
    for r in e["t"].values():
        if r["lp_team"] and r["lp_team"] == name:
            return r
    sides = Counter(e["p"][c]["side"] for c in champs if c in e["p"])
    s = sides.most_common(1)[0][0] if sides else ("Blue" if side == "blue" else "Red")
    return e["t"].get(s)


def player_tl(r):
    """[gd10, csd10, xpd10, gd15, csd15, xpd15, gd20, csd20, xpd20, first blood (1 got the kill, 2 assisted,
    3 died, 0 none), wards placed, wards killed, control wards bought]; None when OE has nothing for it."""
    fb = None
    if r["firstbloodkill"] is not None:
        fb = 1 if r["firstbloodkill"] else 2 if r["firstbloodassist"] else 3 if r["firstbloodvictim"] else 0
    out = [ival(r[c]) for c in P_DIFF] + [fb, ival(r["wardsplaced"]), ival(r["wardskilled"]), ival(r["controlwardsbought"])]
    return out if any(v is not None for v in out) else None


def team_tl(r, date):
    """[gd10, gd15, gd20, csd15, xpd15, first blood, first tower, first mid tower, first to three towers, first dragon,
    first herald, first baron (1/0), plates, opp plates, grubs, opp grubs, wards placed, wards killed, control wards,
    vision score]; None when OE has nothing for it."""
    grubs = (date or "") >= GRUBS_FROM
    out = ([ival(r[c]) for c in T_DIFF] + [ival(r[c]) for c in T_FIRST]
           + [ival(r["turretplates"]), ival(r["opp_turretplates"]),
              ival(r["void_grubs"]) if grubs else None, ival(r["opp_void_grubs"]) if grubs else None,
              ival(r["wardsplaced"]), ival(r["wardskilled"]), ival(r["controlwardsbought"]), ival(r["visionscore"])])
    return out if any(v is not None for v in out) else None
