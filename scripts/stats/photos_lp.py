"""Player photos for pros Riot has no picture of (retired players, old rosters), from Leaguepedia.

Riot's team list only has photos of players on current rosters, so the stats pages of retired pros
show their initials. Leaguepedia keeps a photo of nearly everyone (its PlayerImages table: one row
per picture, with the team and tournament it was taken for). This script fetches those photos,
slowly and once per player, and stores small copies next to the stats build:

  <out>/photos/<player slug>.webp          about 256 px wide, served at riftwise.gg/stats/photos/...
  <script folder>/photos_lp.json           what was fetched (page, file, team, date) or tried: the
                                           next run only looks at players that aren't in it yet
  <out>/<current build>/hub/photos.json    {slug: "YYYYMMDD"}: tells the app which players have a
                                           photo (the stats build writes it too, see hub.py)

How it talks to Leaguepedia (lol.fandom.com), which blocks plain scripts:
  - the picture list comes from the CargoExport page (one query per 50 players), as the stats build
    reads its other tables; the api.php route answers "ratelimited" after a handful of calls
  - a file's address is built from its name the MediaWiki way (md5 hash folders), so no lookup call
  - downloads carry browser headers and a Referer; the image server returns 403 without them
  - at least 3 seconds between requests, a few hundred downloads per run, and a rate-limit answer
    ends the run cleanly (the rest is picked up the next night: task RiftWisePhotos, run_photos_lp.cmd)

Team logos the same way, after the photos (TV, 2026-10-28: "make sure all the teams have their proper logos"): for
every team the app finds no logo for in Riot's list (lower leagues, academies, old teams), newest teams first, the
logo of its Leaguepedia page (the Teams table's Image):

  <out>/logos/<team slug>.webp             at most 256 px wide, served at riftwise.gg/stats/logos/...
  <script folder>/logos_lp.json            what was fetched or tried, as photos_lp.json
  <out>/<current build>/hub/logos.json     {slug: "YYYYMMDD"}: which teams have one (hub.py writes it too)

  python photos_lp.py --out C:\\inetpub\\wwwroot\\riftwise\\stats [--max 300] [--max-logos 300] [--delay 3]
                      [--only doublelift,uzi]   (test: these slugs only, whether or not Riot has them)
                      [--only-teams forsaken-polish-team,...]   (test: these team slugs only, no photos)

The photos belong to the teams and leagues that published them, as noted on each file's Leaguepedia
page; RiftWise credits Leaguepedia on its About page.
"""
import argparse
import datetime
import hashlib
import html
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

CARGO_EXPORT = "https://lol.fandom.com/wiki/Special:CargoExport"
IMAGES = "https://static.wikia.nocookie.net/lolesports_gamepedia_en/images"
RIOT_TEAMS = "https://esports-api.lolesports.com/persisted/gw/getTeams?hl=en-US"
RIOT_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"  # the public key the app and every esports site use
BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
UA_WIKI = BROWSER + " RiftWise/1.0 (+https://riftwise.gg)"  # the wiki gets a contact address
IMAGE_HEADERS = {"User-Agent": BROWSER, "Referer": "https://lol.fandom.com/",
                 "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"}
WIDTH = 256
BATCH = 50  # players per Leaguepedia query
RATE_WAITS = (120, 300)  # pauses after a rate-limit answer before the run gives up
RETRY_NO_IMAGE_DAYS = 120  # a player who had no picture is looked up again after this long
CACHE_NAME = "photos_lp.json"
LOGO_CACHE_NAME = "logos_lp.json"

# Riot's list has a picture for everyone, but many are the same stand-in silhouette; those don't count.
PLACEHOLDER = re.compile(r"default-headshot|silhouette|placeholder|/download\.png|pobrane|noplayer", re.I)

