"""Riot's Data Dragon lists, boiled down for the app: hub/dd.json and hub/dd/<language>.json in each stats build.

The stats name champions, items, spells and runes in English ("Kai'Sa", "Rabadon's Deathcap", "Flash"); the app turns
those names into Data Dragon picture addresses, and in another language shows Riot's translated names. It used to read
Riot's full lists for that: about 150 KB on a phone (four files), and as much again in another language, before the
first champion picture could show. These files hold only the lookups the app uses (about 9 KB, and 7 KB per language,
once compressed), worked out the same way as src/hub/ddragon.ts and src/champions.ts did. The app falls back to
Riot's lists when they're missing.

Downloads are kept per game version in <script folder>/ddragon_cache/<version>.json, so a build only downloads when
Riot ships a patch. A failure just leaves the files out of that build (hub.py goes on without them).

Items Riot has since removed (Broken Stopwatch, Luden's Tempest, the old jungle enchantments...) aren't in the current
lists, but their pictures are still on Data Dragon under the patches that had them: dd.json "itemOld" maps each such
item of the stats to "<version>/<item id>", from the newest old patch that has it (legacy_items; each old patch's
item names are kept in ddragon_cache/legacy_items.json, since an old patch never changes). The app also tries an item
without a "(0.9.25.21 - 10.22)" range or a " - Warrior" enchantment in its name.
"""
import concurrent.futures
import json
import os
import re
import urllib.request
from collections import defaultdict

DD = "https://ddragon.leagueoflegends.com"
# app language -> Data Dragon locale (the same table as DD_LOCALE in src/champions.ts)
LOCALES = {"es": "es_ES", "pt-BR": "pt_BR", "ko": "ko_KR", "vi": "vi_VN", "zh-CN": "zh_CN", "zh-TW": "zh_TW",
           "ja": "ja_JP", "fr": "fr_FR", "de": "de_DE", "tr": "tr_TR"}
FILES = ("champion", "item", "summoner", "runesReforged")
UA = {"User-Agent": "RiftWise-stats/1.0 (riftwise.gg; stats build)"}
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ddragon_cache")


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def get(url):
    if os.environ.get("RIFTWISE_OFFLINE"):
        raise RuntimeError("offline: no Data Dragon download")
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


def lists(v, loc):
    with concurrent.futures.ThreadPoolExecutor(len(FILES)) as ex:
        return dict(zip(FILES, ex.map(get, [f"{DD}/cdn/{v}/data/{loc}/{f}.json" for f in FILES])))


def english(v):
    """Name -> picture lookups, finished items and the champion list (ddragon.ts Maps)."""
    d = lists(v, "en_US")
    m = {"v": v, "champ": {}, "item": {}, "spell": {}, "rune": {}, "full": {}, "names": []}
    for cid, c in d["champion"]["data"].items():
        m["champ"][norm(c["name"])] = cid
        m["champ"][norm(cid)] = cid
        m["names"].append(c["name"])
    for iid, it in d["item"]["data"].items():
        k = norm(it.get("name"))
        # Several ids can share a name (Arena / Ornn versions): keep the lowest, the normal one
        if k not in m["item"] or int(iid) < int(m["item"][k]):
            m["item"][k] = iid
        tags = it.get("tags") or []
        depth = it.get("depth") if it.get("depth") is not None else 1
        finished = not it.get("into") and "Consumable" not in tags and "Trinket" not in tags
        usable = "Consumable" not in tags and "Trinket" not in tags
        tier2_boots = usable and "Boots" in tags and depth >= 2  # what players finish on (Plated Steelcaps)
        support_item = finished and "GoldPer" in tags and depth >= 2  # its last upgrade costs little
        if (finished and ((it.get("gold") or {}).get("total") or 0) >= 900) or tier2_boots or support_item:
            m["full"][k] = 1
    for s in d["summoner"]["data"].values():
        m["spell"][norm(s["name"])] = s["image"]["full"]
    for tree in d["runesReforged"]:
        m["rune"][norm(tree["name"])] = tree["icon"]
        for slot in tree["slots"]:
            for r in slot["runes"]:
                m["rune"][norm(r["name"])] = r["icon"]
    return m


def translated(v, loc):
    """Riot's names in one language: champion (by normalized id), item (by id), spell (by image), rune (by icon)."""
    d = lists(v, loc)
    m = {"v": v, "champ": {}, "item": {}, "spell": {}, "rune": {}}
    for cid, c in d["champion"]["data"].items():
        # Simplified Chinese keeps the everyday name (阿狸) in "title" and the epithet (九尾妖狐) in "name"
        m["champ"][norm(cid)] = (c.get("title") or c["name"]) if loc == "zh_CN" else c["name"]
    for iid, it in d["item"]["data"].items():
        m["item"][iid] = it.get("name")
    for s in d["summoner"]["data"].values():
        m["spell"][s["image"]["full"]] = s["name"]
    for tree in d["runesReforged"]:
        m["rune"][tree["icon"]] = tree["name"]
        for slot in tree["slots"]:
            for r in slot["runes"]:
                m["rune"][r["icon"]] = r["name"]
    return m


