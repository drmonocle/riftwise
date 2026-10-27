"""
RiftWise player rating (1.0): how well one player played one game, 0-10 (6 is an average game).

From the scoreboard only, so it works for every game with full stats since 2011:
  kill participation (kills + assists over the team's kills), share of the team's damage, share of the team's
  gold, CS per minute, share of the team's vision score, and deaths per minute (fewer is better),
each against players of the same role in the same year (so a support isn't judged on damage, and 2014's slower
games aren't held against 2026's), then a half point for a win (or off for a loss).

  z_x     = (value - role-year average) / role-year spread, kept within -3..3
  form    = 0.25 kp + 0.25 damage + 0.15 gold + 0.10 CS + 0.05 vision - 0.20 deaths   (missing ones left out)
  rating  = 6 + scale * form + 0.5 (win) / - 0.5 (loss), within 0..10

scale is set so the form part spreads like one point (its standard deviation is 0.85). The app does the same sum
(src/hub/playerRating.ts) from hub/rating.json, which this file writes: the weights, the scale and the role-year
averages. Change the two together; test/test_build.py and src/__tests__/playerRating.test.ts check one known game.
"""
import math
from collections import defaultdict

VERSION = 1
WEIGHTS = {"kp": 0.25, "ds": 0.25, "gs": 0.15, "cs": 0.10, "vs": 0.05, "dpm": -0.20}
WIN = 0.5
MIN_ROWS = 300          # a role-year with fewer games uses the role's all-years averages
FORM_SD = 0.85

# a player-game row (hub.py p_games): [date, series slug, champion, k, d, a, won, team, opponent, event, role,
# event slug, cs, gold, damage, vision, minutes, team kills, team damage, team gold, team vision, ...]


def parts(r):
    """The components of one row, those it has (None for the rest)."""
    k, d, a, mins = r[3] or 0, r[4] or 0, r[5] or 0, r[16]
    cs, gold, dmg, vis = r[12], r[13], r[14], r[15]
    tk, tdmg, tgold, tvis = r[17], r[18], r[19], r[20]
    return {
        "kp": (k + a) / tk if tk else None,
        "ds": dmg / tdmg if dmg is not None and tdmg else None,
        "gs": gold / tgold if gold is not None and tgold else None,
        "cs": cs / mins if cs is not None and mins else None,
        "vs": vis / tvis if vis is not None and tvis else None,
        "dpm": d / mins if mins else None,
    }


def baselines(rows):
    """{"<year>|<role>" and "all|<role>": {component: [mean, sd]}} from every row with a role and minutes."""
    acc = defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0.0]))  # key -> comp -> [n, sum, sum of squares]
    for r in rows:
        if not r[10] or not r[16]:
            continue
        for key in (f"{r[0][:4]}|{r[10]}", f"all|{r[10]}"):
            for c, v in parts(r).items():
                if v is not None:
                    s = acc[key][c]
                    s[0] += 1
                    s[1] += v
                    s[2] += v * v
    out = {}
    for key, comps in acc.items():
        b = {}
        for c, (n, s1, s2) in comps.items():
            if n >= (MIN_ROWS if not key.startswith("all|") else 30):
                mean = s1 / n
                sd = math.sqrt(max(s2 / n - mean * mean, 0.0))
                if sd > 0:
                    b[c] = [round(mean, 5), round(sd, 5)]
        if b:
            out[key] = b
    return out


def form(r, base):
    """The weighted sum of the row's z-scores (None when its role has no averages or it has no components)."""
    role = r[10]
    if not role:
        return None
    by_year, every = base.get(f"{r[0][:4]}|{role}") or {}, base.get(f"all|{role}") or {}
    total, wsum = 0.0, 0.0
    for c, v in parts(r).items():
        ms = by_year.get(c) or every.get(c)
        if v is None or not ms:
            continue
        z = max(-3.0, min(3.0, (v - ms[0]) / ms[1]))
        total += WEIGHTS[c] * z
        wsum += abs(WEIGHTS[c])
    return total / wsum if wsum >= 0.5 else None


def scale_for(rows, base):
    """The factor that gives the form part a standard deviation of FORM_SD over these rows."""
    xs = [f for f in (form(r, base) for r in rows) if f is not None]
    if len(xs) < 100:
        return 1.0
    mean = sum(xs) / len(xs)
    sd = math.sqrt(sum((x - mean) ** 2 for x in xs) / len(xs))
    return round(FORM_SD / sd, 4) if sd > 0 else 1.0


def rate(r, base, scale):
    """The row's rating, 0-10 with one decimal, or None."""
    f = form(r, base)
    if f is None:
        return None
    v = 6.0 + scale * f + (WIN if r[6] else -WIN)
    return round(max(0.0, min(10.0, v)), 1)


def file(base, scale, built):
    """hub/rating.json: what the app needs to rate a game itself (match pages, the Stats tab's periods)."""
    return {"v": VERSION, "built": built, "w": WEIGHTS, "win": WIN, "scale": scale, "base": base}


def leaders(rows_by_page, keep, base, scale, min_games, n):
    """The best average ratings among rows that `keep` accepts: [(avg, games, page, best row, best rating)]."""
    out = []
    for page, rows in rows_by_page.items():
        rated = [(rate(r, base, scale), r) for r in rows if keep(r)]
        rated = [(v, r) for v, r in rated if v is not None]
        if len(rated) < min_games:
            continue
        avg = sum(v for v, _ in rated) / len(rated)
        best_v, best_r = max(rated, key=lambda x: (x[0], x[1][0]))
        out.append((round(avg, 2), len(rated), page, best_r, best_v))
    out.sort(key=lambda x: (-x[0], -x[1]))
    return out[:n]
