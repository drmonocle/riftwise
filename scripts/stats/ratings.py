"""Team strength ratings for win chances and power rankings (all regions on one scale).

Elo, one update per game, over every pro game with a result since 2011:
- a team's home league is the league it played most games in that year (so EMEA Masters or a regional
  qualifier never becomes one);
- a team new to a league starts a little below that league's current average (or at NEW_UNKNOWN when the
  league has too few rated teams);
- at the start of each year every team is pulled part of the way back to its league's average (rosters change);
- international games are what move whole regions against each other, so they count a bit more;
- second-tier leagues (LCK CL, LFL, NACL ...) never play the top leagues, so their scale would drift on its own:
  at the start of each year their average is set TIER2_GAP below the average of their region's top league(s).

`run` also tests itself: before each game from TEST_FROM on it records the chance it gave team a, so the site
can say how often the favourite actually won. Standard library only; hub.py calls `run` and writes hub/ratings.json.
"""
import math
from collections import Counter, defaultdict
from datetime import date

K = 32.0             # points per game for an established team
K_NEW = 64.0         # ... for its first NEW_GAMES games (find its level quickly)
NEW_GAMES = 12
K_INTL = 1.6         # international games count this much more (tuned on 2024-26 games)
NEW_OFFSET = -40.0   # new team vs its league's average
NEW_UNKNOWN = 1350.0 # new team in a league with fewer than MIN_LEAGUE rated teams
MIN_LEAGUE = 4
YEAR_REGRESS = 0.3   # share of the way back to the league average at the start of a year
TIER2_GAP = 150.0    # second-tier league average below its region's top league(s)
ACTIVE_DAYS = 400    # a team counts toward its league's average for this long after its last game
TEST_FROM = "2024-01-01"
REGION_ALIASES = {"Europe": "EMEA", "Americas": "North America", "Oceania": "OCE", "LAT": "Latin America"}


def expected(ra, rb):
    """Chance that a team rated ra beats one rated rb in one game."""
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


def run(games, test_from=TEST_FROM, **kw):
    """games: iterable of (date "YYYY-MM-DD[...]", league, international 0/1, team a, team b, a won 0/1,
    tier 1/2 (top league or not), region).
    Returns (teams, tests, leagues): teams = {team: {"r", "g", "last", "league", "hist": [(date, rating)]}},
    tests = [(date, chance given to team a, a won, international, both established)],
    leagues = {league: (tier, region)} as last seen."""
    p = dict(K=K, K_NEW=K_NEW, NEW_GAMES=NEW_GAMES, K_INTL=K_INTL, NEW_OFFSET=NEW_OFFSET, NEW_UNKNOWN=NEW_UNKNOWN,
             YEAR_REGRESS=YEAR_REGRESS, TIER2_GAP=TIER2_GAP)
    p.update(kw)
    teams = {}
    members = defaultdict(set)  # league -> teams whose home league it is
    league_info = {}            # league -> (tier, region)
    anchored = {}               # second-tier league -> year its average was last set
    tests = []

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

    def anchor(lg, today):
        year = today[:4]
        if league_info.get(lg, (1, None))[0] != 2 or anchored.get(lg) == year:
            return
        anchored[lg] = year
        want = target(lg, today)
        xs = active(lg, today)
        if want is None or len(xs) < MIN_LEAGUE:
            return
        shift = want - sum(x["r"] for x in xs) / len(xs)
        for x in xs:
            x["r"] += shift

    def get(t, lg, intl, today):
        x = teams.get(t)
        if x is None:
            start = None
            if not intl and lg:
                avg = target(lg, today)
                if avg is None:
                    avg = league_avg(lg, today)
                start = avg + p["NEW_OFFSET"] if avg is not None else None
            x = teams[t] = {"r": start if start is not None else p["NEW_UNKNOWN"], "g": 0, "last": today, "league": None,
                            "year": today[:4], "yc": Counter(), "hist": []}
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
                if x["league"]:
                    members[x["league"]].discard(t)
                x["league"] = lg
                members[lg].add(t)
        return x

    for date_, lg, intl, a, b, a_won, tier, region in sorted(games, key=lambda g: g[0]):
        if not a or not b or a == b:
            continue
        day = date_[:10]
        if lg and not intl:
            league_info[lg] = (tier, REGION_ALIASES.get(region, region))
            anchor(lg, day)
        xa, xb = get(a, lg, intl, day), get(b, lg, intl, day)
        e = expected(xa["r"], xb["r"])
        if day >= test_from:
            tests.append((day, e, a_won, intl, xa["g"] >= p["NEW_GAMES"] and xb["g"] >= p["NEW_GAMES"]))
        ka = p["K_NEW"] if xa["g"] < p["NEW_GAMES"] else p["K"]
        kb = p["K_NEW"] if xb["g"] < p["NEW_GAMES"] else p["K"]
        if intl:
            ka, kb = ka * p["K_INTL"], kb * p["K_INTL"]
        d = (1.0 if a_won else 0.0) - e
        xa["r"] += ka * d
        xb["r"] -= kb * d
        for x in (xa, xb):
            x["g"] += 1
            x["last"] = day
            if x["hist"] and x["hist"][-1][0] == day:
                x["hist"][-1] = (day, x["r"])
            else:
                x["hist"].append((day, x["r"]))
    return teams, tests, league_info


def score(tests, only=None):
    """How the chances held up: games, share where the favourite won, Brier score, log loss."""
    rows = [t for t in tests if only is None or only(t)]
    if not rows:
        return {"n": 0}
    right = sum(1 for _, e, w, _, _ in rows if (e > 0.5 and w) or (e < 0.5 and not w) or e == 0.5)
    brier = sum((e - (1 if w else 0)) ** 2 for _, e, w, _, _ in rows) / len(rows)
    ll = -sum(math.log(max(1e-9, e if w else 1 - e)) for _, e, w, _, _ in rows) / len(rows)
    return {"n": len(rows), "acc": round(right / len(rows), 4), "brier": round(brier, 4), "logloss": round(ll, 4)}


def calibration(tests, bins=(0.5, 0.6, 0.7, 0.8, 0.9, 1.01)):
    """For favourites at 50-60%, 60-70% ...: games and how often the favourite won."""
    out = []
    for lo, hi in zip(bins, bins[1:]):
        rows = [(max(e, 1 - e), (w if e >= 0.5 else not w)) for _, e, w, _, _ in tests if lo <= max(e, 1 - e) < hi]
        if rows:
            out.append([round(lo * 100), round(min(hi, 1) * 100), len(rows), round(sum(1 for _, ok in rows if ok) / len(rows), 4)])
    return out


def rating_on(hist, day):
    """A team's rating at the end of `day` (None before its first game)."""
    r = None
    for d, v in hist:
        if d > day:
            break
        r = v
    return r
