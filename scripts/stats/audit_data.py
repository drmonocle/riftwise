"""Data audit for a finished stats build: impossible numbers, sums that don't add up, links to pages that don't exist,
and known results (Worlds, MSI and First Stand winners). Read-only.

  python audit_data.py <stats folder>            (the folder with latest.json; audits the version it names)
  python audit_data.py <stats folder> --json out.json

Exit code 1 when a check that should never fail did (the build should not ship then).
"""
import datetime
import glob
import json
import os
import sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

# Known champions of the big international events (title page and event results must agree)
WORLDS = {"2011": "Fnatic", "2012": "Taipei Assassins", "2013": "SK Telecom T1", "2014": "Samsung White",
          "2015": "SK Telecom T1", "2016": "SK Telecom T1", "2017": "Samsung Galaxy", "2018": "Invictus Gaming",
          "2019": "FunPlus Phoenix", "2020": "DAMWON Gaming", "2021": "EDward Gaming", "2022": "DRX", "2023": "T1",
          "2024": "T1", "2025": "T1"}
MSI = {"2015": "EDward Gaming", "2016": "SK Telecom T1", "2017": "SK Telecom T1", "2018": "Royal Never Give Up",
       "2019": "G2 Esports", "2021": "Royal Never Give Up", "2022": "Royal Never Give Up", "2023": "JD Gaming",
       "2024": "Gen.G", "2025": "Gen.G"}
# a team's name changes over time: any of these counts as the same winner
SAME = {"SK Telecom T1": {"SK Telecom T1", "SKT T1", "T1"}, "T1": {"T1", "SK Telecom T1"}, "DAMWON Gaming": {"DAMWON Gaming", "DWG KIA", "Dplus KIA", "Dplus Kia"},
        "DRX": {"DRX", "KIWOOM DRX", "Kiwoom DRX"}, "Gen.G": {"Gen.G", "Gen.G Esports"}, "Samsung Galaxy": {"Samsung Galaxy", "Gen.G"},
        "Samsung White": {"Samsung White"}, "EDward Gaming": {"EDward Gaming"}}

findings = defaultdict(list)   # check -> examples
counts = Counter()             # check -> how many
checked = Counter()            # what was looked at


