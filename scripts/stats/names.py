"""
Matching names that the catalog's tables spell differently, shared by build_stats.py and hub.py.

The same team can be "Dplus Kia" in one table and "Dplus KIA" in another, "Royal Club" here and
"Royal Club (RNG academy)" there; a few tables list a game's two teams the other way round. Comparing
the exact strings dropped or mixed up such games, so every table's team names are mapped onto the
game's own two names first.
"""
import re

_SUFFIX_NOTE = re.compile(r"\s*\(.*?\)\s*$")
_SUFFIX_REGION = re.compile(r"\.(cn|na|eu|kr|cis|vn|br|jp|tw|lat|oce|tr)$")

# Teams Leaguepedia files under a page name with a note that tells it apart from other teams of the same name: the
# pages show the name the team plays under (TV, 2026-10-28: LYON is "just called LYON"; Lyon Gaming, the same brand,
# is joined to it in build_stats.MANUAL_LINKS). The build keeps the page names inside (they're what Leaguepedia's
# tables use); every file it writes shows these names instead (show_teams).
TEAM_NAMES = {
    "LYON (2024 American Team)": "LYON",
    "Lyon Gaming (2013 Latin American Team)": "Lyon Gaming",
    "Lyon Gaming (2017 Latin America North Team)": "Lyon Gaming",
}


def show_team(name):
    """The name a team is shown under: its own, or the one in TEAM_NAMES for a Leaguepedia page name with a note."""
    return TEAM_NAMES.get(name, name)


def show_teams(text: str) -> str:
    """A file's text with every TEAM_NAMES page name shown under its own name (one pass per name, only if present)."""
    for page, shown in TEAM_NAMES.items():
        if page in text:
            text = text.replace(page, shown)
    return text


def team_key(name) -> str:
    """Loose form of a team name: lower case, without a "(...)" note or a ".CN"-style suffix, letters and digits only."""
    # a name can arrive as a number from the catalog ("100" stored as an integer)
    s = str(name if name is not None else "").lower().strip()
    s = _SUFFIX_NOTE.sub("", s)
    s = _SUFFIX_REGION.sub("", s)
    return re.sub(r"[^0-9a-z]+", "", s)


def match_teams(names, t1, t2) -> dict:
    """{name: t1 or t2} for the team names one table uses for a game whose teams are t1 and t2: exact, then
    case-insensitive, then loose matches; when one of two names matched, the other is the other team.
    Names that can't be placed are left out."""
    names = [n for n in dict.fromkeys(names) if n]
    out = {n: n for n in names if n in (t1, t2)}
    for n in names:
        if n not in out:
            hit = [t for t in (t1, t2) if t and n.lower() == t.lower()]
            if len(hit) == 1:
                out[n] = hit[0]
    for n in names:
        if n not in out and team_key(n):
            hit = [t for t in (t1, t2) if t and team_key(t) == team_key(n)]
            if len(hit) == 1:
                out[n] = hit[0]
    rest = [n for n in names if n not in out]
    free = [t for t in (t1, t2) if t and t not in out.values()]
    if len(names) == 2 and len(rest) == 1 and len(free) == 1:
        out[rest[0]] = free[0]
    return out


def blue_red(team1, team2, t1, t2) -> tuple:
    """("team1", "team2") when a table's team1 is the game's blue side (t1), ("team2", "team1") when the table
    lists the teams the other way round. Unknown names keep the table's order."""
    m = match_teams([team1, team2], t1, t2)
    if (team2 and m.get(team2) == t1) or (team1 and m.get(team1) == t2):
        return "team2", "team1"
    return "team1", "team2"


# -- champions ------------------------------------------------------------------------------------

NOT_CHAMPS = {"", "missing data", "none", "unknown", "tbd", "null", "-", "loss of ban", "no ban"}
CHAMP_FIX = {"fiddlesticks": "Fiddlesticks"}  # Leaguepedia has both "FiddleSticks" and "Fiddlesticks"


