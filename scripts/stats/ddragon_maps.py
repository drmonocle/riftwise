"""Riot's Data Dragon lists, boiled down for the app: hub/dd.json and hub/dd/<language>.json in each stats build.

The stats name champions, items, spells and runes in English ("Kai'Sa", "Rabadon's Deathcap", "Flash"); the app turns
those names into Data Dragon picture addresses, and in another language shows Riot's translated names. It used to read
Riot's full lists for that: about 150 KB on a phone (four files), and as much again in another language, before the
first champion picture could show. These files hold only the lookups the app uses (about 9 KB, and 7 KB per language,
once compressed), worked out the same way as src/hub/ddragon.ts and src/champions.ts did. The app falls back to
Riot's lists when they're missing.

Downloads are kept per game version in <script folder>/ddragon_cache/<version>.json, so a build only downloads when
Riot ships a patch. A failure just leaves the files out of that build (hub.py goes on without them).
"""
import concurrent.futures
import json
import os
import re
import urllib.request

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


def maps():
    v = get(f"{DD}/api/versions.json")[0]
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


def write(out):
    """Writes dd.json and dd/<language>.json through hub.py's writer; returns how many languages it wrote."""
    res = maps()
    out.json("dd.json", res["en"])
    for lang in LOCALES:
        out.json(f"dd/{lang}.json", res[lang])
    return len(LOCALES)


if __name__ == "__main__":
    import zlib
    r = maps()
    for k, x in r.items():
        s = json.dumps(x, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        print(k, x["v"], len(s), "bytes,", len(zlib.compress(s, 9)), "deflated")
