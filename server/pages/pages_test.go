package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"
)

const indexHTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="description"
      content="RiftWise: live scores."
    />
    <title>RiftWise</title>
    <link rel="canonical" href="https://riftwise.gg/" />
    <meta property="og:title" content="Site-wide" />
    <script type="application/ld+json">{"site":1}</script>
  </head>
  <body><div id="root"></div><noscript><p>site-wide</p></noscript></body>
</html>`

func testSite(t *testing.T) *store {
	dir := t.TempDir()
	must := func(err error) {
		if err != nil {
			t.Fatal(err)
		}
	}
	must(os.WriteFile(filepath.Join(dir, "index.html"), []byte(indexHTML), 0o644))
	hub := filepath.Join(dir, "stats", "20261015000000", "hub")
	must(os.MkdirAll(filepath.Join(hub, "seo"), 0o755))
	must(os.WriteFile(filepath.Join(dir, "stats", "latest.json"), []byte(`{"version": "20261015000000"}`), 0o644))
	files := map[string]string{
		"team":   "t1\tT1 – stats | RiftWise\tT1: 1,216-644 & more <b>\t1\nsmall-team\tSmall – stats | RiftWise\tFew games\t0\n",
		"player": "faker\tFaker – pro stats | RiftWise\tFaker, Mid for T1.\t1\n",
		"event":  "worlds-2025\tWorlds 2025 | RiftWise\tWorlds 2025.\t1\n",
		"game":   "worlds-2025-finals-1\tT1 vs KT | RiftWise\tT1 vs KT.\t1\n",
		"champ":  "ahri\tAhri in pro play | RiftWise\tAhri.\t1\n",
		"league": "lck\tLCK – every season | RiftWise\tLCK.\t1\n",
	}
	for k, v := range files {
		must(os.WriteFile(filepath.Join(hub, "seo", k+".tsv"), []byte(v), 0o644))
	}
	must(os.MkdirAll(filepath.Join(hub, "seo", "pages"), 0o755))
	must(os.WriteFile(filepath.Join(hub, "seo", "pages", "worlds.2025.json"), []byte(`{"title": "Worlds 2025: results | RiftWise", "desc": "T1 won Worlds 2025.", "html": "<h2>Final standings</h2><ol><li>T1</li></ol>", "ld": [{"@type": "SportsEvent", "name": "League of Legends World Championship 2025"}]}`), 0o644))
	must(os.WriteFile(filepath.Join(hub, "alias.json"), []byte(`{"team": {"sk-telecom-t1": "t1"}, "league": {"worlds": "world-championship"}}`), 0o644))
	// the push service's schedule: one finished and one coming Worlds match, one LCK match, a show without teams
	sched := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(testSchedule))
	}))
	t.Cleanup(sched.Close)
	scheduleURL = sched.URL
	schedCache.mu.Lock()
	schedCache.at, schedCache.events = time.Time{}, nil
	schedCache.mu.Unlock()
	s := &store{site: dir, stats: filepath.Join(dir, "stats")}
	s.refresh()
	return s
}

const testSchedule = `{"events": [
 {"startTime": "2026-10-24T13:00:00Z", "state": "completed", "type": "match", "blockName": "Swiss", "league": {"name": "Worlds", "slug": "worlds"},
  "match": {"teams": [{"name": "T1", "code": "T1", "result": {"gameWins": 1}}, {"name": "Dplus KIA", "code": "DK", "result": {"gameWins": 0}}], "strategy": {"count": 1}}},
 {"startTime": "2026-10-25T13:00:00Z", "state": "unstarted", "type": "match", "blockName": "Swiss", "league": {"name": "Worlds", "slug": "worlds"},
  "match": {"teams": [{"name": "Gen.G", "code": "GEN"}, {"name": "G2 Esports", "code": "G2"}], "strategy": {"count": 3}}},
 {"startTime": "2026-10-26T09:00:00Z", "state": "unstarted", "type": "match", "blockName": "Week 1", "league": {"name": "LCK", "slug": "lck"},
  "match": {"teams": [{"name": "Hanwha Life Esports", "code": "HLE"}, {"name": "KT Rolster", "code": "KT"}], "strategy": {"count": 3}}},
 {"startTime": "2026-10-25T12:00:00Z", "state": "inProgress", "type": "show", "league": {"name": "Worlds", "slug": "worlds"}, "match": {"teams": []}}
]}`

// The app's other tabs have pages of their own; the schedule and results carry the matches.
func TestTabPages(t *testing.T) {
	s := testSite(t)
	sch := get(s, "/riftwise/schedule").Body.String()
	for _, want := range []string{"<title>LoL esports schedule: today", "Gen.G vs G2 Esports (Bo3)", "Hanwha Life Esports vs KT Rolster", `"SportsEvent"`, `"BreadcrumbList"`, `<link rel="canonical" href="https://riftwise.gg/schedule" />`} {
		if !strings.Contains(sch, want) {
			t.Errorf("schedule: no %q", want)
		}
	}
	if strings.Contains(sch, "T1 1–0") {
		t.Error("schedule shows a result")
	}
	res := get(s, "/riftwise/results").Body.String()
	if !strings.Contains(res, "T1 1–0 Dplus KIA") || strings.Contains(res, "Gen.G vs") {
		t.Errorf("results: %s", res)
	}
	w := get(s, "/riftwise/schedule/worlds")
	if b := w.Body.String(); w.Code != 200 || !strings.Contains(b, "Worlds schedule: upcoming matches") || strings.Contains(b, "KT Rolster") {
		t.Errorf("worlds schedule %d: %s", w.Code, b)
	}
	if b := get(s, "/riftwise/schedule/nowhere").Body.String(); !strings.Contains(b, `content="noindex"`) {
		t.Error("a league with nothing on the schedule is indexed")
	}
	if b := get(s, "/riftwise/settings").Body.String(); !strings.Contains(b, `content="noindex"`) {
		t.Error("settings is indexed")
	}
	if w := get(s, "/riftwise/news/extra"); w.Code != http.StatusNotFound {
		t.Errorf("/news/extra: %d", w.Code)
	}
	if !strings.Contains(get(s, "/riftwise/sitemap-sections-1.xml").Body.String(), "<loc>https://riftwise.gg/schedule/lck</loc>") {
		t.Error("sitemap: no /schedule/lck")
	}
}

// Stats pages say where they sit (schema.org BreadcrumbList).
func TestBreadcrumbs(t *testing.T) {
	s := testSite(t)
	ev := get(s, "/riftwise/tournament/worlds-2025").Body.String()
	if !strings.Contains(ev, `"BreadcrumbList"`) || !strings.Contains(ev, `"name":"Tournaments"`) || !strings.Contains(ev, `"item":"https://riftwise.gg/tournament/worlds-2025"`) {
		t.Errorf("tournament crumbs: %s", ev)
	}
	if b := get(s, "/riftwise/stats/records").Body.String(); !strings.Contains(b, `"BreadcrumbList"`) {
		t.Error("section crumbs")
	}
	if b := get(s, "/riftwise/team/small-team").Body.String(); strings.Contains(b, "BreadcrumbList") {
		t.Error("crumbs on a noindex page")
	}
}

func get(s *store, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, path, nil)
	if strings.Contains(path, "sitemap") {
		s.sitemap(w, r)
	} else {
		s.serve(w, r)
	}
	return w
}

func TestPageGetsItsOwnTags(t *testing.T) {
	s := testSite(t)
	w := get(s, "/riftwise/team/t1")
	body := w.Body.String()
	if w.Code != 200 {
		t.Fatalf("status %d", w.Code)
	}
	for _, want := range []string{
		"<title>T1 – stats | RiftWise</title>",
		`<meta name="description" content="T1: 1,216-644 &amp; more &lt;b&gt;" />`,
		`<link rel="canonical" href="https://riftwise.gg/team/t1" />`,
		`<meta name="rw-stats" content="20261015000000" />`,
		`<meta property="og:image" content="https://riftwise.gg/og/team/t1.png" />`,
		`<meta name="twitter:card" content="summary_large_image" />`,
		`<meta name="twitter:title" content="T1 – stats | RiftWise" />`,
		`<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","about":{"@type":"SportsTeam","name":"T1","sport":"League of Legends esports"}`,
		`<div id="root"><h1 style="font:600 16px system-ui,sans-serif;color:#c8aa6e;margin:16px">T1 – stats</h1></div>`,
		`<noscript><main><p><strong>T1 – stats | RiftWise</strong></p>`,
		`<a href="/player/faker">Faker</a>`,
		`<meta property="og:title" content="T1 – stats | RiftWise" />`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %q in\n%s", want, body)
		}
	}
	if strings.Contains(body, "live scores") || strings.Contains(body, "noindex") {
		t.Error("old description or noindex left in")
	}
	if strings.Count(body, `rel="canonical"`) != 1 || strings.Contains(body, "Site-wide") || strings.Contains(body, `{"site":1}`) || strings.Contains(body, "site-wide") {
		t.Error("the site-wide canonical / og / JSON-LD / noscript of index.html left in")
	}
}