def champ_name(c):
    """A champion name as one spelling, or None for placeholders ("Missing Data", "None")."""
    c = (c or "").strip()
    if c.lower() in NOT_CHAMPS:
        return None
    return CHAMP_FIX.get(c.lower(), c)


# -- players ------------------------------------------------------------------------------------

# Games the catalog filed under the wrong player: Leaguepedia redirects a lower-case spelling ("Dandy", "Hoya")
# to a different, little-known player. (page the games are under) -> [(teams, right page)]
PAGE_FIXES = {
    "Dandy (British Player)": [(("Samsung White", "MVP White", "Vici Gaming", "Samsung Galaxy Ozone"), "DanDy")],
    "Hoya (Kim Hyeong-jun)": [(("Fredit BRION", "Griffin (Korean Team)", "Griffin", "DWG KIA", "ThunderTalk Gaming"), "HOYA")],
    "Titan (Nicholas O'Shea)": [(("KaBuM! Esports", "KaBuM! e-Sports"), "TitaN")],
    "Trace (Mehmet Azemi)": [(("Jin Air Green Wings", "Jin Air Green Wings Stealths"), "TrAce")],
    "Daydream (Kyler Irwin)": [(("Xenics Storm", "CJ Entus Blaze"), "DayDream")],
}

# Not "N/A" or similar placeholders in name fields (Player of the Game)
NOT_NAMES = {"", "N/A", "NA", "NONE", "TBD", "-", "NULL", "?"}


class PlayerNames:
    """One page per player. Pages that differ only in case ("GODV (Wei Zhen)" / "GodV (Wei Zhen)") are one
    player: Leaguepedia's spelling, else the one with the most games. Other names (Player of the Game,
    rosters, pentakills) go through Leaguepedia's redirects."""

    def __init__(self, page_counts: dict, lp_pages, redirects):
        by_lower = {}
        for p, n in page_counts.items():
            by_lower.setdefault(p.lower(), []).append((n, p))
        lp_lower = {}
        for p in lp_pages:
            lp_lower.setdefault(p.lower(), set()).add(p)
        self.case = {}
        for low, lst in by_lower.items():
            if len(lst) < 2:
                continue
            lp = lp_lower.get(low) or set()
            best = next(iter(lp)) if len(lp) == 1 else max(lst)[1]
            for _, p in lst:
                if p != best:
                    self.case[p] = best
        self.redirect = {}
        self.redirect_lower = {}
        for alias, page in redirects:
            if alias and page:
                self.redirect.setdefault(alias, page)
                self.redirect_lower.setdefault(alias.lower(), set()).add(page)
        self.known = set(page_counts)

    def page(self, page, team=None):
        """The page a scoreboard row's games belong to."""
        if not page:
            return page
        page = self.case.get(page, page)
        for teams, right in PAGE_FIXES.get(page, ()):
            if team in teams:
                return right
        return page

    def resolve(self, name, game_pages=()):
        """A free-text player name (Player of the Game, roster, pentakill link) as a page: one of this game's
        players first ([(page, name on the scoreboard)]), then a known page, then Leaguepedia's redirects."""
        n = (name or "").strip()
        if n.upper() in NOT_NAMES:
            return None
        low = n.lower()
        for page, raw in game_pages:
            if page and (low == page.lower() or low == (raw or "").lower() or low == _SUFFIX_NOTE.sub("", page).lower()):
                return page
        if n in self.known:
            return self.case.get(n, n)
        if n in self.case:
            return self.case[n]
        hit = self.redirect.get(n)
        if not hit:
            many = self.redirect_lower.get(low) or set()
            if len(many) == 1:
                hit = next(iter(many))
            elif many:
                known = [p for p in many if p in self.known]
                hit = known[0] if len(known) == 1 else None
        if hit:
            return self.case.get(hit, hit)
        return n
