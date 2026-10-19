package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
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
	must(os.WriteFile(filepath.Join(hub, "alias.json"), []byte(`{"team": {"sk-telecom-t1": "t1"}, "league": {"worlds": "world-championship"}}`), 0o644))
	s := &store{site: dir, stats: filepath.Join(dir, "stats")}
	s.refresh()
	return s
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
		`<noscript><main><h1>T1 – stats | RiftWise</h1>`,
		`<a href="/player/faker">Faker</a>`,
		`<meta property="og:title" content="T1 – stats | RiftWise" />`,
		`<div id="root"></div>`,
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