def bad(check, example, limit=12):
    counts[check] += 1
    if len(findings[check]) < limit:
        findings[check].append(example)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    root = sys.argv[1]
    latest = load(os.path.join(root, "latest.json"))
    vdir = os.path.join(root, latest["version"])
    hub = os.path.join(vdir, "hub")
    print("auditing", vdir, flush=True)

    def slugs(kind):
        return {os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(hub, kind, "*.json"))}

    teams, players, events, games, champs = slugs("team"), slugs("player"), slugs("event"), slugs("game"), slugs("champ")
    leagues = slugs("league")
    checked.update({"teams": len(teams), "players": len(players), "events": len(events), "series": len(games), "champions": len(champs)})

    def link(kind, slug, where):
        if not slug:
            return
        pool = {"team": teams, "player": players, "event": events, "game": games, "champ": champs, "league": leagues}[kind]
        if slug not in pool:
            bad(f"broken link to a {kind} page", f"{where} -> {slug}")

    # -- series pages ---------------------------------------------------------------------------
    # ~100k small files: read them on 16 threads (the disk, not Python, is the slow part), checked in order
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    order = sorted(games)
    pool = ThreadPoolExecutor(16)
    for slug, s in zip(order, pool.map(lambda x: load(os.path.join(hub, "game", x + ".json")), order)):
        where = f"game/{slug}"
        link("event", s.get("e"), where)
        link("team", s["a"].get("u"), where)
        link("team", s["b"].get("u"), where)
        gl = s.get("games") or []
        played = [g for g in gl if g.get("w") in (1, 2)]
        wa, wb = sum(1 for g in played if g["w"] == 1), sum(1 for g in played if g["w"] == 2)
        sa, sb = s.get("sa"), s.get("sb")
        if s["a"].get("n") and s["a"].get("n") == s["b"].get("n"):
            bad("series against itself", where)
        if not (s.get("date") or "")[:10]:
            bad("series without a date", where)
        elif played and s["date"][:10] > tomorrow:
            bad("result dated in the future", f"{where}: {s['date'][:10]}")
        if sa is not None and sb is not None:
            checked["series with a score"] += 1
            bo = s.get("bo") or 0
            if bo and max(sa, sb) > (bo // 2 + 1):
                bad("series score above what the best-of allows", f"{where}: {sa}-{sb} Bo{bo}")
            if s.get("ff"):
                checked["series awarded by forfeit"] += 1
            elif played and len(played) == sa + sb and (wa, wb) != (sa, sb):
                bad("series score doesn't match its games", f"{where}: score {sa}-{sb}, games {wa}-{wb}")
            if s.get("w") in (1, 2) and sa != sb and ((sa > sb) != (s["w"] == 1)):
                bad("series winner doesn't match its score", f"{where}: {sa}-{sb} w={s['w']}")
        ns = [g.get("n") for g in gl]
        if len(ns) != len(set(ns)):
            bad("a game number twice in one series", f"{where}: {ns}")
        for g in gl:
            gw = f"{where} G{g.get('n')}"
            m = g.get("min")
            if m is not None and not (7 <= m <= 95):
                bad("game length out of range (7-95 min)", f"{gw}: {m}")
            ps = g.get("p") or []
            if ps:
                checked["games with a scoreboard"] += 1
                if len(ps) != 10:
                    bad("scoreboard without 10 players", f"{gw}: {len(ps)}")
                sides = Counter(p.get("s") for p in ps)
                if ps and len(ps) == 10 and (sides[1] != 5 or sides[2] != 5):
                    bad("scoreboard sides not 5 and 5", f"{gw}: {dict(sides)}")
                for side in (1, 2):
                    cs_ = [p.get("c") for p in ps if p.get("s") == side and p.get("c")]
                    if len(cs_) != len(set(cs_)):
                        bad("same champion twice on one team", f"{gw} side {side}: {[c for c, n in Counter(cs_).items() if n > 1]}")
                    roles = [p.get("r") for p in ps if p.get("s") == side and p.get("r")]
                    if len(roles) == 5 and len(set(roles)) != 5:
                        bad("a role twice on one team", f"{gw} side {side}: {roles}")
                for p in ps:
                    link("player", p.get("u"), gw)
                    k, d, a = p.get("k", 0), p.get("d", 0), p.get("a", 0)
                    if k < 0 or d < 0 or a < 0 or k > 35 or d > 30 or a > 55:
                        bad("player K/D/A out of range", f"{gw} {p.get('n')}: {k}/{d}/{a}")
                    cs = p.get("cs")
                    if cs is not None and m and cs / m > 16:
                        bad("CS per minute above 16", f"{gw} {p.get('n')}: {cs} in {m}")
                t = g.get("t") or {}
                kb, kr = (t.get("blue") or {}).get("k"), (t.get("red") or {}).get("k")
                if kb is not None and kr is not None and len(ps) == 10:
                    blue_side = 1 if g.get("blue", 1) == 1 else 2
                    pk = Counter()
                    for p in ps:
                        pk[p.get("s")] += p.get("k", 0)
                    # the team table and the ten players should agree on kills (Leaguepedia sometimes differs by one)
                    if abs(pk[1] + pk[2] - (kb + kr)) > 2:
                        bad("team kills don't match the players' kills", f"{gw}: teams {kb}+{kr}, players {pk[1]}+{pk[2]}")
            r = g.get("r")
            if r is not None and not (0 <= r <= 100):
                bad("game rating outside 0-100", f"{gw}: {r}")

    # -- players ----------------------------------------------------------------------------------
    order = sorted(players)

    def player_and_log(x):
        try:
            log = load(os.path.join(hub, "playergames", x + ".json"))
        except FileNotFoundError:
            log = None
        try:
            it_log = load(os.path.join(hub, "playeritems", x + ".json"))
        except FileNotFoundError:
            it_log = None
        return load(os.path.join(hub, "player", x + ".json")), log, it_log

    for slug, (p, log, it_log) in zip(order, pool.map(player_and_log, order)):
        where = f"player/{slug}"
        g, w, k, d, a = p.get("g", 0), p.get("w", 0), p.get("k", 0), p.get("d", 0), p.get("a", 0)
        # the career line and the game log are built separately: they must agree
        # (row: date, series, champion, kills, deaths, assists, win 1/0, ...)
        if log is not None:
            checked["player game logs"] += 1
            lg, lw = len(log), sum(1 for r in log if r[6] == 1)
            lk, ld, la = (sum((r[i] or 0) for r in log) for i in (3, 4, 5))
            if (lg, lw) != (g, w):
                bad("player's game log doesn't match their games and wins", f"{where}: log {lg} games {lw} wins, page {g}/{w}")
            elif (lk, ld, la) != (k, d, a):
                bad("player's game log doesn't match their K/D/A", f"{where}: log {lk}/{ld}/{la}, page {k}/{d}/{a}")
            if it_log is not None:
                checked["player item logs"] += 1
                for it_name, q_list in it_log:
                    if any(q < 0 or q >= lg for q in q_list):
                        bad("player's item log points outside their game log", f"{where} ({it_name})")
                        break
        if w > g:
            bad("player with more wins than games", f"{where}: {w}/{g}")
        if g and p.get("kda") is not None:
            want = round((k + a) / max(d, 1), 2)
            if abs(want - p["kda"]) > 0.02:
                bad("player KDA doesn't match their kills, deaths and assists", f"{where}: {p['kda']} vs {want}")
        for key, lo, hi in (("csm", 0, 13), ("gpm", 150, 700), ("dpm", 0, 1500)):
            v = p.get(key)
            if v is not None and g >= 20 and not (lo <= v <= hi):
                bad(f"player {key} out of range ({lo}-{hi})", f"{where}: {v}")
        yg = sum(y.get("g", 0) for y in p.get("years") or [])
        yw = sum(y.get("w", 0) for y in p.get("years") or [])
        if p.get("years") and (yg, yw) != (g, w):
            bad("player's years don't add up to their games", f"{where}: years {yg}/{yw} vs {g}/{w}")
        tg = sum(t.get("g", 0) for t in p.get("teams") or [])
        tw = sum(t.get("w", 0) for t in p.get("teams") or [])
        if p.get("teams") and (tg, tw) != (g, w):
            bad("player's teams don't add up to their games", f"{where}: teams {tg}/{tw} vs {g}/{w}")
        eg = sum(e.get("g", 0) for e in p.get("events") or [])
        ew = sum(e.get("w", 0) for e in p.get("events") or [])
        if p.get("events") and (eg, ew) != (g, w):
            bad("player's events don't add up to their games", f"{where}: events {eg}/{ew} vs {g}/{w}")
        for t in p.get("teams") or []:
            link("team", t.get("u"), where)
        for r in p.get("recent") or []:
            link("game", r.get("g"), where)
        for e in p.get("events") or []:
            link("event", e.get("e"), where)
    # -- teams -------------------------------------------------------------------------------------
    order = sorted(teams)

    def team_and_logs(x):
        try:
            tg = load(os.path.join(hub, "teamgames", x + ".json"))
        except FileNotFoundError:
            tg = None
        try:
            ts = load(os.path.join(hub, "teamseries", x + ".json"))
        except FileNotFoundError:
            ts = None
        return load(os.path.join(hub, "team", x + ".json")), tg, ts

    for slug, (t, tg_log, ts_log) in zip(order, pool.map(team_and_logs, order)):
        where = f"team/{slug}"
        g, w, sg, sw = t.get("g", 0), t.get("w", 0), t.get("sg", 0), t.get("sw", 0)
        if w > g:
            bad("team with more wins than games", where)
        if sw > sg:
            bad("team with more series wins than series", where)
        if tg_log is not None:
            checked["team game logs"] += 1
            lg, lw = len(tg_log), sum(1 for r in tg_log if r[7] == 1)
            if (lg, lw) != (g, w):
                bad("team's game log doesn't match their games and wins", f"{where}: log {lg}/{lw} vs page {g}/{w}")
        else:
            bad("team's game log missing", where)
        if ts_log is not None:
            checked["team series logs"] += 1
            lsg, lsw = len(ts_log), sum(1 for r in ts_log if (r[3] or 0) > (r[4] or 0))
            if (lsg, lsw) != (sg, sw):
                bad("team's series log doesn't match their series and wins", f"{where}: log {lsg}/{lsw} vs page {sg}/{sw}")
        sd = t.get("sides")
        if not sd or len(sd) != 4 or (sd[0] + sd[2], sd[1] + sd[3]) != (g, w):
            bad("team's blue/red sides don't add up to their games", f"{where}: sides {sd} vs {g}/{w}")
        yg = sum(y.get("g", 0) for y in t.get("years") or [])
        yw = sum(y.get("w", 0) for y in t.get("years") or [])
        if t.get("years") and (yg, yw) != (g, w):
            bad("team's years don't add up to their games", f"{where}: years {yg}/{yw} vs {g}/{w}")
        ng = sum(n.get("g", 0) for n in t.get("names") or [])
        if t.get("names") and ng != g:
            bad("team's names don't add up to their games", f"{where}: names {ng} vs {g}")
        ev_list = t.get("events") or []
        eg = sum(e.get("g", 0) for e in ev_list)
        ew = sum(e.get("w", 0) for e in ev_list)
        esg = sum(e.get("sg", 0) for e in ev_list)
        esw = sum(e.get("sw", 0) for e in ev_list)
        if (eg, ew) != (g, w):
            bad("team's events don't add up to their games", f"{where}: events {eg}/{ew} vs {g}/{w}")
        if (esg, esw) != (sg, sw):
            bad("team's events don't add up to their series", f"{where}: events {esg}/{esw} vs {sg}/{sw}")
        ev_slugs = [e.get("e") for e in ev_list if e.get("e")]
        if len(ev_slugs) != len(set(ev_slugs)):
            bad("team's events list a tournament twice", f"{where}: {[k for k, v in Counter(ev_slugs).items() if v > 1]}")
        for r in t.get("recent") or []:
            link("game", r.get("g"), where)
        for e in ev_list:
            link("event", e.get("e") or e.get("u"), where)
        for ro in t.get("roster") or []:
            for pl in ro.get("p") or []:
                link("player", pl.get("u"), where)
    # -- champions ---------------------------------------------------------------------------------
    order = sorted(champs)
    for slug, c in zip(order, pool.map(lambda x: load(os.path.join(hub, "champ", x + ".json")), order)):
        where = f"champ/{slug}"
        cp, cw, cb = c.get("p", 0), c.get("w", 0), c.get("b", 0)
        csd = c.get("side") or [0, 0, 0, 0]
        if (csd[0] + csd[2], csd[1] + csd[3]) != (cp, cw):
            bad("champion's blue/red sides don't add up to their picks and wins", f"{where}: {csd} vs {cp}/{cw}")
        cys = c.get("years") or []
        if (sum(y.get("p", 0) for y in cys), sum(y.get("w", 0) for y in cys), sum(y.get("b", 0) for y in cys)) != (cp, cw, cb):
            bad("champion's years don't add up to their picks, wins and bans", where)
    # -- events ------------------------------------------------------------------------------------
    order = sorted(events)
    for slug, e in zip(order, pool.map(lambda x: load(os.path.join(hub, "event", x + ".json")), order)):
        where = f"event/{slug}"
        o = e.get("overview") or {}
        if o and o.get("g") is not None and o.get("blue") is not None and o["g"] != o["blue"] + o.get("red", 0):
            bad("event's games don't match blue + red wins", f"{where}: {o['g']} vs {o['blue']}+{o.get('red')}")
        empty_bracket = []
        sb_series = []
        for st in e.get("stages") or []:
            for r in st.get("series") or []:
                link("game", r.get("g"), where)
                link("team", r.get("au"), where)
                link("team", r.get("bu"), where)
                gslug_r = r.get("g") or ""
                if "-scoreboards-" in gslug_r and r.get("au") and r.get("bu"):
                    sb_series.append((gslug_r, {r["au"], r["bu"]}, (r.get("date") or "")[:10]))
                elif not gslug_r and r.get("au") and r.get("bu"):
                    empty_bracket.append(({r["au"], r["bu"]}, (r.get("date") or "")[:10]))
        if empty_bracket and sb_series:
            for gslug_r, pair_sb, d_sb in sb_series:
                for pair_eb, d_eb in empty_bracket:
                    if pair_sb == pair_eb:
                        try:
                            dd = abs((datetime.date.fromisoformat(d_sb) - datetime.date.fromisoformat(d_eb)).days) if d_sb and d_eb else 0
                        except ValueError:
                            dd = 0
                        if dd <= 3:
                            bad("event's Scoreboards series not linked to its bracket series", f"{where}: {gslug_r}")
                            break
        for t in e.get("teams") or []:
            link("team", t.get("u"), where)
            if t.get("w", 0) > t.get("g", 0) or t.get("sw", 0) > t.get("sg", 0):
                bad("event's team has more wins than games or series", f"{where}: {t.get('t')}")
        for pl in e.get("players") or []:
            link("player", pl.get("u"), where)
            if pl.get("w", 0) > pl.get("g", 0):
                bad("event's player has more wins than games", f"{where}: {pl.get('n')}")
        if e.get("ln"):
            lp_path = os.path.join(hub, "lines", slug + ".json")
            if not os.path.exists(lp_path):
                bad("event's lines file missing", where)
            else:
                checked["event line files"] += 1
                ln = load(lp_path)
                lg_cnt = len(ln.get("g") or [])
                if lg_cnt != e.get("statsGames", 0):
                    bad("event's lines game count doesn't match statsGames", f"{where}: {lg_cnt} vs {e.get('statsGames')}")
                for pr in ln.get("p") or []:
                    if pr[0] < 0 or pr[0] >= lg_cnt:
                        bad("event's lines player row points outside games", where)
                        break
        for r in e.get("results") or []:
            link("team", r.get("u"), where)
        for tbl in e.get("standings") or []:
            pls = [x.get("pl") for x in tbl.get("rows") or [] if x.get("pl")]  # 0 = no place (withdrew, disqualified)
            if pls != sorted(pls):
                at = next(i for i in range(1, len(pls)) if pls[i] < pls[i - 1])
                bad("standings not in place order", f"{where} {tbl.get('name')}: ... {pls[max(0, at - 3):at + 3]}")
    # -- leagues and H2H ---------------------------------------------------------------------------
    leagues_index = load(os.path.join(hub, "leagues.json"))
    for lrow in leagues_index:
        lu = lrow.get("u")
        where = f"league/{lu}"
        link("league", lu, "leagues.json")
        if lu in leagues:
            checked["league pages"] += 1
            ld = load(os.path.join(hub, "league", lu + ".json"))
            ev_list_l = ld.get("events") or []
            ev_g_sum = sum(ev.get("g") or 0 for ev in ev_list_l)
            if ev_g_sum != lrow.get("g", 0):
                bad("league's events don't add up to its games", f"{where}: {ev_g_sum} vs {lrow.get('g')}")
            if len(ev_list_l) != lrow.get("n", 0):
                bad("league's event count doesn't match leagues.json", f"{where}: {len(ev_list_l)} vs {lrow.get('n')}")
            for ev in ev_list_l:
                link("event", ev.get("u"), where)
            for tr in ld.get("titles") or []:
                link("team", tr.get("u"), where)
    h2h_path = os.path.join(hub, "h2h", "base.json")
    if os.path.exists(h2h_path):
        h2h = load(h2h_path)
        for k_pair, v_pair in (h2h.get("pairs") or {}).items():
            checked["h2h pairs"] += 1
            parts_p = k_pair.split("__")
            if len(parts_p) != 2 or parts_p[0] >= parts_p[1]:
                bad("h2h pair not in canonical order or self-match", k_pair)
            if (v_pair[0] or 0) < 0 or (v_pair[1] or 0) < 0:
                bad("h2h pair has negative wins", f"{k_pair}: {v_pair}")
            sr_pair = (h2h.get("series") or {}).get(k_pair)
            if sr_pair:
                intl_p = sr_pair.get("intl") or [0, 0]
                if intl_p[0] > v_pair[0] or intl_p[1] > v_pair[1]:
                    bad("h2h international wins exceed total wins", f"{k_pair}: intl {intl_p} vs {v_pair}")
    # -- titles: the big international winners ------------------------------------------------------
    try:
        titles = load(os.path.join(hub, "titles.json"))
    except FileNotFoundError:
        titles = load(os.path.join(vdir, "titles.json"))
    got = defaultdict(set)
    for x in titles:
        kind = x.get("kind") or ""
        year = (x.get("date") or "")[:4]
        if kind in ("Worlds", "MSI"):
            # the team's name today (w) and the name it won under (as): either one may be the known name
            for team in (x.get("w"), x.get("as"), x.get("team"), x.get("n")):
                if team:
                    got[(kind, year)].add(team)
    for kind, table in (("Worlds", WORLDS), ("MSI", MSI)):
        for year, champ in table.items():
            names = SAME.get(champ, {champ})
            have = got.get((kind, year), set())
            checked["known champions"] += 1
            if not have:
                bad("known champion missing from titles", f"{kind} {year}: {champ}")
            elif not (have & names):
                bad("wrong champion in titles", f"{kind} {year}: have {sorted(have)}, expected {champ}")
    # -- records and best games ---------------------------------------------------------------------
    rec = load(os.path.join(hub, "records.json"))
    for group in ("game", "player"):
        for name, lst in (rec.get(group) or {}).items():
            vals = [x.get("v") for x in lst if x.get("v") is not None]
            desc = name not in ("fastest",)
            if vals and vals != sorted(vals, reverse=desc):
                bad("records list out of order", f"{group}.{name}")
            for x in lst:
                link("game", x.get("g"), f"records {group}.{name}")
    best = load(os.path.join(hub, "best", "all.json"))
    for r in best.get("g", []):
        link("game", r[1], "best/all games")
        if not (0 <= r[0] <= 100):
            bad("best game rating outside 0-100", r[:3])
    for r in best.get("s", []):
        link("game", r[1], "best/all series")
        if len(r) > 15 and r[15] is not None and isinstance(r[15], list) and len(r[15]) != r[13]:
            bad("best series: game ratings don't match games played", f"{r[1]}: {len(r[15])} vs {r[13]}")
    ratings = load(os.path.join(hub, "ratings.json"))
    names = Counter(t[0] for t in ratings.get("teams", []))
    for n, c in names.items():
        if c > 1:
            bad("power rankings list a team twice", n)
    for t in ratings.get("teams", []):
        link("team", t[0], "ratings")

    # -- report --------------------------------------------------------------------------------------
    print("\nchecked:", dict(checked))
    if not counts:
        print("no problems found")
    for check, n in counts.most_common():
        print(f"\n[{n}] {check}")
        for ex in findings[check]:
            print("    ", ex)
    if "--json" in sys.argv:
        with open(sys.argv[sys.argv.index("--json") + 1], "w", encoding="utf-8") as f:
            json.dump({"version": latest["version"], "checked": checked, "counts": counts, "examples": findings}, f, indent=1, ensure_ascii=False)
    hard = [c for c in counts if c.startswith(("broken link", "series score above", "series winner", "wrong champion",
                                               "player's", "team's", "champion's", "event's", "league's", "h2h "))]
    sys.exit(1 if hard else 0)


if __name__ == "__main__":
    main()