# Same rules as pretty() in hub.py and prettySlug() in src/hub/data.ts; keep the three in step.
LETTERS = str.maketrans({"Ø": "O", "ø": "o", "Æ": "AE", "æ": "ae", "Œ": "OE", "œ": "oe", "ß": "ss", "Ł": "L", "ł": "l",
                         "Đ": "D", "đ": "d", "Þ": "Th", "þ": "th", "ı": "i", "Ð": "D", "ð": "d"})
QUOTES = re.compile("['\u2019`.]")


def pretty(text: str) -> str:
    s = unicodedata.normalize("NFKD", html.unescape(text or "").translate(LETTERS))
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower().replace("&", " and ")
    s = QUOTES.sub("", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:70].strip("-")


def norm(s) -> str:
    """Name matching as the app does it (riotCatalog.ts): letters and digits only, lower case."""
    return "".join(ch for ch in (s or "").lower() if ch.isalnum())


class RateLimited(Exception):
    pass


class Fetcher:
    """HTTP with a pause before every request. A rate-limit answer (HTTP 429, or 403 from the wiki)
    is retried after long pauses, then ends the run (RateLimited)."""

    def __init__(self, delay: float):
        self.delay = delay
        self.last = 0.0
        self.calls = 0

    def get(self, url: str, headers: dict, timeout=60) -> bytes:
        for attempt in range(len(RATE_WAITS) + 1):
            wait = self.last + self.delay - time.time()
            if wait > 0:
                time.sleep(wait)
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    return r.read()
            except urllib.error.HTTPError as e:
                if e.code not in (403, 429):
                    raise
                if attempt == len(RATE_WAITS):
                    raise RateLimited(f"HTTP {e.code} from {urllib.parse.urlsplit(url).netloc}")
                print(f"  HTTP {e.code} from {urllib.parse.urlsplit(url).netloc}; waiting {RATE_WAITS[attempt]} s", flush=True)
                time.sleep(RATE_WAITS[attempt])
            finally:
                self.last = time.time()
                self.calls += 1

    def cargo(self, params: dict) -> list:
        """Rows of one Cargo query through the export page."""
        url = CARGO_EXPORT + "?" + urllib.parse.urlencode({"format": "json", **params})
        body = self.get(url, {"User-Agent": UA_WIKI, "Accept": "application/json"})
        try:
            rows = json.loads(body)
        except ValueError:
            raise RuntimeError(f"Leaguepedia did not answer with data: {body[:200]!r}")
        if isinstance(rows, dict):  # api-style error object
            err = rows.get("error") or {}
            if err.get("code") == "ratelimited":
                raise RateLimited("Leaguepedia says ratelimited")
            raise RuntimeError(f"Leaguepedia error: {err.get('code')}: {err.get('info')}")
        return rows


# -- who has a Riot photo ------------------------------------------------------------------------

def riot_index(cache_path: str = None) -> dict:
    """From Riot's team list, for hub.py to put Riot's pictures in the stats files (the app would otherwise wait for
    Riot's whole team list, ~300 KB, before showing them): {"p": {normalised player name: [(normalised team name,
    photo)]}, "n": {normalised team name: logo}, "c": {normalised team code: logo}} (active teams' names first).
    The last good copy is kept next to this script for when Riot doesn't answer."""
    cache_path = cache_path or os.path.join(os.path.dirname(os.path.abspath(__file__)), "riot_photos.json")
    index = None
    try:
        if os.environ.get("RIFTWISE_OFFLINE"):
            raise RuntimeError("offline")
        req = urllib.request.Request(RIOT_TEAMS, headers={"User-Agent": UA_WIKI, "x-api-key": RIOT_KEY})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
        index = {"p": {}, "n": {}, "c": {}}
        teams = sorted(data.get("data", {}).get("teams", []), key=lambda t: t.get("status") != "active")
        for t in teams:
            for p in t.get("players") or []:
                if p.get("image") and p.get("summonerName") and not PLACEHOLDER.search(p["image"]):
                    index["p"].setdefault(norm(p["summonerName"]), []).append((norm(t.get("name")), p["image"]))
            if t.get("image"):
                index["n"].setdefault(norm(t.get("name")), t["image"])
                if t.get("code"):
                    index["c"].setdefault(norm(t["code"]), t["image"])
        if len(index["p"]) > 500:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(index, f)
        else:
            index = None
    except Exception as e:  # noqa: BLE001 - any failure: the last copy
        print(f"Riot team list not fetched ({e}); using the last copy", flush=True)
    if index is None:
        try:
            with open(cache_path, encoding="utf-8") as f:
                index = json.load(f)
        except (OSError, ValueError):
            index = {}
    return {"p": index.get("p", {}), "n": index.get("n", {}), "c": index.get("c", {})}


