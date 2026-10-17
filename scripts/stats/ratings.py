"""Team strength ratings for win chances and power rankings (all regions on one scale).

Elo, one update per game, over every pro game with a result since 2011, for teams and for players:
- a team's strength is mostly (PW) the average rating of the five players in its lineup, plus its own team rating;
  so a roster change shows up straight away (games without a known lineup use the team rating alone);
- a team's home league is the league it played most games in that year (so EMEA Masters or a regional
  qualifier never becomes one);
- a team new to a league starts a little below that league's current average; a team with no league yet (national
  teams, a first international game) starts UNKNOWN_REL below the average top-league team;
- a player seen for the first time starts a little below their team;
- at the start of each year every team is pulled part of the way back to its league's average and every player part
  of the way back to their team (rosters change); after a break of GAP_DAYS a team is pulled back a little and moves
  faster for its next GAP_GAMES games; a lineup with 2+ new players pulls the team rating back a little too;
- blue side is worth BLUE points; a win by a bigger gold lead moves ratings more (MOV_X);
- international games are what move whole regions against each other, so they count a bit more;
- second-tier leagues (LCK CL, LFL, NACL ...) never play the top leagues, so their scale would drift on its own:
  at the start of each year their average is set TIER2_GAP below the average of their region's top league(s),
  and a top-league team's rating does not move in the odd game against a second-tier team (cups, qualifiers);
- a team promoted from a second-tier league starts at least just below its new league's average.
Chances are calibrated on past games: a rating difference counts CONF_TOP for two top-league teams, CONF_INTL at
international events and CONF_OTHER elsewhere (closer games are more random among the best teams), and a series is
less certain than its games multiplied out (SERIES: each game's edge over 50% is scaled before combining). Published
ratings are CONF_TOP x strength, so 1 / (1 + 10 ** (-difference / 400)) is the chance between two top-league teams;
hub.py publishes the other factors relative to it ("adjust" in ratings.json) for the app.

Tuned 2026-10-16 on 2022-23 games, checked on 2024-26 games (log loss 0.636 -> 0.623, favourite won 64.7% -> 65.9%).
`run` also tests itself: before each game from TEST_FROM on it records the chance it gave team a, so the site
can say how often the favourite actually won. Standard library only; hub.py calls `run` and writes hub/ratings.json.
"""
import math
from collections import Counter, defaultdict
from datetime import date

K = 48.0             # points per game for an established team
K_NEW = 96.0         # ... for its first NEW_GAMES games (find its level quickly)
NEW_GAMES = 8
K_INTL = 1.6         # international games count this much more
NEW_OFFSET = -60.0   # new team vs its league's average
UNKNOWN_REL = -450.0 # team with no league yet vs the average active top-league team
NEW_UNKNOWN = 1350.0 # ... when there is no such average yet (2011)
MIN_LEAGUE = 4
YEAR_REGRESS = 0.3   # share of the way back to the league average at the start of a year
TIER2_GAP = 500.0    # second-tier league average below its region's top league(s)
PROMOTE = True       # a team moving up from a second-tier league starts at least at its new league's average + NEW_OFFSET
K_CROSS_TOP = 0.0    # a top-league team's K in a game against a second-tier team (0: those games don't move it)
BLUE = 20.0          # blue side advantage in rating points (blue won 53% of pro games)
MOV_X = 0.3          # K x (winner's gold lead / MOV_REF) ** MOV_X, kept between MOV_MIN and MOV_MAX
MOV_REF = 8000.0
MOV_MIN = 0.3
MOV_MAX = 2.5
PW = 0.85            # weight of the lineup's player ratings in a team's strength
KP = 40.0            # points per game for a player
KP_NEW = 96.0        # ... for his first P_NEW games
P_NEW = 5
P_NEW_OFFSET = -60.0 # new player vs their team
P_REGRESS = 0.3      # share of the way back to their team at the start of a year
P_MIN = 4            # players needed in a lineup to use the player ratings
ROSTER_REG = 0.1     # 2+ new players vs the last lineup: share of the way back to the league average
GAP_DAYS = 60        # a break this long (between splits) ...
GAP_REG = 0.15       # ... pulls the team this share back to its league average
GAP_K = 2.0          # ... and its K is this much bigger
GAP_GAMES = 6        # ... for this many games
CONF_TOP = 0.80      # how much a strength difference counts between two top-league teams (= published scale)
CONF_INTL = 0.72     # ... at international events
CONF_OTHER = 0.94    # ... in every other game (second-tier and smaller leagues)
SERIES = {3: 0.85, 5: 0.70}  # a series: each game's edge over 50% is multiplied by this before combining
SCALE = 400.0
ACTIVE_DAYS = 400    # a team counts toward its league's average for this long after its last game
TEST_FROM = "2024-01-01"
REGION_ALIASES = {"Europe": "EMEA", "Americas": "North America", "Oceania": "OCE", "LAT": "Latin America"}