func TestThinPageIsNoindex(t *testing.T) {
	if !strings.Contains(get(testSite(t), "/riftwise/team/small-team").Body.String(), `content="noindex"`) {
		t.Error("expected noindex")
	}
}

func TestUnknownAndOldNames(t *testing.T) {
	s := testSite(t)
	if w := get(s, "/riftwise/player/nobody"); w.Code != 404 || !strings.Contains(w.Body.String(), `<div id="root">`) {
		t.Errorf("unknown player: %d", w.Code)
	}
	w := get(s, "/riftwise/team/sk-telecom-t1")
	if w.Code != 301 || w.Header().Get("Location") != "/team/t1" {
		t.Errorf("old team name: %d %q", w.Code, w.Header().Get("Location"))
	}
	w = get(s, "/riftwise/league/worlds")
	if w.Code != 301 || w.Header().Get("Location") != "/league/world-championship" {
		t.Errorf("league short name: %d %q", w.Code, w.Header().Get("Location"))
	}
	if w := get(s, "/riftwise/stats/tournaments/2019"); w.Code != 200 || !strings.Contains(w.Body.String(), "in 2019") {
		t.Errorf("tournaments of a year: %d", w.Code)
	}
	if w := get(s, "/riftwise/stats/worlds"); w.Code != 200 || !strings.Contains(w.Body.String(), "Worlds hub") {
		t.Errorf("worlds page: %d", w.Code)
	}
	if w := get(s, "/riftwise/stats/worlds/2024"); w.Code != 200 || !strings.Contains(w.Body.String(), "LoL Worlds 2024") {
		t.Errorf("worlds of a year: %d", w.Code)
	}
	if w := get(s, "/riftwise/stats/worlds/all"); w.Code != 200 || !strings.Contains(w.Body.String(), "every year") {
		t.Errorf("worlds every year: %d", w.Code)
	}
	if w := get(s, "/riftwise/stats/msi/2024"); w.Code != 200 || !strings.Contains(w.Body.String(), "LoL MSI 2024") {
		t.Errorf("msi of a year: %d", w.Code)
	}
	if w := get(s, "/riftwise/stats/first-stand"); w.Code != 200 || !strings.Contains(w.Body.String(), "First Stand hub") {
		t.Errorf("first stand: %d", w.Code)
	}
	if w := get(s, "/riftwise/stats/tournaments/all"); w.Code != 404 {
		t.Errorf("tournaments with all: %d", w.Code)
	}
	if w := get(s, "/riftwise/stats/worlds/next"); w.Code != 404 {
		t.Errorf("worlds with a word for a year: %d", w.Code)
	}
	if w := get(s, "/riftwise/league/lck"); w.Code != 200 || !strings.Contains(w.Body.String(), "<title>LCK – every season | RiftWise</title>") {
		t.Errorf("league page: %d", w.Code)
	}
	if w := get(s, "/riftwise/league/lck/2025"); w.Code != 200 || !strings.Contains(w.Body.String(), "<title>LCK 2025 season | RiftWise</title>") || !strings.Contains(w.Body.String(), "noindex") {
		t.Errorf("league season page: %d", w.Code)
	}
	if w := get(s, "/riftwise/league/worlds/2024"); w.Code != 301 || w.Header().Get("Location") != "/league/world-championship/2024" {
		t.Errorf("league short name with season: %d %q", w.Code, w.Header().Get("Location"))
	}
	if w := get(s, "/riftwise/league/lck/20x5"); w.Code != 404 {
		t.Errorf("league with a bad season: %d", w.Code)
	}
	if w := get(s, "/riftwise/about"); w.Code != 200 || !strings.Contains(w.Body.String(), "Dr. Monocle") {
		t.Errorf("about: %d", w.Code)
	}
	if w := get(s, "/riftwise/og/team/t1.png"); w.Code != 200 || w.Header().Get("Content-Type") != "image/png" || w.Body.Len() < 2000 {
		t.Errorf("og picture: %d %s %d bytes", w.Code, w.Header().Get("Content-Type"), w.Body.Len())
	}
	if w := get(s, "/riftwise/og/team/nobody.png"); w.Code != 404 {
		t.Errorf("og picture of an unknown team: %d", w.Code)
	}
	if w := get(s, "/riftwise/og/stats/records.png"); w.Code != 200 {
		t.Errorf("og picture of a section: %d", w.Code)
	}
	if w := get(s, "/riftwise/overlay"); w.Code != 200 || !strings.Contains(w.Body.String(), "noindex") {
		t.Errorf("overlay page: %d", w.Code)
	}
	if w := get(s, "/riftwise/stats/best"); w.Code != 200 || !strings.Contains(w.Body.String(), "best pro LoL games") {
		t.Errorf("best games: %d", w.Code)
	}
	if w := get(s, "/riftwise/stats/patches"); w.Code != 200 || !strings.Contains(w.Body.String(), "every patch") {
		t.Errorf("patches section: %d", w.Code)
	}
	if w := get(s, "/riftwise/stats/data"); w.Code != 200 || !strings.Contains(w.Body.String(), "CSV") {
		t.Errorf("data section: %d", w.Code)
	}
	if w := get(s, "/riftwise/stats/nope"); w.Code != 404 {
		t.Errorf("unknown section: %d", w.Code)
	}
}

