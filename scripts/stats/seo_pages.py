"""Search-engine summaries for the Worlds, MSI and First Stand pages (riftwise.gg/stats/worlds, /stats/worlds/2025,
/stats/worlds/all...): hub/seo/pages/<section>[.<year>|.all].json = {title, desc, html, ld}.

The app draws those pages in the browser; crawlers that don't run scripts (and link previews) get only what the page
service puts in the HTML. These summaries give them what an encyclopedia page has: who won, the final, dates and
host, the standings with prize money, stats leaders, the most picked and banned champions and a link to every
series; and for every year together, every winner. The page service (server/pages) adds them with their schema.org
SportsEvent data. Reads the hub files this build just wrote; any problem leaves the files out (the pages still work).

    python seo_pages.py <stats>/<version>/hub      (hub.py calls write() at the end of a build)
"""
import functools
import html
import json
import os
import re
import sys

from hub import pretty

SECTIONS = {
    "worlds": ("world-championship", "League of Legends World Championship", "Worlds"),
    "msi": ("mid-season-invitational", "Mid-Season Invitational", "MSI"),
    "first-stand": ("first-stand", "First Stand", "First Stand"),
}
SITE = "https://riftwise.gg/"
# hosts the source data leaves out
HOSTS = {"worlds-2022": "United States", "worlds-2024": "Europe", "msi-2019": "Taiwan and Vietnam"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
e = html.escape


def day(d):
    """2025-11-09 -> Nov 9, 2025"""
    try:
        y, m, dd = d[:10].split("-")
        return f"{MONTHS[int(m) - 1]} {int(dd)}, {y}"
    except (ValueError, IndexError, AttributeError):
        return d or ""


def link(path, text):
    return f'<a href="/{e(path)}">{e(text)}</a>'


def load(hub, rel):
    try:
        with open(os.path.join(hub, rel), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


@functools.lru_cache(maxsize=None)
def champ_slugs(hub):
    """Champion name -> its page's slug ("Kai'Sa" -> "kaisa"), from search/champs.json: [name, slug, picks], where
    the slug is left out when it is pretty(name)."""
    return {r[0]: r[1] or pretty(r[0]) for r in load(hub, "search/champs.json") or []}


def stages_of(hub, ev):
    """An event's stages with their series: its own, or its children's (Play-In, Main Event)."""
    out = []
    for c in ev.get("children") or []:
        ce = load(hub, f"event/{c['u']}.json")
        if ce:
            out += [(ce.get("n", ""), st) for st in ce.get("stages") or []]
    if not out:
        out = [("", st) for st in ev.get("stages") or []]
    return out


def final_of(stages):
    """The final: the last decided series of a stage called Final(s) / Grand Final."""
    for _, st in reversed(stages):
        if re.fullmatch(r"(grand )?finals?", (st.get("name") or "").strip(), re.I):
            done = [s for s in st.get("series") or [] if s.get("w") in (1, 2)]
            if done:
                return done[-1]
    return None


def year_page(hub, sec, ev):
    full, short = SECTIONS[sec][1], SECTIONS[sec][2]
    year = ev.get("year") or (ev.get("start") or "")[:4]
    stages = stages_of(hub, ev)
    res = ev.get("results") or []
    winner = next((r for r in res if r.get("p") == "1"), None)
    runner = next((r for r in res if r.get("p") == "2"), None)
    fin = final_of(stages)
    teams_n = len(ev.get("teams") or []) or len(res)
    games = ev.get("games") or 0
    where = ev.get("country") or HOSTS.get(ev.get("u"), "")
    dates = f"{day(ev.get('start'))} to {day(ev.get('end'))}" if ev.get("start") else ""
    name = f"{short} {year}"
    if winner and fin:
        a, b = fin.get("a"), fin.get("b")
        sw, sl = (fin.get("sa"), fin.get("sb")) if fin.get("w") == 1 else (fin.get("sb"), fin.get("sa"))
        loser = b if fin.get("w") == 1 else a
        lead = f"{winner['t']} won {name}, beating {loser} {sw}–{sl} in the final."
    elif winner:
        lead = f"{winner['t']} won {name}" + (f", ahead of {runner['t']}." if runner else ".")
    else:
        lead = f"{name} is under way."
    facts = ", ".join(x for x in [f"{teams_n} teams" if teams_n else "", f"{games} games" if games else "", dates, where] if x)
    title = f"{name}: results, winner and stats – {full} | RiftWise"
    desc = f"{lead} {facts}. Standings, every series, stats leaders and champion picks." if facts else f"{lead} Standings, every series and stats."

    h = [f"<h2>{e(full)} {e(year)}</h2>", f"<p>{e(lead)} {e(facts)}.</p>" if facts else f"<p>{e(lead)}</p>",
         f"<p>{link('tournament/' + ev['u'], 'Bracket, standings and every series of ' + name)}</p>"]
    if fin:
        h.append("<h3>Final</h3>")
        score = f"{fin.get('a')} {fin.get('sa')}–{fin.get('sb')} {fin.get('b')}"
        h.append(f"<p>{link('match/' + fin['g'], score) if fin.get('g') else e(score)}</p>")
    if res:
        # an event still under way (no winner yet) has standings so far, not final ones
        h.append(f"<h3>{'Final standings' if winner else 'Standings so far'}</h3><table><tr><th>Place</th><th>Team</th><th>Prize</th></tr>")
        for r in res[:16]:
            team = link("team/" + r["u"], r["t"]) if r.get("u") else e(r.get("t") or "")
            prize = f"${r['usd']:,}" if isinstance(r.get("usd"), int) and r["usd"] else ""
            h.append(f"<tr><td>{e(str(r.get('p') or ''))}</td><td>{team}</td><td>{e(prize)}</td></tr>")
        h.append("</table>")
    led = ev.get("leaders") or {}
    rows = []
    for key, label in (("kills", "kills per game"), ("kda", "KDA")):
        for x in (led.get(key) or [])[:3]:
            who = link("player/" + x["u"], x["n"]) if x.get("u") else e(x.get("n") or "")
            rows.append(f"<li>{who} ({e(x.get('t') or '')}): {e(str(x.get('v')))} {e(label)}, {e(str(x.get('g')))} games</li>")
    if rows:
        h.append("<h3>Stats leaders</h3><ul>" + "".join(rows) + "</ul>")
    champs = ev.get("champs") or []
    if champs:
        picked = sorted(champs, key=lambda c: -(c.get("p") or 0))[:5]
        banned = sorted(champs, key=lambda c: -(c.get("b") or 0))[:5]
        slugs = champ_slugs(hub)

        def champ(c):
            # the champion page's own address; a name without one stays plain text rather than a dead link
            return link("champion/" + slugs[c["c"]], c["c"]) if c["c"] in slugs else e(c["c"])
        h.append("<h3>Champions</h3><p>Most picked: " + ", ".join(
            f"{champ(c)} ({c.get('p')}, {c.get('w')} wins)" for c in picked)
            + ". Most banned: " + ", ".join(f"{e(c['c'])} ({c.get('b')})" for c in banned) + ".</p>")
    series_rows = []
    for stage_event, st in stages:
        items = [s for s in st.get("series") or [] if s.get("g") and s.get("a") and s.get("b")]
        if not items:
            continue
        label = " ".join(x for x in [stage_event.replace(ev.get("n", ""), "").strip(), st.get("name") or ""] if x)
        def line(s):
            return f"{s['a']} {s.get('sa') if s.get('sa') is not None else ''}–{s.get('sb') if s.get('sb') is not None else ''} {s['b']}"
        lis = "".join(f"<li>{link('match/' + s['g'], line(s))}</li>" for s in items)
        series_rows.append(f"<h4>{e(label)}</h4><ul>{lis}</ul>")
    if series_rows:
        h.append("<h3>Every series</h3>" + "".join(series_rows))
    competitors = [{"@type": "SportsTeam", "name": r["t"], **({"url": SITE + "team/" + r["u"]} if r.get("u") else {})} for r in res[:32] if r.get("t")]
    ld = {
        "@context": "https://schema.org", "@type": "SportsEvent", "name": f"{full} {year}", "alternateName": name,
        "sport": "League of Legends esports", "description": desc, "url": f"{SITE}stats/{sec}/{year}",
        **({"startDate": ev["start"]} if ev.get("start") else {}), **({"endDate": ev["end"]} if ev.get("end") else {}),
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "eventStatus": "https://schema.org/EventScheduled",
        **({"location": {"@type": "Place", "name": where, "address": {"@type": "PostalAddress", "addressCountry": where}}} if where else {}),
        "organizer": {"@type": "Organization", "name": "Riot Games", "url": "https://www.riotgames.com/"},
        **({"competitor": competitors} if competitors else {}),
    }
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Pro Stats", "item": SITE + "stats"},
        {"@type": "ListItem", "position": 2, "name": short, "item": f"{SITE}stats/{sec}"},
        {"@type": "ListItem", "position": 3, "name": year, "item": f"{SITE}stats/{sec}/{year}"},
    ]}
    return {"title": title, "desc": desc, "html": "".join(h), "ld": [ld, crumbs]}, (year, winner, runner, fin, where, ev)