def expected(ra, rb):
    """Chance that a team rated ra beats one rated rb in one game (published ratings)."""
    return 1.0 / (1.0 + 10.0 ** ((rb - ra) / 400.0))


def series_chance(p, bo):
    """Chance to win a best-of-`bo` series when each game is won with chance p."""
    need = bo // 2 + 1
    return sum(math.comb(need - 1 + k, k) * p ** need * (1 - p) ** k for k in range(need))


_ordinal = {}


def _days(a, b):
    """Days from date a to date b ("YYYY-MM-DD")."""
    for d in (a, b):
        if d not in _ordinal:
            _ordinal[d] = date.fromisoformat(d[:10]).toordinal()
    return _ordinal[b] - _ordinal[a]


def run(games, test_from=TEST_FROM, series_out=None, **kw):
    """games: iterable of (date "YYYY-MM-DD[...]", league, international 0/1, team a, team b, a won 0/1,
    tier 1/2 (top league or not), region) and optionally (a on blue side 1/0/None, gold a - gold b or None,
    minutes or None, players of a, players of b).
    Returns (teams, tests, leagues): teams = {team: {"r" (published strength), "g", "last", "league",
    "hist": [(date, published strength)]}},
    tests = [(date, chance given to team a, a won, international, both established, tier of a, tier of b)]
    (tier of each team's home league: 1 top, 2 second tier, 0 none yet),
    leagues = {league: (tier, region)} as last seen.
    series_out (a list) gets every best-of-3 and best-of-5 from test_from on (games of the same two teams on the same
    day): (date, chance given to team a to win it, best of, a won it, context "top"/"intl"/"other")."""
    p = dict(K=K, K_NEW=K_NEW, NEW_GAMES=NEW_GAMES, K_INTL=K_INTL, NEW_OFFSET=NEW_OFFSET, UNKNOWN_REL=UNKNOWN_REL,
             NEW_UNKNOWN=NEW_UNKNOWN, YEAR_REGRESS=YEAR_REGRESS, TIER2_GAP=TIER2_GAP, PROMOTE=PROMOTE,
             K_CROSS_TOP=K_CROSS_TOP, BLUE=BLUE, MOV_X=MOV_X, PW=PW, KP=KP, KP_NEW=KP_NEW, P_NEW=P_NEW,
             P_NEW_OFFSET=P_NEW_OFFSET, P_REGRESS=P_REGRESS, ROSTER_REG=ROSTER_REG, GAP_DAYS=GAP_DAYS,
             GAP_REG=GAP_REG, GAP_K=GAP_K, GAP_GAMES=GAP_GAMES, CONF_TOP=CONF_TOP, CONF_INTL=CONF_INTL,
             CONF_OTHER=CONF_OTHER)
    p.update(kw)
    pw = p["PW"]
    teams = {}
    members = defaultdict(set)  # league -> teams whose home league it is
    league_info = {}            # league -> (tier, region)
    anchored = {}               # second-tier league -> year its average was last set
    players = {}                # player -> {"r", "g", "team", "year"}
    tests = []
    played = []  # test games for series_out: (day, a, b, strength difference without side, context, a won)

    def raw_chance(d):
        return 1.0 / (1.0 + 10.0 ** (-d / SCALE))

    def active(lg, today, skip=None):
        return [teams[t] for t in members.get(lg, ()) if t != skip and _days(teams[t]["last"], today) <= ACTIVE_DAYS]

    def league_avg(lg, today, skip=None):
        rs = [x["r"] for x in active(lg, today, skip)]
        return sum(rs) / len(rs) if len(rs) >= MIN_LEAGUE else None

    def region_top(region, today):
        rs = [x["r"] for lg, (tier, reg) in league_info.items() if tier == 1 and reg == region for x in active(lg, today)]
        return sum(rs) / len(rs) if len(rs) >= MIN_LEAGUE else None

    def target(lg, today):
        """Where a league's average should sit: second-tier leagues hang below their region's top league."""
        tier, region = league_info.get(lg, (1, None))
        if tier == 2 and region:
            top = region_top(region, today)
            if top is not None:
                return top - p["TIER2_GAP"]
        return None

    def shift_team(x, delta):
        """Move a team and the players of its current lineup together."""
        x["r"] += delta
        if pw:
            for pl in x["roster"]:
                q = players.get(pl)
                if q is not None and q["team"] is x:
                    q["r"] += delta

    def anchor(lg, today):
        year = today[:4]
        if league_info.get(lg, (1, None))[0] != 2 or anchored.get(lg) == year:
            return
        want = target(lg, today)
        xs = active(lg, today)
        if want is None or len(xs) < MIN_LEAGUE:
            return  # try again on a later day of the year, once enough of the league's teams have played
        anchored[lg] = year
        shift = want - sum(x["r"] for x in xs) / len(xs)
        for x in xs:
            shift_team(x, shift)

    def get(t, lg, intl, today):
        x = teams.get(t)
        if x is None:
            start = None
            if not intl and lg:
                avg = target(lg, today)
                if avg is None:
                    avg = league_avg(lg, today)
                start = avg + p["NEW_OFFSET"] if avg is not None else None
            if start is None and p["UNKNOWN_REL"] is not None:
                rs = [y["r"] for lg2, (tier2, _) in league_info.items() if tier2 == 1 for y in active(lg2, today)]
                if len(rs) >= MIN_LEAGUE:
                    start = sum(rs) / len(rs) + p["UNKNOWN_REL"]
            x = teams[t] = {"r": start if start is not None else p["NEW_UNKNOWN"], "g": 0, "last": today, "league": None,
                            "year": today[:4], "yc": Counter(), "roster": (), "gapk": 0, "hist": []}
        elif x["year"] != today[:4]:
            home = x["league"]
            avg = league_avg(home, today, skip=t) if home else None
            if avg is not None:
                x["r"] += p["YEAR_REGRESS"] * (avg - x["r"])
            x["year"] = today[:4]
            x["yc"] = Counter()
        if not intl and lg:
            x["yc"][lg] += 1
            if x["league"] != lg and x["yc"][lg] >= x["yc"].get(x["league"], 0):
                if p["PROMOTE"] and league_info.get(x["league"], (0, None))[0] == 2 and league_info.get(lg, (0, None))[0] == 1:
                    avg = league_avg(lg, today)
                    if avg is not None and x["r"] < avg + p["NEW_OFFSET"]:
                        shift_team(x, avg + p["NEW_OFFSET"] - x["r"])
                if x["league"]:
                    members[x["league"]].discard(t)
                x["league"] = lg
                members[lg].add(t)
        return x

    def lineup(x, plist, today):
        """Player records for this game's lineup (created on first sight just below the team's rating)."""
        out = []
        for pl in plist:
            q = players.get(pl)
            if q is None:
                q = players[pl] = {"r": x["r"] + p["P_NEW_OFFSET"], "g": 0, "team": x, "year": today[:4]}
            elif q["year"] != today[:4]:
                q["r"] += p["P_REGRESS"] * (x["r"] - q["r"])
                q["year"] = today[:4]
            q["team"] = x
            out.append(q)
        return out

    def strength(x):
        """A team's strength with its latest lineup (team rating alone when no lineup is known)."""
        qs = [players[pl]["r"] for pl in x["roster"] if pl in players] if pw else []
        return (1 - pw) * x["r"] + pw * sum(qs) / len(qs) if len(qs) >= P_MIN else x["r"]

    for row in sorted(games, key=lambda g: g[0]):
        date_, lg, intl, a, b, a_won = row[:6]
        tier, region = row[6], row[7]
        blue, gold, _mins, pa, pb = row[8:13] if len(row) >= 13 else (None, None, None, (), ())
        pa, pb = pa or (), pb or ()
        if not a or not b or a == b:
            continue
        day = date_[:10]
        if lg and not intl:
            league_info[lg] = (tier, REGION_ALIASES.get(region, region))
            anchor(lg, day)
        last_a = teams[a]["last"] if a in teams else None
        last_b = teams[b]["last"] if b in teams else None
        xa, xb = get(a, lg, intl, day), get(b, lg, intl, day)

        # back from a long break (between splits): a little closer to the league average, and faster for a few games
        for x, last in ((xa, last_a), (xb, last_b)):
            if last and _days(last, day) >= p["GAP_DAYS"]:
                x["gapk"] = p["GAP_GAMES"]
                avg = league_avg(x["league"], day) if x["league"] else None
                if avg is not None:
                    shift_team(x, p["GAP_REG"] * (avg - x["r"]))
        # two or more players not in the team's last lineup
        for x, pl in ((xa, pa), (xb, pb)):
            if len(pl) >= 5 and x["roster"] and len(set(pl) - set(x["roster"])) >= 2:
                avg = league_avg(x["league"], day) if x["league"] else None
                if avg is not None:
                    x["r"] += p["ROSTER_REG"] * (avg - x["r"])

        qa = lineup(xa, pa, day) if pw and len(pa) >= P_MIN else None
        qb = lineup(xb, pb, day) if pw and len(pb) >= P_MIN else None
        sa = xa["r"] if qa is None else (1 - pw) * xa["r"] + pw * sum(q["r"] for q in qa) / len(qa)
        sb = xb["r"] if qb is None else (1 - pw) * xb["r"] + pw * sum(q["r"] for q in qb) / len(qb)
        side = p["BLUE"] if blue == 1 else -p["BLUE"] if blue == 0 else 0.0
        e = raw_chance(sa - sb + side)
        if day >= test_from:
            ta = league_info.get(xa["league"], (0, None))[0]
            tb = league_info.get(xb["league"], (0, None))[0]
            ctx = "intl" if intl else "top" if ta == 1 and tb == 1 else "other"
            conf = p["CONF_INTL"] if ctx == "intl" else p["CONF_TOP"] if ctx == "top" else p["CONF_OTHER"]
            tests.append((day, raw_chance(conf * (sa - sb + side)), a_won, intl,
                          xa["g"] >= p["NEW_GAMES"] and xb["g"] >= p["NEW_GAMES"], ta, tb))
            if series_out is not None:
                played.append((day, a, b, conf * (sa - sb), ctx, a_won))
        ka = p["K_NEW"] if xa["g"] < p["NEW_GAMES"] else p["K"]
        kb = p["K_NEW"] if xb["g"] < p["NEW_GAMES"] else p["K"]
        ga = gb = 1.0
        if xa["gapk"] > 0:
            ga = p["GAP_K"]
            xa["gapk"] -= 1
        if xb["gapk"] > 0:
            gb = p["GAP_K"]
            xb["gapk"] -= 1
        ca = cb = 1.0
        tia = league_info.get(xa["league"], (0, None))[0]
        tib = league_info.get(xb["league"], (0, None))[0]
        if tia == 1 and tib == 2:
            ca = p["K_CROSS_TOP"]
        elif tib == 1 and tia == 2:
            cb = p["K_CROSS_TOP"]
        ka, kb = ka * ga * ca, kb * gb * cb
        if intl:
            ka, kb = ka * p["K_INTL"], kb * p["K_INTL"]
        mult = 1.0
        if gold is not None:
            lead = gold if a_won else -gold  # the winner's gold lead
            mult = min(MOV_MAX, max(MOV_MIN, (lead / MOV_REF) ** p["MOV_X"])) if lead > 0 else MOV_MIN
        d = (1.0 if a_won else 0.0) - e
        xa["r"] += ka * d * mult
        xb["r"] -= kb * d * mult
        for x, qs, pl, sign, c in ((xa, qa, pa, 1, ca), (xb, qb, pb, -1, cb)):
            x["g"] += 1
            x["last"] = day
            if qs is not None or len(pl) >= 5:
                x["roster"] = tuple(sorted(pl))
            for q in qs or ():
                kp = p["KP_NEW"] if q["g"] < p["P_NEW"] else p["KP"]
                if intl:
                    kp *= p["K_INTL"]
                q["r"] += sign * kp * c * d * mult
                q["g"] += 1
            s = p["CONF_TOP"] * strength(x)
            if x["hist"] and x["hist"][-1][0] == day:
                x["hist"][-1] = (day, s)
            else:
                x["hist"].append((day, s))
    for x in teams.values():
        x["elo"] = x["r"]
        x["r"] = p["CONF_TOP"] * strength(x)
    if series_out is not None:
        series_out.extend(_series(played))
    return teams, tests, league_info