// Worlds / MSI / First Stand pages carry the build's summary: title, description, the plain-HTML facts and schema.org data.
func TestIntlSummaries(t *testing.T) {
	s := testSite(t)
	body := get(s, "/riftwise/stats/worlds/2025").Body.String()
	for _, want := range []string{"<title>Worlds 2025: results | RiftWise</title>", "T1 won Worlds 2025.", "<h2>Final standings</h2>", `"SportsEvent"`} {
		if !strings.Contains(body, want) {
			t.Errorf("worlds 2025 page lacks %q", want)
		}
	}
	if strings.Contains(get(s, "/riftwise/stats/worlds/2024").Body.String(), "Final standings") {
		t.Error("a year without a summary got one")
	}
	if !strings.Contains(get(s, "/riftwise/sitemap-sections-1.xml").Body.String(), "<loc>https://riftwise.gg/stats/worlds/2025</loc>") {
		t.Error("worlds 2025 not in the sitemap")
	}
}

func TestSitemaps(t *testing.T) {
	s := testSite(t)
	idx := get(s, "/riftwise/sitemap.xml").Body.String()
	if !strings.Contains(idx, "<loc>https://riftwise.gg/sitemap-team-1.xml</loc>") || !strings.Contains(idx, "sitemap-game-1.xml") {
		t.Errorf("index: %s", idx)
	}
	teams := get(s, "/riftwise/sitemap-team-1.xml").Body.String()
	if !strings.Contains(teams, "<loc>https://riftwise.gg/team/t1</loc>") || strings.Contains(teams, "small-team") {
		t.Errorf("teams: %s", teams)
	}
	if !strings.Contains(get(s, "/riftwise/sitemap-sections-1.xml").Body.String(), "<loc>https://riftwise.gg/stats/records</loc>") {
		t.Error("sections sitemap")
	}
	if !strings.Contains(idx, "sitemap-league-1.xml") || !strings.Contains(get(s, "/riftwise/sitemap-league-1.xml").Body.String(), "<loc>https://riftwise.gg/league/lck</loc>") {
		t.Error("league sitemap")
	}
}