_FOLD = str.maketrans({"ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "đ": "d", "ł": "l", "þ": "th", "ı": "i"})


def fold(s: str) -> str:
    """Accents and special letters to plain ones ("løs" -> "los", "é" -> "e")."""
    s = unicodedata.normalize("NFKD", (s or "").translate(_FOLD))
    return "".join(ch for ch in s if not unicodedata.combining(ch))


def riot_logo(index: dict, name: str, code: str = None):
    """A team's logo from riot_index(): its name, else its code, else the one Riot name that starts like it."""
    n = norm(name)
    if n in index["n"]:
        return index["n"][n]
    if code and norm(code) in index["c"]:
        return index["c"][norm(code)]
    # letters Riot writes plainly: "LØS" is "LOS" in Riot's list
    folded = {fold(k): v for k, v in index["n"].items()}
    if fold(n) in folded:
        return folded[fold(n)]
    # names that start like it ("Gen.G" -> "Gen.G Esports", not also "Gen.G Global Academy"): the closest one,
    # when only one is closest
    near = sorted((len(k), v) for k, v in index["n"].items() if n and len(n) >= 3 and len(k) >= 3 and (k.startswith(n) or n.startswith(k)))
    if not near:
        return None
    best = [v for ln, v in near if ln == near[0][0]]
    return best[0] if len(set(best)) == 1 else None


def riot_names_with_photo(fetcher: Fetcher, cache_path: str) -> set:
    """Normalised names of players with a real photo in Riot's team list (fresh when Riot answers,
    else the last copy; empty when there is neither, which only means a few needless downloads)."""
    names = None
    try:
        data = json.loads(fetcher.get(RIOT_TEAMS, {"User-Agent": UA_WIKI, "x-api-key": RIOT_KEY}, timeout=30))
        names = sorted({norm(p.get("summonerName")) for t in data.get("data", {}).get("teams", [])
                        if t.get("status") == "active"
                        for p in t.get("players") or [] if p.get("image") and not PLACEHOLDER.search(p["image"])})
        if len(names) > 500:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(names, f)
        else:
            names = None
    except Exception as e:  # noqa: BLE001 - any failure: use the cached list
        print(f"Riot team list not fetched ({e}); using the cached copy", flush=True)
    if names is None:
        try:
            with open(cache_path, encoding="utf-8") as f:
                names = json.load(f)
        except (OSError, ValueError):
            names = []
    return set(names)


# -- Leaguepedia -----------------------------------------------------------------------------

def cargo_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def lp_images(fetcher: Fetcher, pages: list) -> dict:
    """page -> (file name, team, tournament) for the players' newest profile picture."""
    where = "Link IN (" + ",".join(f'"{cargo_escape(p)}"' for p in pages) + ")"
    rows = fetcher.cargo({"tables": "PlayerImages", "fields": "Link,FileName,Team,Tournament,IsProfileImage,SortDate",
                          "where": where, "order by": "SortDate DESC", "limit": 500})
    best = {}
    for t in rows:
        link, fn = t.get("Link"), t.get("FileName")
        if not link or not fn:
            continue
        profile = str(t.get("IsProfileImage")) in ("1", "Yes")
        date = t.get("SortDate") or ""
        cur = best.get(link)
        # a profile picture beats any other; among equals the newest wins
        if cur is None or (profile, date) > (cur[0], cur[1]):
            best[link] = (profile, date, (fn, t.get("Team") or "", t.get("Tournament") or ""))
    return {k: v[2] for k, v in best.items()}


def file_url(fn: str) -> str:
    """The file's address on the wiki's image server: MediaWiki files it under two folders named
    after the md5 of its name ("TL Doublelift 2026.png" -> images/a/aa/TL_Doublelift_2026.png)."""
    name = fn.strip().replace(" ", "_")
    name = name[:1].upper() + name[1:]
    h = hashlib.md5(name.encode("utf-8")).hexdigest()
    return f"{IMAGES}/{h[0]}/{h[:2]}/{urllib.parse.quote(name)}/revision/latest"


def to_webp(data: bytes) -> bytes:
    from PIL import Image  # Pillow; imported here so the help text works without it
    im = Image.open(io.BytesIO(data))
    im.load()
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    im = im.convert("RGBA" if has_alpha else "RGB")
    if im.width > WIDTH:
        im = im.resize((WIDTH, max(1, round(im.height * WIDTH / im.width))), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=82, method=6)
    return buf.getvalue()


# -- the stats build's player list -------------------------------------------------------------

def current_hub(out_root: str) -> str:
    with open(os.path.join(out_root, "latest.json"), encoding="utf-8") as f:
        version = str(json.load(f)["version"])
    return os.path.join(out_root, version, "hub")


def player_page(hub: str, slug: str):
    """The player's Leaguepedia page name (the PlayerImages.Link), from the player's page file."""
    try:
        with open(os.path.join(hub, "player", f"{slug}.json"), encoding="utf-8") as f:
            return json.load(f).get("page")
    except (OSError, ValueError):
        return None


def photos_map(out_root: str, player_slug: dict, cache_path: str = None) -> dict:
    """{slug: "YYYYMMDD"} for every player whose photo is on disk; used by hub.py at each build and
    by this script after a run. player_slug maps Leaguepedia page -> current slug."""
    cache_path = cache_path or os.path.join(os.path.dirname(os.path.abspath(__file__)), CACHE_NAME)
    try:
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
    except (OSError, ValueError):
        return {}
    photos = {}
    for slug, e in cache.items():
        if not e.get("file"):
            continue
        page = e.get("page")
        if page in player_slug and player_slug[page] != slug:
            continue  # the slug moved; the next fetch stores it under the new one
        if os.path.isfile(os.path.join(out_root, "photos", f"{slug}.webp")):
            photos[slug] = (e.get("fetched") or "").replace("-", "")
    return photos


# -- team logos ----------------------------------------------------------------------------------

def riot_team_names(fetcher: Fetcher, cache_path: str) -> set:
    """Normalised names of the teams the app takes from Riot's list (active, with players and a logo): the teams
    whose logo the app finds there by name (fresh when Riot answers, else the last copy)."""
    names = None
    try:
        data = json.loads(fetcher.get(RIOT_TEAMS, {"User-Agent": UA_WIKI, "x-api-key": RIOT_KEY}, timeout=30))
        names = sorted({norm(t.get("name") or t.get("slug")) for t in data.get("data", {}).get("teams", [])
                        if t.get("status") == "active" and t.get("players") and t.get("slug") and t.get("image")})
        if len(names) > 100:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(names, f)
        else:
            names = None
    except Exception as e:  # noqa: BLE001 - any failure: use the cached list
        print(f"Riot team list not fetched ({e}); using the cached copy", flush=True)
    if names is None:
        try:
            with open(cache_path, encoding="utf-8") as f:
                names = json.load(f)
        except (OSError, ValueError):
            names = []
    return set(names)


def app_finds_riot_logo(riot: set, name: str) -> bool:
    """Whether the app's useTeamLogo finds Riot's logo for a team by its name alone: the name, the name without a
    Leaguepedia note, or a longer Riot name that starts with it (cards don't always know a team's code)."""
    n = norm(name)
    if n in riot or norm(re.sub(r"\s*\([^()]*\)\s*$", "", name or "")) in riot:
        return True
    return len(n) >= 4 and any(k.startswith(n) for k in riot)


def lp_team_images(fetcher: Fetcher, pages: list) -> dict:
    """Leaguepedia team page -> its logo file (the Teams table's Image)."""
    where = "OverviewPage IN (" + ",".join(f'"{cargo_escape(p)}"' for p in pages) + ")"
    rows = fetcher.cargo({"tables": "Teams", "fields": "OverviewPage,Image", "where": where, "limit": 500})
    return {t["OverviewPage"]: t["Image"] for t in rows if t.get("OverviewPage") and t.get("Image")}


def logos_map(out_root: str, cache_path: str = None) -> dict:
    """{team slug: "YYYYMMDD"} for every team whose Leaguepedia logo is on disk; used by hub.py at each build and by
    this script after a run."""
    cache_path = cache_path or os.path.join(os.path.dirname(os.path.abspath(__file__)), LOGO_CACHE_NAME)
    try:
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
    except (OSError, ValueError):
        return {}
    return {slug: (e.get("fetched") or "").replace("-", "") for slug, e in cache.items()
            if e.get("file") and os.path.isfile(os.path.join(out_root, "logos", f"{slug}.webp"))}


def fetch_logos(fetcher: Fetcher, hub: str, out_root: str, cache_path: str, riot_cache: str, max_n: int, only=None) -> str:
    """Leaguepedia logos for the teams the app finds none for in Riot's list, the newest teams first (then the most
    games). Returns why it stopped early, or None."""
    from names import TEAM_NAMES  # the stats build's shown names: back to Leaguepedia's page names
    page_of = {shown: page for page, shown in TEAM_NAMES.items()}
    logos_dir = os.path.join(out_root, "logos")
    os.makedirs(logos_dir, exist_ok=True)
    today = datetime.date.today().isoformat()
    try:
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
    except (OSError, ValueError):
        cache = {}
    with open(os.path.join(hub, "search", "teams.json"), encoding="utf-8") as f:
        index = json.load(f)  # [name, slug or "", games, last year, old names, short names, region]
    riot = set() if only else riot_team_names(fetcher, riot_cache)
    retry_before = (datetime.date.today() - datetime.timedelta(days=RETRY_NO_IMAGE_DAYS)).isoformat()
    todo = []
    for row in sorted(index, key=lambda r: (str(r[3] or ""), r[2] or 0), reverse=True):
        name, slug = row[0], row[1] or pretty(row[0])
        if only is not None:
            if slug not in only:
                continue
        elif app_finds_riot_logo(riot, name):
            continue
        e = cache.get(slug)
        if e and (e.get("file") or (e.get("tried") or "9999") > retry_before):
            continue
        todo.append((slug, page_of.get(name, name)))
    print(f"{len(index)} teams in the index, {len(riot)} with a Riot logo, {len(todo)} logos to look up"
          + (f" (first {max_n})" if len(todo) > max_n else ""), flush=True)
    todo = todo[:max_n]

    downloaded = no_image = failed = 0
    stopped = None
    try:
        for i in range(0, len(todo), BATCH):
            pages = {page: slug for slug, page in todo[i:i + BATCH]}
            # Leaguepedia matches page names regardless of case: map them back
            lower = {page.lower(): page for page in pages}
            found = {lower.get(k.lower(), k): v for k, v in lp_team_images(fetcher, list(pages)).items()}
            for page, slug in pages.items():
                fn = found.get(page)
                if not fn:
                    cache[slug] = {"page": page, "file": None, "tried": today}
                    no_image += 1
                    continue
                try:
                    webp = to_webp(fetcher.get(file_url(fn), IMAGE_HEADERS))
                except RateLimited:
                    raise
                except Exception as e:  # noqa: BLE001 - a bad or missing file: note it, carry on
                    cache[slug] = {"page": page, "file": None, "tried": today, "note": f"{fn}: {e}"}
                    failed += 1
                    print(f"  {slug}: {fn}: {e}", flush=True)
                    continue
                tmp = os.path.join(logos_dir, f"{slug}.webp.tmp")
                with open(tmp, "wb") as f:
                    f.write(webp)
                os.replace(tmp, os.path.join(logos_dir, f"{slug}.webp"))
                cache[slug] = {"page": page, "file": fn, "fetched": today}
                downloaded += 1
            write_json_atomic(cache_path, cache)
            print(f"  {min(i + BATCH, len(todo))}/{len(todo)}: {downloaded} logos, {no_image} without", flush=True)
    except RateLimited as e:
        stopped = str(e)
    except KeyboardInterrupt:
        stopped = "interrupted"
    finally:
        write_json_atomic(cache_path, cache)
    logos = logos_map(out_root, cache_path)
    try:
        write_json_atomic(os.path.join(hub, "logos.json"), logos)
    except OSError as e:
        print(f"logos.json not written: {e}", flush=True)
    print(f"logos: {downloaded} downloaded, {no_image} without a logo, {failed} failed, {len(logos)} logos in all"
          + (f"; stopped early: {stopped}" if stopped else ""), flush=True)
    return stopped


def write_json_atomic(path: str, obj) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


# -- main --------------------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", required=True, help="the stats folder (holds latest.json, the builds and photos/)")
    ap.add_argument("--hub", help="a build's hub folder (default: the current build's, from latest.json)")
    ap.add_argument("--cache", help=f"the fetch record (default: {CACHE_NAME} next to this script)")
    ap.add_argument("--max", type=int, default=300, help="downloads per run (default 300)")
    ap.add_argument("--delay", type=float, default=3.0, help="seconds between requests (default 3)")
    ap.add_argument("--only", help="comma-separated player slugs to fetch, Riot photo or not (testing)")
    ap.add_argument("--max-logos", type=int, default=300, help="team logo downloads per run (default 300; 0: none)")
    ap.add_argument("--logo-cache", help=f"the logo fetch record (default: {LOGO_CACHE_NAME} next to this script)")
    ap.add_argument("--only-teams", help="comma-separated team slugs to fetch logos for, Riot logo or not, and no photos (testing)")
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    cache_path = args.cache or os.path.join(here, CACHE_NAME)
    hub = args.hub or current_hub(args.out)
    photos_dir = os.path.join(args.out, "photos")
    os.makedirs(photos_dir, exist_ok=True)
    today = datetime.date.today().isoformat()
    t0 = time.time()
    fetcher = Fetcher(args.delay)

    try:
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
    except (OSError, ValueError):
        cache = {}

    def save_cache():
        write_json_atomic(cache_path, cache)

    with open(os.path.join(hub, "search", "players.json"), encoding="utf-8") as f:
        index = json.load(f)  # [name, slug or "", last team, games, last year, role, real name]
    only = set(s.strip() for s in args.only.split(",") if s.strip()) if args.only else None
    only_teams = set(s.strip() for s in args.only_teams.split(",") if s.strip()) if args.only_teams else None
    if only_teams:
        stopped = fetch_logos(fetcher, hub, args.out, args.logo_cache or os.path.join(here, LOGO_CACHE_NAME),
                              os.path.join(here, "riot_teams.json"), args.max_logos, only_teams)
        print(f"done: {fetcher.calls} requests in {time.time() - t0:.0f}s" + (f"; stopped early: {stopped}" if stopped else ""), flush=True)
        return 0
    riot = set() if only else riot_names_with_photo(fetcher, os.path.join(here, "riot_players.json"))

    # Who still needs a look: most games first, so the best-known players come first
    retry_before = (datetime.date.today() - datetime.timedelta(days=RETRY_NO_IMAGE_DAYS)).isoformat()
    todo = []
    for row in sorted(index, key=lambda r: -(r[3] or 0)):
        name, slug = row[0], row[1] or pretty(row[0])
        if only is not None:
            if slug not in only:
                continue
        elif norm(name) in riot:
            continue
        e = cache.get(slug)
        if e and (e.get("file") or (e.get("tried") or "9999") > retry_before):
            continue
        todo.append(slug)
    print(f"{len(index)} players in the index, {len(riot)} names with a Riot photo, {len(todo)} to look up"
          + (f" (first {args.max})" if len(todo) > args.max else ""), flush=True)
    todo = todo[:args.max]

    downloaded = no_image = failed = 0
    stopped = None
    try:
        for i in range(0, len(todo), BATCH):
            group = todo[i:i + BATCH]
            pages = {}
            for slug in group:
                page = player_page(hub, slug)
                if page:
                    pages[page] = slug
                else:
                    cache[slug] = {"page": None, "file": None, "tried": today}
            if not pages:
                continue
            # Leaguepedia matches names regardless of case ("XPeke" finds the page "xPeke"): map them back
            lower = {page.lower(): page for page in pages}
            found = {lower.get(k.lower(), k): v for k, v in lp_images(fetcher, list(pages)).items()}
            for page, slug in pages.items():
                if page not in found:
                    cache[slug] = {"page": page, "file": None, "tried": today}
                    no_image += 1
            for page, (fn, team, tournament) in found.items():
                slug = pages.get(page)
                if not slug:
                    continue
                try:
                    webp = to_webp(fetcher.get(file_url(fn), IMAGE_HEADERS))
                except RateLimited:
                    raise
                except Exception as e:  # noqa: BLE001 - a bad or missing file: note it, carry on
                    cache[slug] = {"page": page, "file": None, "tried": today, "note": f"{fn}: {e}"}
                    failed += 1
                    print(f"  {slug}: {fn}: {e}", flush=True)
                    continue
                tmp = os.path.join(photos_dir, f"{slug}.webp.tmp")
                with open(tmp, "wb") as f:
                    f.write(webp)
                os.replace(tmp, os.path.join(photos_dir, f"{slug}.webp"))
                cache[slug] = {"page": page, "file": fn, "team": team, "tournament": tournament, "fetched": today}
                downloaded += 1
            save_cache()
            print(f"  {min(i + BATCH, len(todo))}/{len(todo)}: {downloaded} photos, {no_image} without", flush=True)
    except RateLimited as e:
        stopped = str(e)
    except KeyboardInterrupt:
        stopped = "interrupted"
    finally:
        save_cache()

    # Tell the app about the photos right away (the next stats build writes this file too)
    player_slug = {e["page"]: slug for slug, e in cache.items() if e.get("page")}
    photos = photos_map(args.out, player_slug, cache_path)
    try:
        write_json_atomic(os.path.join(hub, "photos.json"), photos)
    except OSError as e:
        print(f"photos.json not written: {e}", flush=True)
    print(f"photos: {downloaded} downloaded, {no_image} without a picture, {failed} failed, {len(photos)} photos in all"
          + (f"; stopped early: {stopped}" if stopped else ""), flush=True)
    # then the team logos, unless Leaguepedia already said to stop
    if not stopped and not only and args.max_logos > 0:
        stopped = fetch_logos(fetcher, hub, args.out, args.logo_cache or os.path.join(here, LOGO_CACHE_NAME),
                              os.path.join(here, "riot_teams.json"), args.max_logos)
    print(f"done: {fetcher.calls} requests in {time.time() - t0:.0f}s" + (f"; stopped early: {stopped}" if stopped else ""), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