def maps(v=None):
    v = v or get(f"{DD}/api/versions.json")[0]
    path = os.path.join(CACHE, f"{v}.json")
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        pass
    res = {"en": english(v)}
    for lang, loc in LOCALES.items():
        res[lang] = translated(v, loc)
    os.makedirs(CACHE, exist_ok=True)
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(path + ".tmp", path)
    # keep this version and the one before it
    old = sorted((x for x in os.listdir(CACHE) if x.endswith(".json") and x != f"{v}.json"),
                 key=lambda x: os.path.getmtime(os.path.join(CACHE, x)))
    for x in old[:-1]:
        try:
            os.remove(os.path.join(CACHE, x))
        except OSError:
            pass
    return res


# the stats' spelling -> Riot's, where they differ
ITEM_ALIASES = {"lorddominiksregard": "lorddominiksregards", "sorcerersboots": "sorcerersshoes"}


def item_keys(name):
    """The names to look an item up by: as it is, without a patch range, without an enchantment (ddragon.ts too)."""
    base = re.sub(r"\s*\([^)]*\)\s*$", "", name or "")
    keys = [norm(name), norm(base), norm(re.sub(r"\s+-\s+.*$", "", base))]
    return keys + [ITEM_ALIASES[k] for k in keys if k in ITEM_ALIASES]


def legacy_versions(versions):
    """Old game versions to look a removed item up in, newest first: each season's last patch, then every fourth
    patch of each season (about 120; an item missing from all of them is a typo in the stats, so the search ends,
    and once they are all in the cache a build downloads nothing)."""
    by_season = defaultdict(list)
    for v in versions[1:]:
        if re.match(r"^\d+\.\d+\.\d+$", v):
            by_season[v.split(".")[0]].append(v)  # Riot lists them newest first
    seasons = sorted(by_season, key=int, reverse=True)
    return [by_season[s][0] for s in seasons] + [v for s in seasons for v in by_season[s][4::4]]


LEGACY = os.path.join(CACHE, "legacy_items.json")
LEGACY_FETCHES = 60  # old patches downloaded at most per build (each about 200 KB; kept for good)


def legacy_items(names, current, versions):
    """Item name (normalized) -> "<version>/<item id>" for the items of the stats that the current patch lacks (or
    has under another spelling: the app doesn't know the aliases)."""
    out, need = {}, {}
    for n in set(names):
        keys = item_keys(n)
        if any(k in current for k in keys[:3]):
            continue  # the app finds it in the current patch
        alias = next((k for k in keys[3:] if k in current), None)
        if alias:
            out[norm(n)] = f"{versions[0]}/{current[alias]}"
        else:
            need[n] = keys
    try:
        with open(LEGACY, encoding="utf-8") as f:
            cache = json.load(f)
    except (OSError, ValueError):
        cache = {}
    fetched = 0
    for v in legacy_versions(versions):
        if not need:
            break
        if v not in cache:
            if fetched >= LEGACY_FETCHES:
                break
            try:
                data = get(f"{DD}/cdn/{v}/data/en_US/item.json")["data"]
            except Exception:  # noqa: BLE001 - a patch without lists: the next one
                continue
            m = {}
            for iid, it in data.items():
                k = norm(it.get("name"))
                if k and (k not in m or int(iid) < int(m[k])):
                    m[k] = iid
            cache[v] = m
            fetched += 1
        m = cache[v]
        for n, ks in list(need.items()):
            hit = next((m[k] for k in ks if k in m), None)
            if hit:
                out[norm(n)] = f"{v}/{hit}"
                del need[n]
    if fetched:
        os.makedirs(CACHE, exist_ok=True)
        with open(LEGACY + ".tmp", "w", encoding="utf-8") as f:
            json.dump(cache, f, separators=(",", ":"))
        os.replace(LEGACY + ".tmp", LEGACY)
    return out


def write(out, item_names=()):
    """Writes dd.json and dd/<language>.json through hub.py's writer; returns how many languages it wrote.
    item_names: every item of the stats, for the removed items' pictures (dd.json "itemOld")."""
    versions = get(f"{DD}/api/versions.json")
    res = maps(versions[0])
    en = dict(res["en"])
    if item_names:
        try:
            en["itemOld"] = legacy_items(item_names, en["item"], versions)
        except Exception as e:  # noqa: BLE001 - the current pictures still go out
            print(f"hub: old item pictures skipped: {e}")
    out.json("dd.json", en)
    for lang in LOCALES:
        out.json(f"dd/{lang}.json", res[lang])
    return len(LOCALES)


if __name__ == "__main__":
    import zlib
    r = maps()
    for k, x in r.items():
        s = json.dumps(x, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        print(k, x["v"], len(s), "bytes,", len(zlib.compress(s, 9)), "deflated")