// A build from before league pages existed still loads (no league.tsv).
func TestOldBuildWithoutLeagues(t *testing.T) {
	s := testSite(t)
	os.Remove(filepath.Join(s.site, "stats", "20261015000000", "hub", "seo", "league.tsv"))
	s2 := &store{site: s.site, stats: s.stats}
	s2.refresh()
	if s2.version == "" {
		t.Fatal("build without league.tsv was rejected")
	}
	if w := get(s2, "/riftwise/team/t1"); w.Code != 200 {
		t.Errorf("team page: %d", w.Code)
	}
	if w := get(s2, "/riftwise/league/lck"); w.Code != 404 {
		t.Errorf("league page without data: %d", w.Code)
	}
}

// Titles fit in 65 characters: notes, then a generic tail, then the brand go first.
func TestFitTitle(t *testing.T) {
	cases := [][2]string{
		{"T1 – stats | RiftWise", "T1 – stats | RiftWise"},
		{"Worlds 2026: results, winner and stats – League of Legends World Championship | RiftWise", "Worlds 2026: results, winner and stats | RiftWise"},
		{"ACL eSports (Spanish Team) vs Guinea Pink Alpaca – Granada Gaming 23-24 Offline Qualifier Round 2 | RiftWise", "ACL eSports vs Guinea Pink Alpaca | RiftWise"},
		{"T1 vs Gen.G – Worlds 2025 Main Event Quarterfinals Day 3 of the knockout stage | RiftWise", "T1 vs Gen.G – Worlds 2025 Main Event Quarterfinals Day | RiftWise"},
		{"Northern League of Legends Championship 3rd Division – every season, champions and results | RiftWise", "Northern League of Legends Championship 3rd Division | RiftWise"},
		{"Granada Gaming 23-24 Offline Qualifier Round 2 Group Stage Day 1 Lower Bracket Finals | RiftWise", "Granada Gaming 23-24 Offline Qualifier Round 2 Group Stage Day 1…"},
	}
	for _, c := range cases {
		in, want := c[0], c[1]
		if got := fitTitle(in); got != want || utf8.RuneCountInString(got) > maxTitle {
			t.Errorf("fitTitle(%q) = %q (%d), want %q", in, got, utf8.RuneCountInString(got), want)
		}
	}
}

