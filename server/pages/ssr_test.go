package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func richTestSite(t *testing.T) *store {
	t.Helper()
	s := testSite(t)
	hub := filepath.Join(s.site, "stats", "20261015000000", "hub")
	for _, sub := range []string{"team", "player", "champ", "event", "league", "game"} {
		if err := os.MkdirAll(filepath.Join(hub, sub), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	write := func(rel, content string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(hub, rel), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	// Update SEO TSV entries with realistic team/player/champ/event/league/game rows + game counts
	write(filepath.Join("seo", "team.tsv"),
		"t1\tT1 – stats, roster and history | RiftWise\tT1 (SKT): 1,251-657 in 1,908 pro games (2013–2026); 20 titles. Roster by year, head-to-head records, tournaments and champion picks.\t1\tT1 summary.\n"+
			"optic-gaming\tOpTic Gaming – stats, roster and history | RiftWise\tOpTic Gaming (OPT): 31-46 in 77 pro games (2018–2019). Roster by year, head-to-head records, tournaments and champion picks.\t1\n"+
			"big-team\tBig – stats | RiftWise\tBig has played 1,860 pro games.\t1\tBig has played 1,860 <pro> games.\n"+
			"small-team\tSmall – stats | RiftWise\tSmall: 2-4 in 6 pro games.\t0\n")
	write(filepath.Join("seo", "player.tsv"),
		"faker\tFaker – pro stats, champions and career | RiftWise\tFaker (Lee Sang-hyeok), Mid for T1. 1,755 pro games, KDA 4.08.\t1\tFaker summary.\n"+
			"crown\tCrown – pro stats, champions and career | RiftWise\tCrown: 300 pro games.\t1\n")
	write(filepath.Join("seo", "champ.tsv"),
		"azir\tAzir in pro play | RiftWise\tAzir: 19,273 picks in pro LoL.\t1\n"+
			"orianna\tOrianna in pro play | RiftWise\tOrianna: 15,000 picks in pro LoL.\t1\n"+
			"nunu-and-willump\tNunu & Willump in pro play | RiftWise\tNunu & Willump: 400 picks.\t1\n"+
			"nunu-and-willump-f8991\tNunu &amp; Willump in pro play | RiftWise\tNunu dupe.\t0\n")
	write(filepath.Join("seo", "event.tsv"),
		"worlds-2025-main-event\tWorlds 2025 Main Event | RiftWise\tWorlds 2025 Main Event: 80 pro games.\t1\tWorlds 2025 Main Event summary.\n")
	write(filepath.Join("seo", "league.tsv"),
		"lol-champions-korea\tLoL Champions Korea – every season, champions and results | RiftWise\tLoL Champions Korea: every season since 2012.\t1\n")
	write(filepath.Join("seo", "game.tsv"),
		"worlds-2025-main-event-finals-1\tT1 vs KT Rolster – Worlds 2025 Main Event | RiftWise\tT1 3-2 KT Rolster.\t1\n")

	write("logos.json", `{"t1":"20261028"}`)
	write("photos.json", `{"faker":"20261105"}`)
	write("ratings.json", `{"asof":"2026-11-18","teams":[["t1","T1","T1","LoL Champions Korea","lol-champions-korea",1823,11,40,"2026-11-09",1],["optic-gaming","OpTic Gaming","OPT","LCS","league-of-legends-championship-series",1400,0,10,"2019-08-11",0]],"adjust":{"intl":1,"other":1,"series":{"3":1,"5":1}}}`)
	write("home.json", `{"year":"2026","latest":[{"n":"Worlds 2025 Main Event","u":"worlds-2025-main-event","l":"World Championship","st":"2025-10-15","en":"2025-11-09","g":80,"w":"T1","wu":"t1"}],"potm":[{"n":"Faker","u":"faker","t":"T1","tu":"t1","r":"Mid","g":13,"rt":7.19}],"moves":[{"d":"2026-10-16","n":"Crown","u":"crown","r":"Mid","to":{"n":"OpTic Gaming","u":"optic-gaming"}}]}`)
	write("titles.json", `[{"t":"Worlds 2025 Main Event","date":"2025-11-09","kind":"Worlds","w":"T1","l":"KT Rolster","score":"3-2","u":"t1","e":"worlds-2025-main-event"}]`)

	write(filepath.Join("team", "t1.json"), `{
		"name":"T1","u":"t1","region":"Korea","codes":["SKT","SKT K"],"disbanded":0,"g":1908,"w":1251,"sg":791,"sw":565,
		"from":"2013-04-06","to":"2026-11-09","avgMin":33.6,"kills":14.2,"deaths":11.2,"earnings":11094008,
		"rating":{"r":1823,"rank":3,"of":58,"league":"LoL Champions Korea","lrank":2},
		"obj":{"dragons":2.45,"barons":0.82,"towers":7.1,"heralds":0.65,"golddiff":4141.85},
		"names":[{"n":"T1","from":"2019-12-31","to":"2026-11-09","g":1084},{"n":"SK Telecom T1","from":"2013-04-06","to":"2019-12-30","g":824}],
		"starters":[["Faker","faker","Mid"],["Doran","doran","Top"]],
		"contracts":{"faker":"2029-11-19"},
		"roster":[{"y":"2026","p":[{"n":"Faker","u":"faker","g":168,"r":"Mid"}]}],
		"titles":[{"t":"Worlds 2025 Main Event","date":"2025-11-09","kind":"Worlds","as":"T1","l":"KT Rolster","score":"3-2","e":"worlds-2025-main-event"}],
		"events":[{"e":"worlds-2025-main-event","en":"Worlds 2025 Main Event","date":"2025-11-09","as":"T1","g":20,"w":14,"sg":8,"sw":6,"pl":"1","usd":1000000,"lu":"lol-champions-korea"}],
		"opps":[{"n":"OpTic Gaming","u":"optic-gaming","g":2,"w":2,"last":"2019-01-01"}],
		"champs":[{"c":"Azir","g":229,"w":160},{"c":"Nunu & Willump","g":4,"w":3}],
		"bans":[{"c":"Orianna","g":100}],
		"bansVs":[{"c":"Azir","g":321}],
		"sides":[944,652,964,599],
		"years":[{"y":"2025","g":187,"w":118,"as":"T1"}],
		"recent":[{"date":"2025-11-09","g":"worlds-2025-main-event-finals-1","opp":"KT Rolster","us":3,"them":2,"en":"Worlds 2025 Main Event","e":"worlds-2025-main-event"}]
	}`)

	write(filepath.Join("team", "optic-gaming.json"), `{
		"name":"OpTic Gaming","u":"optic-gaming","region":"North America","codes":["OPT"],"disbanded":1,"g":77,"w":31,"sg":75,"sw":31,
		"from":"2018-01-20","to":"2019-08-11","avgMin":37,"kills":9.0,"deaths":11.1,
		"names":[{"n":"OpTic Gaming","from":"2018-01-20","to":"2019-08-11","g":77}],
		"roster":[{"y":"2019","p":[{"n":"Crown","u":"crown","g":39,"r":"Mid"}]}],
		"titles":[],
		"events":[{"e":"worlds-2025-main-event","en":"LCS 2019 Summer","date":"2019-08-04","as":"OpTic Gaming","g":20,"w":10,"sg":20,"sw":10,"pl":"6","usd":0}],
		"opps":[{"n":"T1","u":"t1","g":2,"w":0,"last":"2019-01-01"}],
		"champs":[{"c":"Azir","g":10,"w":5}],
		"recent":[]
	}`)

	write(filepath.Join("player", "faker.json"), `{
		"name":"Faker","u":"faker","role":"Mid","club":"T1","clubU":"t1","mvp":117,"g":1755,"w":1163,"k":6074,"d":3933,"a":9982,"kda":4.08,"nChamps":90,
		"bio":{"real":"Lee Sang-hyeok","native":"이상혁","country":"South Korea","born":"1996-05-07","twitter":"faker","youtube":"https://www.youtube.com/channel/UCpJw2H9KKqwCCGQKRh1Bf2w","stream":"https://www.sooplive.co.kr/station/leesh2148","contract":"2029-11-19","soloq":["KR: Hide on bush#KR1"]},
		"teams":[{"n":"T1","u":"t1","g":1011,"w":658,"from":"2019-12-31","to":"2026-11-09"}],
		"years":[{"y":"2025","g":187,"w":118,"kda":4.22,"team":"T1"}],
		"champs":[{"c":"Azir","g":213,"w":151,"k":718,"d":472,"a":1114,"kda":3.88}],
		"events":[{"e":"worlds-2025-main-event","en":"Worlds 2025 Main Event","date":"2025-11-09","t":"T1","tu":"t1","g":20,"w":14,"kda":5.1,"c":["Azir"],"pl":"1"}],
		"titles":[{"t":"Worlds 2025 Main Event","date":"2025-11-09","kind":"Worlds","e":"worlds-2025-main-event"}],
		"recent":[{"date":"2025-11-09","g":"worlds-2025-main-event-finals-1","c":"Azir","k":4,"d":1,"a":8,"win":1,"opp":"KT Rolster","en":"Worlds 2025 Main Event","team":"T1"}]
	}`)

	write(filepath.Join("champ", "azir.json"), `{
		"name":"Azir","u":"azir","p":19273,"w":9478,"b":20360,"side":[10001,5280,9272,4198],
		"roles":[{"r":"Mid","p":19201}],
		"builds":{"since":"2025-11-17","g":1186,"items":[["Nashor's Tooth",1167,532]],"keys":[["Lethal Tempo",1020,470]],"spells":[["Flash + Teleport",1182,538]]},
		"matchups":{"Mid":[["Orianna",1702,866,1285,-21]]},
		"players":[{"n":"Faker","u":"faker","g":213,"w":151,"kda":3.88}],
		"years":[{"y":"2025","p":2500,"w":1237,"b":4151}],
		"recent":[{"date":"2025-11-09","g":"worlds-2025-main-event-finals-1","n":"Faker","u":"faker","team":"T1","opp":"KT Rolster","k":4,"d":1,"a":8,"win":1,"en":"Worlds 2025 Main Event"}]
	}`)

	write(filepath.Join("event", "worlds-2025-main-event.json"), `{
		"n":"Worlds 2025 Main Event","u":"worlds-2025-main-event","league":"LoL Champions Korea","lu":"lol-champions-korea",
		"region":"International","start":"2025-10-15","end":"2025-11-09","year":"2025","country":"China","type":"Offline","games":80,"series":40,
		"results":[{"p":"1","t":"T1","u":"t1","usd":1000000}],
		"teams":[{"t":"T1","u":"t1","g":20,"w":14,"sg":8,"sw":6}],
		"rosters":[{"t":"T1","u":"t1","r":"KR","p":[["Faker","faker","Mid","South Korea"]]}],
		"leaders":{"kda":[{"n":"Faker","u":"faker","t":"T1","g":20,"v":6.5}]},
		"champs":[{"c":"Azir","p":14,"w":7,"b":51}],
		"stages":[{"name":"Finals","series":[{"g":"worlds-2025-main-event-finals-1","a":"T1","au":"t1","b":"KT Rolster","bu":"","sa":3,"sb":2,"bo":5,"date":"2025-11-09","w":1}]}]
	}`)

	write(filepath.Join("league", "lol-champions-korea.json"), `{
		"l":"LoL Champions Korea","u":"lol-champions-korea","s":"LCK","region":"Korea","primary":true,
		"history":[{"l":"LoL The Champions","s":"OGN","u":"lol-the-champions","y":"2012-2015"},{"l":"LoL Champions Korea","s":"LCK","u":"lol-champions-korea","y":"2015-"}],
		"titles":[{"t":"T1","u":"t1","n":10}],
		"events":[{"n":"Worlds 2025 Main Event","u":"worlds-2025-main-event","st":"2025-10-15","en":"2025-11-09","g":80,"w":"T1","wu":"t1","y":"2025"}]
	}`)

	write(filepath.Join("game", "worlds-2025-main-event-finals-1.json"), `{
		"e":"worlds-2025-main-event","en":"Worlds 2025 Main Event","stage":"Finals","date":"2025-11-09 07:32","bo":5,
		"a":{"n":"T1","u":"t1","c":"T1"},"b":{"n":"KT Rolster","u":"kt-rolster","c":"KT"},"sa":3,"sb":2,"w":1,
		"games":[{"n":1,"w":1,"blue":"a","patch":"25.20","min":36.1,
			"t":{"blue":{"k":20,"picks":["Azir"],"bans":["Orianna"]},"red":{"k":10,"picks":["Orianna"],"bans":["Azir"]}},
			"p":[{"s":1,"r":"Mid","n":"Faker","u":"faker","c":"Azir","k":4,"d":1,"a":8,"cs":320,"gd":15000,"dm":24000,"ks":"Lethal Tempo"}]
		}]
	}`)

	// Force refresh onto updated TSV & JSON fixtures
	s.mu.Lock()
	s.version = ""
	s.checked = time.Time{}
	s.mu.Unlock()
	s.refresh()
	return s
}

func TestSSREntityEncyclopediaAndJSONLD(t *testing.T) {
	s := richTestSite(t)

	// 1. OpTic Gaming: title includes (OPT) LoL <= 65, full #root SSR roster linking Crown
	opt := get(s, "/riftwise/team/optic-gaming")
	b := opt.Body.String()
	for _, want := range []string{
		"<title>OpTic Gaming (OPT) LoL – stats, roster &amp; history | RiftWise</title>",
		`data-rw-ssr="1"`,
		`<a href="/player/crown">Crown</a>`,
		`"alternateName":["OpTic Gaming LoL","OPT","OPT LoL"]`,
		`"dissolutionDate":"2019-08-11"`,
	} {
		if !strings.Contains(b, want) {
			t.Errorf("optic-gaming missing %q", want)
		}
	}
	if strings.Count(b, "<h1") != 1 {
		t.Errorf("optic-gaming expected 1 <h1>, got %d", strings.Count(b, "<h1"))
	}

	// 2. T1: short code SKT + former name SK Telecom T1 in desc + WebP logo + athlete Person + canonical champ link Nunu & Willump
	t1 := get(s, "/riftwise/team/t1").Body.String()
	for _, want := range []string{
		"<title>T1 (SKT) LoL – stats, roster &amp; history | RiftWise</title>",
		`Formerly SK Telecom T1.`,
		`"logo":"https://riftwise.gg/stats/logos/t1.webp"`,
		`"url":"https://riftwise.gg/player/faker"`,
		`<a href="/champion/nunu-and-willump">Nunu &amp; Willump</a>`,
	} {
		if !strings.Contains(t1, want) {
			t.Errorf("t1 missing %q", want)
		}
	}
	if strings.Contains(t1, "nunu-and-willump-f8991") {
		t.Error("resolved duplicate hex champion slug instead of canonical")
	}

	// 3. Player Faker: real name, native name, birthDate, photo WebP, sameAs social profiles
	fk := get(s, "/riftwise/player/faker").Body.String()
	for _, want := range []string{
		"<title>Faker (T1) LoL – pro stats, champions &amp; career | RiftWise</title>",
		`"ProfilePage"`,
		`"birthDate":"1996-05-07"`,
		`"https://x.com/faker"`,
		`"https://www.sooplive.co.kr/station/leesh2148"`,
		`"image":"https://riftwise.gg/stats/photos/faker.webp"`,
		`<a href="/team/t1">T1</a>`,
	} {
		if !strings.Contains(fk, want) {
			t.Errorf("faker missing %q", want)
		}
	}

	// 4. Champion Azir: pro builds, matchups linking Orianna, players linking Faker
	az := get(s, "/riftwise/champion/azir").Body.String()
	for _, want := range []string{
		"<title>Azir LoL pro builds, counters, picks &amp; win rate | RiftWise</title>",
		"Nashor&#39;s Tooth",
		`<a href="/champion/orianna">Orianna</a>`,
		`<a href="/player/faker">Faker</a>`,
	} {
		if !strings.Contains(az, want) {
			t.Errorf("azir missing %q", want)
		}
	}

	// 5. Tournament, League & Match pages
	ev := get(s, "/riftwise/tournament/worlds-2025-main-event").Body.String()
	if !strings.Contains(ev, `"winner":{"@type":"SportsTeam","name":"T1"`) || !strings.Contains(ev, `Final Standings`) {
		t.Errorf("event SSR incomplete")
	}
	lg := get(s, "/riftwise/league/lol-champions-korea").Body.String()
	if !strings.Contains(lg, "<title>LoL Champions Korea (LCK) – seasons &amp; champions | RiftWise</title>") || !strings.Contains(lg, `"SportsOrganization"`) {
		t.Errorf("league SSR incomplete: %s", lg[:400])
	}
	gm := get(s, "/riftwise/match/worlds-2025-main-event-finals-1").Body.String()
	if !strings.Contains(gm, `Game 1 Scoreboard`) || !strings.Contains(gm, `"superEvent"`) {
		t.Errorf("game SSR incomplete")
	}

	// 6. Home SearchAction, /stats/data Dataset, localized Korean page + localized BreadcrumbList
	home := get(s, "/riftwise/").Body.String()
	for _, want := range []string{`"SearchAction"`, `https://riftwise.gg/?q={search_term_string}`, `Global Power Rankings`, `<a href="/team/t1">T1</a>`} {
		if !strings.Contains(home, want) {
			t.Errorf("home missing %q", want)
		}
	}
	data := get(s, "/riftwise/stats/data").Body.String()
	if !strings.Contains(data, `"@type":"Dataset"`) {
		t.Error("/stats/data missing Dataset JSON-LD")
	}
	ko := get(s, "/riftwise/ko/team/t1").Body.String()
	for _, want := range []string{
		`<html lang="ko">`,
		`<a href="/ko/player/faker">Faker</a>`,
		`"item":"https://riftwise.gg/ko/"`,
		`"item":"https://riftwise.gg/ko/stats/teams"`,
	} {
		if !strings.Contains(ko, want) {
			t.Errorf("ko/team/t1 missing %q", want)
		}
	}

	// 7. Team sub-tab SSR + OpenSearch + extended sitemaps
	t1m := get(s, "/riftwise/team/t1/matches").Body.String()
	if !strings.Contains(t1m, `Head-to-Head vs Opponents`) || !strings.Contains(t1m, `<a href="/stats/compare?teams=t1,optic-gaming">Compare</a>`) {
		t.Error("t1/matches SSR missing head-to-head")
	}
	osRec := httptest.NewRecorder()
	s.serveOpenSearchHTTPForTest(osRec)
	if osRec.Code != http.StatusOK || !strings.Contains(osRec.Body.String(), `<ShortName>RiftWise</ShortName>`) {
		t.Errorf("opensearch unexpected: %d %s", osRec.Code, osRec.Body.String())
	}
	idx := get(s, "/riftwise/sitemap.xml").Body.String()
	for _, want := range []string{"sitemap-tabs-1.xml", "sitemap-intl-1.xml"} {
		if !strings.Contains(idx, want) {
			t.Errorf("sitemap index missing %q", want)
		}
	}
	if !strings.Contains(get(s, "/riftwise/sitemap-tabs-1.xml").Body.String(), "https://riftwise.gg/team/optic-gaming/matches") {
		t.Error("sitemap-tabs missing optic-gaming/matches")
	}
	if !strings.Contains(get(s, "/riftwise/sitemap-intl-1.xml").Body.String(), "https://riftwise.gg/ko/team/optic-gaming") {
		t.Error("sitemap-intl missing /ko/team/optic-gaming")
	}
}

func TestCrawlBudgetSitemapFocus(t *testing.T) {
	s := richTestSite(t)
	hub := filepath.Join(s.site, "stats", "20261015000000", "hub")

	// Build a >50 team/player/game catalog to trigger production crawl-budget focusing.
	var teams strings.Builder
	teams.WriteString("aces-calm-mind\tAces Calm Mind | RiftWise\tAces Calm Mind: 10 pro games.\t1\n")
	teams.WriteString("los-ratones\tLos Ratones | RiftWise\tLos Ratones: 135 pro games.\t1\tLos Ratones summary.\n")
	teams.WriteString("karmine-corp\tKarmine Corp | RiftWise\tKarmine Corp: 572 pro games.\t1\tKC summary.\n")
	teams.WriteString("movistar-koi\tMovistar KOI | RiftWise\tMovistar KOI: 927 pro games.\t1\tMKOI summary.\n")
	for i := 0; i < 60; i++ {
		teams.WriteString("filler-team-" + string(rune('a'+i%26)) + string(rune('a'+i/26)) + "\tFiller | RiftWise\tFiller: 12 pro games.\t1\n")
	}
	if err := os.WriteFile(filepath.Join(hub, "seo", "team.tsv"), []byte(teams.String()), 0o644); err != nil {
		t.Fatal(err)
	}

	var games strings.Builder
	games.WriteString("ahugamannadeildin-2025-round-1-1\tObscure Match | RiftWise\tObscure.\t1\n")
	games.WriteString("worlds-2025-main-event-finals-1\tT1 vs KT | RiftWise\tT1 3-2 KT.\t1\n")
	for i := 0; i < 60; i++ {
		games.WriteString("hitpoint-2025-week-" + string(rune('a'+i%26)) + string(rune('a'+i/26)) + "\tMinor | RiftWise\tMinor.\t1\n")
	}
	if err := os.WriteFile(filepath.Join(hub, "seo", "game.tsv"), []byte(games.String()), 0o644); err != nil {
		t.Fatal(err)
	}

	s.mu.Lock()
	s.version = ""
	s.checked = time.Time{}
	s.mu.Unlock()
	s.refresh()

	teamMap := get(s, "/riftwise/sitemap-team-1.xml").Body.String()
	for _, want := range []string{"/team/los-ratones", "/team/karmine-corp", "/team/movistar-koi"} {
		if !strings.Contains(teamMap, want) {
			t.Errorf("sitemap-team missing featured org %q", want)
		}
	}
	if strings.Contains(teamMap, "aces-calm-mind") || strings.Contains(teamMap, "filler-team-aa") {
		t.Errorf("sitemap-team leaked low-game filler team")
	}

	gameMap := get(s, "/riftwise/sitemap-game-1.xml").Body.String()
	if !strings.Contains(gameMap, "/match/worlds-2025-main-event-finals-1") {
		t.Error("sitemap-game missing worlds-2025-main-event-finals-1")
	}
	if strings.Contains(gameMap, "ahugamannadeildin") || strings.Contains(gameMap, "hitpoint") {
		t.Error("sitemap-game leaked obscure regional match")
	}
	// Direct requests to non-sitemap match pages still return 200 OK.
	if w := get(s, "/riftwise/match/ahugamannadeildin-2025-round-1-1"); w.Code != http.StatusOK {
		t.Errorf("obscure match direct request returned %d, want 200", w.Code)
	}
}

func (s *store) serveOpenSearchHTTPForTest(w http.ResponseWriter) {
	serveOpenSearch(w)
}