def series_chance_adj(p, bo):
    """Chance to win a best-of-`bo` series from the one-game chance p, as calibrated on past series."""
    c = SERIES.get(bo, 1.0)
    return series_chance(0.5 + (p - 0.5) * c, bo)


def _series(played):
    """Group consecutive games of the same two teams on the same day into series (best of 3 or 5 only; the
    length comes from the winner's game count)."""
    out = []
    cur = None
    for day, a, b, d, ctx, a_won in played:
        key = (day, frozenset((a, b)))
        if cur and cur[0] == key:
            cur[4][a if a_won else b] += 1
            continue
        if cur:
            out.append(cur)
        cur = (key, a, d, ctx, Counter({a if a_won else b: 1}), b)
    if cur:
        out.append(cur)
    rows = []
    for (day, _), a, d, ctx, wins, b in out:
        wa, wb = wins[a], wins[b]
        bo = 2 * max(wa, wb) - 1
        if wa != wb and bo in (3, 5):
            rows.append((day, series_chance_adj(1.0 / (1.0 + 10.0 ** (-d / SCALE)), bo), bo, 1 if wa > wb else 0, ctx))
    return rows


def score(tests, only=None):
    """How the chances held up: games, share where the favourite won, Brier score, log loss."""
    rows = [t for t in tests if only is None or only(t)]
    if not rows:
        return {"n": 0}
    right = sum(1 for _, e, w, *_ in rows if (e > 0.5 and w) or (e < 0.5 and not w) or e == 0.5)
    brier = sum((e - (1 if w else 0)) ** 2 for _, e, w, *_ in rows) / len(rows)
    ll = -sum(math.log(max(1e-9, e if w else 1 - e)) for _, e, w, *_ in rows) / len(rows)
    return {"n": len(rows), "acc": round(right / len(rows), 4), "brier": round(brier, 4), "logloss": round(ll, 4)}