// IndexNow gets the pages a build added or changed (the sections after a restart).
func TestChangedPages(t *testing.T) {
	s := &store{}
	if got := s.changedPages(nil, nil); len(got) != len(sections) {
		t.Fatalf("first load: %d pages, want the %d sections", len(got), len(sections))
	}
	s.version = "1"
	s.pages = map[string]map[string]entry{"team": {"t1": {title: "T1", desc: "a", index: true}, "geng": {title: "Gen.G", desc: "b", index: true}}}
	next := map[string]map[string]entry{"team": {"t1": {title: "T1", desc: "a", index: true}, "geng": {title: "Gen.G", desc: "c", index: true}, "new": {title: "New", desc: "d", index: true}, "hidden": {title: "H", desc: "e"}}}
	got := s.changedPages(next, nil)
	if strings.Join(got, " ") != publicURL+"team/geng "+publicURL+"team/new" {
		t.Errorf("changed pages = %v", got)
	}
}

// Many cards drawn at once (crawlers do that) share the cached font faces without crashing.
func TestOgImageConcurrent(t *testing.T) {
	var wg sync.WaitGroup
	for i := 0; i < 24; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if len(ogImage("team", "Team "+strconv.Itoa(i)+" with a long name to wrap over lines", "A description that also wraps onto a second line.")) == 0 {
				t.Errorf("card %d: no image", i)
			}
		}(i)
	}
	wg.Wait()
}