def all_page(sec, rows, titles):
    full, short = SECTIONS[sec][1], SECTIONS[sec][2]
    done = [r for r in rows if r[1]]
    first, last = (rows[-1][0], rows[0][0]) if rows else ("", "")
    top = titles[0] if titles else None
    latest = done[0] if done else None
    desc = (f"Every {short} champion from {first} to {last}"
            + (f": {latest[1]['t']} won {latest[0]}" if latest else "")
            + (f", and {top['t']} has the most titles ({top['n']})" if top else "")
            + ". Finals, runners-up, hosts and the all-time stats.")
    h = [f"<h2>Every {e(full)} winner</h2><table><tr><th>Year</th><th>Winner</th><th>Final</th><th>Runner-up</th><th>Host</th></tr>"]
    for year, winner, runner, fin, where, ev in rows:
        w = link("team/" + winner["u"], winner["t"]) if winner and winner.get("u") else e(winner["t"]) if winner else "–"
        ru = e(runner["t"]) if runner else ""
        score = ""
        if fin:
            sw, sl = (fin.get("sa"), fin.get("sb")) if fin.get("w") == 1 else (fin.get("sb"), fin.get("sa"))
            score = link("match/" + fin["g"], f"{sw}–{sl}") if fin.get("g") else f"{sw}–{sl}"
        h.append(f"<tr><td>{link(f'stats/{sec}/{year}', year)}</td><td>{w}</td><td>{score}</td><td>{ru}</td><td>{e(where)}</td></tr>")
    h.append("</table>")
    if titles:
        h.append("<h3>Most titles</h3><ol>" + "".join(
            f"<li>{link('team/' + t['u'], t['t']) if t.get('u') else e(t['t'])}: {t['n']}</li>" for t in titles[:10]) + "</ol>")
    items = [{"@type": "ListItem", "position": i + 1, "item": {
        "@type": "SportsEvent", "name": f"{full} {year}", "url": f"{SITE}stats/{sec}/{year}",
        **({"startDate": ev["start"]} if ev.get("start") else {}),
        **({"location": {"@type": "Place", "name": where}} if where else {})}} for i, (year, _, _, _, where, ev) in enumerate(rows)]
    ld = {"@context": "https://schema.org", "@type": "ItemList", "name": f"Every {full}", "itemListElement": items}
    return {"title": f"{short} winners: every {full} since {first} | RiftWise", "desc": desc, "html": "".join(h), "ld": [ld]}


def write(hub):
    """Writes hub/seo/pages/*.json; returns how many pages it wrote."""
    out = os.path.join(hub, "seo", "pages")
    os.makedirs(out, exist_ok=True)
    n = 0

    def put(name, obj):
        nonlocal n
        with open(os.path.join(out, name + ".json"), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        n += 1

    for sec, (lu, _, _) in SECTIONS.items():
        lg = load(hub, f"league/{lu}.json")
        if not lg:
            continue
        evs = sorted((x for x in lg.get("events") or [] if not x.get("q") and not x.get("p")),
                     key=lambda x: (x.get("y") or "", x.get("st") or ""), reverse=True)
        rows = []
        for x in evs:
            ev = load(hub, f"event/{x['u']}.json")
            if not ev:
                continue
            page, row = year_page(hub, sec, ev)
            if not rows:
                put(sec, page)  # the newest year is the plain address
            put(f"{sec}.{row[0]}", page)
            rows.append(row)
        if rows:
            put(f"{sec}.all", all_page(sec, rows, lg.get("titles") or []))
    return n


if __name__ == "__main__":
    print(write(sys.argv[1]), "pages written")