def calibration(tests, bins=(0.5, 0.6, 0.7, 0.8, 0.9, 1.01)):
    """For favourites at 50-60%, 60-70% ...: games, how often the favourite won, and the chance we gave on average."""
    out = []
    for lo, hi in zip(bins, bins[1:]):
        rows = [(max(e, 1 - e), (w if e >= 0.5 else not w)) for _, e, w, *_ in tests if lo <= max(e, 1 - e) < hi]
        if rows:
            out.append([round(lo * 100), round(min(hi, 1) * 100), len(rows), round(sum(1 for _, ok in rows if ok) / len(rows), 4),
                        round(sum(f for f, _ in rows) / len(rows), 4)])
    return out


def series_calibration(rows, bo):
    """calibration() for the best-of-`bo` series in series_out rows."""
    return calibration([(d, e, w) for d, e, b, w, _ in rows if b == bo])


def cross(tests):
    """Games between a top-league team and a second-tier team: how often we expected the top-league side to win,
    and how often it did (checks TIER2_GAP)."""
    rows = []
    for _, e, w, _, _, ta, tb in tests:
        if {ta, tb} == {1, 2}:
            rows.append((e, w) if ta == 1 else (1 - e, not w))
    if not rows:
        return {"n": 0}
    return {"n": len(rows), "pred": round(sum(e for e, _ in rows) / len(rows), 4),
            "won": round(sum(1 for _, w in rows if w) / len(rows), 4)}


def rating_on(hist, day):
    """A team's rating at the end of `day` (None before its first game)."""
    r = None
    for d, v in hist:
        if d > day:
            break
        r = v
    return r
