"""Small helpers of the stats hub build (hub.py): slugs, number formats, the file writer, region and country codes.
Moved out of hub.py (2026-10-27) so the build function reads on its own; nothing here knows about a build's data."""
import concurrent.futures
import datetime
import hashlib
import html
import json
import os
import re
import threading
import unicodedata
from collections import defaultdict

from names import champ_name, show_teams

LETTERS = str.maketrans({"Ø": "O", "ø": "o", "Æ": "AE", "æ": "ae", "Œ": "OE", "œ": "oe", "ß": "ss", "Ł": "L", "ł": "l",
                         "Đ": "D", "đ": "d", "Þ": "Th", "þ": "th", "ı": "i", "Ð": "D", "ð": "d"})



def unesc(url):
    """Leaguepedia stores some links HTML-escaped ("...?si=x&amp;t=2171"): YouTube then ignores the start time."""
    return html.unescape(url) if url else url

def pretty(text: str) -> str:
    """'Worlds 2025 Main Event' -> 'worlds-2025-main-event' (accents dropped, apostrophes and dots removed).
    The app has the same function (src/hub.ts prettySlug); keep the two in step."""
    s = unicodedata.normalize("NFKD", html.unescape(text or "").translate(LETTERS))
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower().replace("&", " and ")
    s = re.sub(r"['’`.]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:70].strip("-")


def short_hash(key) -> str:
    return hashlib.sha1(str(key).encode("utf-8")).hexdigest()[:5]


class Slugs:
    """Readable, unique slugs for one kind of page. When several things want the same slug the one
    with the most games keeps it; the others use their alternative text if that is free, else get a
    short hash. A slug therefore stays put for as long as its owner exists."""

    def __init__(self):
        self.want = {}

    def add(self, key, text, weight=0, alt=None):
        self.want[key] = (pretty(text) or "x", weight, pretty(alt) if alt else None)

    def build(self) -> dict:
        groups = defaultdict(list)
        for k, (base, w, alt) in self.want.items():
            groups[base].append((-w, str(k), k, alt))
        out, used, losers = {}, set(), []
        for base, lst in groups.items():
            lst.sort()
            out[lst[0][2]] = base
            used.add(base)
            losers += [(base, x[2], x[3]) for x in lst[1:]]
        for base, k, alt in sorted(losers, key=lambda x: str(x[1])):
            s = alt if alt and alt not in used and alt not in groups else f"{base}-{short_hash(k)}"
            while s in used:
                s = f"{base}-{short_hash(str(k) + s)}"
            out[k] = s
            used.add(s)
        return out


def fix_patch(p, date):
    """Leaguepedia stores patches as numbers, so 25.20 reads "25.2" and 10.10 reads "10.1". Put the
    lost zero back when the game's date says it is the later patch (about 24 patches a year)."""
    if not p:
        return p
    p = str(p).strip()
    m = re.match(r"^(\d+)\.(\d)$", p)
    if not m or not date:
        return p
    major, d = int(m.group(1)), int(m.group(2))
    year = 2000 + major if major >= 25 else 2010 + major if major >= 4 else None
    if not year:
        return p
    try:
        day = (datetime.date.fromisoformat(date[:10]) - datetime.date(year, 1, 8)).days
    except ValueError:
        return p
    est = 1 + day / 14.5
    alt = d * 10
    return f"{major}.{alt}" if alt <= 25 and abs(alt - est) < abs(d - est) else p


def jlist(s):
    if not s:
        return []
    try:
        v = json.loads(s)
        items = v if isinstance(v, list) else []
    except Exception:
        items = str(s).split(",")
    return [str(x).strip() for x in items if x is not None and str(x).strip() and str(x).strip().lower() not in ("none", "null", "-", "loss of ban")]


def champs(s):
    """Champion names from a JSON / comma list, in one spelling, without placeholders ("Missing Data")."""
    return [c for c in (champ_name(x) for x in jlist(s)) if c]


# Leaguepedia writes a roster's region as a code or a full name, sometimes in lower case ("China" next to "CN", "na")
REGION_CODE = {"china": "CN", "korea": "KR", "europe": "EU", "north america": "NA", "brazil": "BR", "vietnam": "VN",
               "japan": "JP", "turkey": "TR", "oceania": "OCE", "latin america": "LAT", "cis": "CIS",
               "taiwan, hong kong, and macao": "LMS", "southeast asia": "SEA"}


def region_code(r):
    t = re.sub(r"\s+", " ", html.unescape(str(r or ""))).strip()
    if not t:
        return None
    return REGION_CODE.get(t.lower()) or (t.upper() if len(t) <= 5 else t)


# Scoreboards spell a few runes and spells differently
RUNE_FIX = {"press the attack": "Press the Attack", "hali of blades": "Hail of Blades", "unbound spellbook": "Unsealed Spellbook"}


def rune_name(x):
    return RUNE_FIX.get((x or "").strip().lower(), x)


def spell_name(x):
    x = (x or "").strip()
    return x[:1].upper() + x[1:] if x and x[:1].islower() else x


def phase_rank(phase):
    """Which of a tournament's result lists counts: the pro bracket / playoffs / finals before a regular season,
    group or weekly cup, and before an amateur cup run at the same event."""
    p = (phase or "").lower()
    if not p:
        return 1
    if any(w in p for w in ("amateur", "weekly", "nirvana", "lower group", "qualif", "rise group")):
        return 3
    # LCK 2025 Rounds 3-5: the Legend Group's first is the stage's winner, not the Rise Group's
    if any(w in p for w in ("pro", "playoff", "main event", "final", "ascend", "knockout", "higher group", "legend group")):
        return 0
    if any(w in p for w in ("regular", "group", "day ", "#", "stage")):
        return 2
    return 1


# Leaguepedia's country names -> ISO 3166 codes (the flags in public/flags/<code>.svg)
COUNTRY_CODE = {
    "south korea": "kr", "korea": "kr", "china": "cn", "taiwan": "tw", "hong kong": "hk", "macau": "mo", "japan": "jp",
    "vietnam": "vn", "thailand": "th", "philippines": "ph", "singapore": "sg", "malaysia": "my", "indonesia": "id",
    "australia": "au", "new zealand": "nz", "united states": "us", "canada": "ca", "mexico": "mx", "brazil": "br",
    "argentina": "ar", "chile": "cl", "colombia": "co", "peru": "pe", "uruguay": "uy", "costa rica": "cr",
    "united kingdom": "gb", "england": "gb", "ireland": "ie", "france": "fr", "germany": "de", "spain": "es",
    "portugal": "pt", "italy": "it", "netherlands": "nl", "belgium": "be", "denmark": "dk", "sweden": "se",
    "norway": "no", "finland": "fi", "poland": "pl", "czech republic": "cz", "czechia": "cz", "slovakia": "sk",
    "austria": "at", "switzerland": "ch", "hungary": "hu", "romania": "ro", "bulgaria": "bg", "greece": "gr",
    "croatia": "hr", "serbia": "rs", "slovenia": "si", "turkey": "tr", "türkiye": "tr", "russia": "ru", "ukraine": "ua",
    "belarus": "by", "kazakhstan": "kz", "israel": "il", "saudi arabia": "sa", "united arab emirates": "ae", "egypt": "eg",
    "morocco": "ma", "south africa": "za", "lithuania": "lt", "latvia": "lv", "estonia": "ee", "cyprus": "cy",
    "malta": "mt", "india": "in", "mongolia": "mn", "tunisia": "tn", "ecuador": "ec", "iceland": "is", "panama": "pa",
    "jordan": "jo", "dominican republic": "do", "macao": "mo", "republic of ireland": "ie", "northern ireland": "gb",
    "puerto rico": "pr", "luxembourg": "lu", "venezuela": "ve", "el salvador": "sv", "algeria": "dz", "oman": "om",
    "kuwait": "kw", "lebanon": "lb", "guatemala": "gt", "bosnia and herzegovina": "ba", "iraq": "iq", "albania": "al",
    "qatar": "qa", "bolivia": "bo", "paraguay": "py", "honduras": "hn", "nicaragua": "ni",
}


def country_code(name):
    return COUNTRY_CODE.get(str(name or "").strip().lower())


# Leagues played in one country: their teams' country when Leaguepedia has none for the team
LEAGUE_COUNTRY = {"LCK": "kr", "LCK CL": "kr", "LPL": "cn", "LDL": "cn", "CBLOL": "br", "VCS": "vn", "LJL": "jp", "LFL": "fr",
                  "PRM": "de", "SL": "es", "TCL": "tr", "NLC": "gb", "LIT": "it", "LPLOL": "pt", "UL": "pl", "HM": "cz",
                  "LCO": "au", "LLA": "mx"}
# leagues without a short name (academy and amateur leagues)
LEAGUE_NAME_COUNTRY = {"LCK Academy Series": "kr", "LCK Challengers League": "kr", "KeG Championship": "kr",
                       "LPL Academy": "cn", "LDL": "cn"}


def r1(x):
    return round(x, 1)


def rmin(x):
    """Minutes kept to the second (a game length shown as m:ss)."""
    return round(x, 3)


# Milestones worth a caster's mention, and how close counts as "within reach"
MILESTONES = {"games": (100, 5), "wins": (100, 5), "kills": (500, 12), "assists": (1000, 25)}


def milestone_notes(totals):
    """[{"k": "ms", "s": "wins", "n": 1200, "left": 3}, ...] for totals close to the next round number."""
    out = []
    for key, (step, reach) in MILESTONES.items():
        v = totals.get(key) or 0
        nxt = (v // step + 1) * step
        if v >= step // 2 and nxt - v <= reach:
            out.append({"k": "ms", "s": key, "n": nxt, "left": nxt - v})
    return out


def r2(x):
    return round(x, 2)


def kda(k, d, a):
    return r2((k + a) / max(d, 1))


def num(x):
    try:
        return int(x) if x is not None and str(x).strip() != "" else None
    except (TypeError, ValueError):
        try:
            return int(float(x))
        except (TypeError, ValueError):
            return None


def chunks(lst, n=800):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def parse_len(s):
    try:
        m, sec = str(s).split(":")[:2]
        return int(m) + int(sec) / 60
    except Exception:
        return None


class Writer:
    """Writes hub files. A file whose content is the same as in the previous build is hard-linked to
    it instead (most series never change again), so a nightly build stays fast and small.

    Files are written by a pool of threads: on the server each new file waits for the virus scanner
    and a busy disk, so writing many at once is several times faster than one after another."""

    THREADS = 16
    MAX_PENDING = 4000  # files queued but not yet on disk (bounds memory)

    def __init__(self, vdir, prev_vdir):
        self.root = os.path.join(vdir, "hub")
        self.prev_root = os.path.join(prev_vdir, "hub") if prev_vdir else None
        self.prev = {}
        if self.prev_root:
            try:
                with open(os.path.join(self.prev_root, "manifest.json"), encoding="utf-8") as f:
                    self.prev = json.load(f)
            except (OSError, ValueError):
                self.prev = {}
        self.manifest = {}
        self.dirs = set()
        self.written = self.linked = self.bytes = 0
        self.lock = threading.Lock()
        self.slots = threading.BoundedSemaphore(self.MAX_PENDING)
        self.pool = concurrent.futures.ThreadPoolExecutor(self.THREADS)
        self.errors = []

    def _store(self, rel, path, data, link):
        try:
            if link:
                try:
                    os.link(os.path.join(self.prev_root, rel), path)
                    with self.lock:
                        self.linked += 1
                    return
                except OSError:
                    pass
            with open(path, "wb") as f:
                f.write(data)
            with self.lock:
                self.written += 1
                self.bytes += len(data)
        except Exception as e:  # reported by finish()
            with self.lock:
                self.errors.append(f"{rel}: {e}")
        finally:
            self.slots.release()

    def _put(self, rel, data: bytes):
        h = hashlib.sha1(data).hexdigest()[:16]
        self.manifest[rel] = h
        path = os.path.join(self.root, rel)
        d = os.path.dirname(path)
        if d not in self.dirs:
            os.makedirs(d, exist_ok=True)
            self.dirs.add(d)
        self.slots.acquire()
        self.pool.submit(self._store, rel, path, data, self.prev.get(rel) == h)

    def json(self, rel, obj):
        self._put(rel, show_teams(json.dumps(obj, ensure_ascii=False, separators=(",", ":"))).encode("utf-8"))

    def text(self, rel, text):
        self._put(rel, show_teams(text).encode("utf-8"))

    def finish(self):
        self.pool.shutdown(wait=True)
        if self.errors:
            raise OSError(f"{len(self.errors)} hub files could not be written, e.g. {self.errors[:3]}")
        with open(os.path.join(self.root, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(self.manifest, f, separators=(",", ":"))


def clean(s):
    """Leaguepedia text can still hold HTML entities (&nbsp;, &amp;)."""
    if not s or not isinstance(s, str):
        return s
    return re.sub(r"\s+", " ", html.unescape(s)).strip()  # \s also matches the no-break space


def short_slug(name, slug):
    """Search lists leave the slug out when the app can work it out from an ASCII name."""
    return "" if name and name.isascii() and pretty(name) == slug else slug


def soloq_ids(text):
    """Leaguepedia's solo queue field (bold server names, accounts separated by <br>) as a list of "KR: name"."""
    if not text:
        return []
    out = []
    for part in re.split(r"<br\s*/?>", str(text)):
        part = re.sub(r"'{2,}", "", clean(part) or "").strip()
        if part:
            out.append(part)
    return out[:8]


def tsv_cell(s) -> str:
    return re.sub(r"[\t\r\n]+", " ", str(s or "")).strip()


CSV_FORMULA = re.compile(r"^[=+\-@\t\r]")
CSV_NUMBER = re.compile(r"^[-+]?\d+(\.\d+)?$")


def csv_safe(v):
    """A spreadsheet reads text starting with = + - @ as a formula: such names (from a public wiki) get a leading '."""
    return f"'{v}" if isinstance(v, str) and CSV_FORMULA.match(v) and not CSV_NUMBER.match(v) else v


# ── page summaries: a few sentences with numbers on the bigger pages, for search engines (seo/<kind>.tsv) ──

ROLE_NOUN = {"Top": "top laner", "Jungle": "jungler", "Mid": "mid laner", "Bot": "bot laner", "Support": "support"}


def champ_list(champs, with_wins=True):
    """Azir (213 games, 71% wins), Orianna (128 games), Ryze (119 games): the first with its win rate."""
    out = []
    for i, c in enumerate(champs[:3]):
        wins = f", {round(100 * c['w'] / c['g'])}% wins" if with_wins and i == 0 and c.get("g") else ""
        out.append(f"{c['c']} ({c['g']:,} games{wins})")
    return ", ".join(out)


def player_summary(name, role, club, p, obj, titles):
    """'' under 100 games. No pronouns: the sentences name the player or say nothing."""
    if p["g"] < 100 or not obj.get("years"):
        return ""
    first, last = obj["years"][-1]["y"], obj["years"][0]["y"]
    current = club and last >= str(datetime.date.today().year - 1)
    s = (f"{name} has played {p['g']:,} pro games as a {ROLE_NOUN.get(role, (role or 'player').lower())} from {first} to {last}"
         f"{', now for ' + club if current else ''}, winning {round(100 * p['w'] / p['g'])}% of them with a KDA of {obj['kda']}.")
    if obj.get("champs"):
        s += f" Most played champions: {champ_list(obj['champs'])}."
    if titles:
        worlds = sum(1 for t in titles if t[2] == "Worlds")
        s += f" {len(titles)} title{'s' if len(titles) != 1 else ''}" + (f", including {worlds} Worlds." if worlds else ".")
    return s


def team_summary(name, t, obj, worlds):
    if t["g"] < 100:
        return ""
    s = (f"{name} has played {t['g']:,} pro games from {t['from'][:4]} to {t['to'][:4]}, "
         f"with a record of {t['w']:,}-{t['g'] - t['w']:,} ({round(100 * t['w'] / t['g'])}% wins).")
    n = len(obj.get("titles") or [])
    if n:
        s += f" {n} title{'s' if n != 1 else ''}" + (f", including {worlds} Worlds." if worlds else ".")
    r = obj.get("rating") or {}
    if r.get("rank"):
        s += f" Power ranking: #{r['rank']} of the top-league teams worldwide (rating {r['r']:,})."
    elif r.get("lrank") and r.get("league"):
        s += f" Power ranking: #{r['lrank']} in {r['league']}."
    if obj.get("champs"):
        s += f" Most picked champions: {champ_list(obj['champs'], with_wins=False)}."
    return s


# ── the build ─────────────────────────────────────────────────────────────────
